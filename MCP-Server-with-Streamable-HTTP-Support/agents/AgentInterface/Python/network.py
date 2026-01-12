import requests
import json
import logging
import time
import threading
import uuid
from .language import languages

class NetworkError(Exception):
    pass

class NetworkClient:
    def __init__(
        self, server_ip, server_port, language="en",
        retries=3, delay=5, use_ssl=False, accept_self_signed=True
    ):
        # Determine protocol
        protocol = "https" if use_ssl else "http"
        self.base_url = f"{protocol}://{server_ip}:{server_port}"
        
        self.retries = retries
        self.delay = delay
        self.language = language if language in languages else "en"
        self.lang = languages[self.language]
        
        # SSL Config
        self.verify_ssl = not (use_ssl and accept_self_signed)
        if not self.verify_ssl:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        # MCP State
        self.session_id = None
        self.post_endpoint = None
        self.pending_requests = {}
        self.listening = False
        self.thread = None
        
        # Connect immediately
        self.connect()

    def get_lang_message(self, key, **kwargs):
        message = self.lang.get(key, "Message not defined.")
        try:
            return message.format(**kwargs)
        except Exception:
            return message

    def connect(self):
        """Initializes the SSE connection to the MCP server."""
        url = f"{self.base_url}/sse"
        logging.info(f"Connecting to MCP SSE Stream at {url}...")
        
        try:
            self.session = requests.Session()
            # timeout=(Connect-Timeout, Read-Timeout)
            # Read-Timeout = None bedeutet: Wir warten unendlich lange auf Events (wichtig für SSE!)
            response = self.session.get(url, stream=True, verify=self.verify_ssl, timeout=(5, None))
            response.raise_for_status()
            
            # Start background listener
            self.listening = True
            self.thread = threading.Thread(target=self._listen_sse, args=(response,), daemon=True)
            self.thread.start()
            
            # Wait briefly for the 'endpoint' event to populate self.post_endpoint
            attempts = 0
            while self.post_endpoint is None and attempts < 20:
                time.sleep(0.1)
                attempts += 1
                
            if self.post_endpoint:
                logging.info(self.get_lang_message("connection_established"))
            else:
                logging.warning("Connected to SSE, but no endpoint received yet.")

        except Exception as e:
            logging.error(self.get_lang_message("connection_error", error=str(e)))
            raise NetworkError(f"Could not connect to MCP server: {e}")

    def _listen_sse(self, response):
        """Background thread to process Server-Sent Events."""
        client = response.iter_lines()
        try:
            for line in client:
                if not self.listening: 
                    break
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith("event: endpoint"):
                        # Next line is data
                        continue
                    if decoded_line.startswith("data: "):
                        data_str = decoded_line[6:]
                        try:
                            # Handling the initial handshake endpoint
                            # If it's a relative URL (standard MCP SSE), it's the endpoint
                            if data_str.startswith("/") or data_str.startswith("http"):
                                self.post_endpoint = data_str.strip()
                                logging.debug(f"MCP Endpoint set to: {self.post_endpoint}")
                                continue
                            
                            # Handling JSON-RPC Responses
                            data = json.loads(data_str)
                            
                            # Check if it matches a pending request ID
                            req_id = data.get("id")
                            if req_id in self.pending_requests:
                                self.pending_requests[req_id]["response"] = data
                                self.pending_requests[req_id]["event"].set()
                                
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            logging.error(f"SSE Listener crashed: {e}")
            self.listening = False

    def call_tool(self, tool_name, arguments):
        """Sends a JSON-RPC 2.0 request to call a tool."""
        if not self.post_endpoint:
             # Try reconnecting if endpoint is missing
            self.connect()
            if not self.post_endpoint:
                raise NetworkError("No MCP endpoint available. Connection lost?")

        request_id = str(uuid.uuid4())
        
        # JSON-RPC 2.0 Payload for MCP
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": request_id
        }

        # Handle relative endpoints from server
        target_url = self.post_endpoint
        if target_url.startswith("/"):
            target_url = f"{self.base_url}{target_url}"

        # Setup Future/Event to wait for response
        event = threading.Event()
        self.pending_requests[request_id] = {"event": event, "response": None}

        try:
            # Send POST
            # logging.info(f"Calling Tool: {tool_name}")
            resp = self.session.post(target_url, json=payload, verify=self.verify_ssl)
            resp.raise_for_status()
            
            # Wait for response via SSE (timeout 60s)
            if event.wait(timeout=60):
                full_response = self.pending_requests[request_id]["response"]
                del self.pending_requests[request_id]
                
                if "error" in full_response:
                    raise NetworkError(f"MCP Error: {full_response['error']['message']}")
                
                return full_response.get("result", {})
            else:
                del self.pending_requests[request_id]
                raise NetworkError("Timeout waiting for MCP tool response")

        except Exception as e:
            logging.error(self.get_lang_message("connection_error", error=str(e)))
            raise NetworkError(str(e))

    def close(self):
        self.listening = False
        if self.session:
            self.session.close()
