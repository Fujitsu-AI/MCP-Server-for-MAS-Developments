# agent.py

import logging
import json
import atexit
from .network import NetworkClient, NetworkError
from .color import Color
from .language import languages

class GroupValidationError(Exception):
    pass

class PrivateGPTAgent:
    def __init__(self, config):
        self.mcp_config = config.get("mcp_server")
        self.mcp_host = self.mcp_config.get("host")
        self.mcp_port = self.mcp_config.get("port")
        
        self.email = config.get("email")
        self.password = config.get("password")
        self.chosen_groups = config.get("groups", [])
        self.language = config.get("language", "en")

        if self.language not in languages:
            self.language = "en"
            logging.warning(f"Unsupported language. Fallback to English.")

        self.lang = languages[self.language]

        # Initialize new MCP Network Client
        # Note: Assuming config has use_ssl or defaults to False
        use_ssl = self.mcp_config.get("use_ssl", False)
        
        self.network_client = NetworkClient(
            self.mcp_host, 
            self.mcp_port, 
            language=self.language,
            use_ssl=use_ssl
        )
        self.token = None

        atexit.register(self.logout)

        # Login and setup
        if self.login():
            # Get groups via MCP tool
            self.allowed_groups = self.list_personal_groups()
            
            # Validate groups
            invalid = self.validate_groups(self.chosen_groups)
            if invalid:
                print(self.lang["invalid_group"].format(groups=invalid), flush=True)
                raise GroupValidationError(str(invalid))
        else:
            self.allowed_groups = []

        self.knowledge_base = {
            "What is AI?": self.lang["knowledge_ai"],
            "Who created Python?": self.lang["knowledge_python"],
            "What is Machine Learning?": self.lang["knowledge_ml"]
        }

    def get_lang_message(self, key, **kwargs):
        message = self.lang.get(key, "Message not defined.")
        try:
            return message.format(**kwargs)
        except Exception:
            return message

    def validate_groups(self, groups):
        if groups is None:
            return []
        invalid = [g for g in groups if g not in self.allowed_groups]
        if invalid:
            logging.error(self.get_lang_message("group_validation_error", error=invalid))
            return invalid
        return []

    def login(self):
        payload = {
            "email": self.email,
            "password": self.password
        }
        logging.info(self.get_lang_message("login_attempt"))
        try:
            # MCP TOOL CALL: login
            result = self.network_client.call_tool("login", payload)
            
            # Ergebnis parsen (kann JSON-Dict oder Error-Dict mit Rohtext sein)
            parsed_data = self._parse_mcp_content(result)
            
            # FALL 1: Standard JSON Antwort { "data": { "token": "..." } }
            if isinstance(parsed_data, dict) and "data" in parsed_data and "token" in parsed_data["data"]:
                self.token = parsed_data["data"]["token"]
                logging.info(self.get_lang_message("login_success"))
                return True

            # FALL 2: Server sendet Token als reinen Text (wird vom Parser als "error" markiert)
            # Wir prüfen, ob der Text wie ein Token aussieht (enthält Pipe '|' und ist kein Fehlertext)
            if isinstance(parsed_data, dict) and parsed_data.get("status") == "error":
                raw_text = parsed_data.get("message", "").strip()
                # Ein Token ist normalerweise lang und hat das Format 'ID|HASH'
                if "|" in raw_text and len(raw_text) > 10 and "error" not in raw_text.lower():
                    self.token = raw_text
                    logging.info(self.get_lang_message("login_success"))
                    return True

            # FALL 3: Parser hat direkt einen String zurückgegeben (falls er quoted war)
            if isinstance(parsed_data, str):
                if "|" in parsed_data and len(parsed_data) > 10:
                    self.token = parsed_data
                    logging.info(self.get_lang_message("login_success"))
                    return True

            # Fehlgeschlagen
            msg = parsed_data.get("message", "Login failed") if isinstance(parsed_data, dict) else str(parsed_data)
            logging.error(self.get_lang_message("login_failed", message=msg))
            return False

        except NetworkError as e:
            logging.error(self.get_lang_message("login_failed", message=str(e)))
            return False

    def list_personal_groups(self):
        if not self.token:
            return []

        try:
            # MCP TOOL CALL: list_groups
            result = self.network_client.call_tool("list_groups", {
                "token": self.token
            })
            
            parsed_data = self._parse_mcp_content(result)
            
            # Navigate structure based on Node Server: res.data.data.personalGroups
            if parsed_data and "data" in parsed_data:
                # Sometimes it might be directly in data, or nested depending on API
                # Based on server.js: res.data.data or res.data
                inner_data = parsed_data["data"]
                if "personalGroups" in inner_data:
                    groups = inner_data["personalGroups"]
                    logging.info(self.lang["personal_groups"].format(groups=groups))
                    return groups
                
            return []
        except NetworkError as e:
            logging.error(self.lang["list_groups_failed"].format(message=str(e)))
            return []

    def query_private_gpt(self, prompt, use_public=False, language="en", groups=None, _retry_on_token_expired=True):
        if not self.token:
            return json.dumps({"error": self.get_lang_message("authentication_failed")})

        if groups is None:
            groups = self.chosen_groups
        relevant_groups = [g for g in groups if g in self.allowed_groups]

        try:
            # MCP TOOL CALL: chat
            # Note: Server expects 'question', 'language', 'usePublic', 'groups'
            args = {
                "token": self.token,
                "question": prompt,
                "language": language,
                "usePublic": use_public,
                "groups": relevant_groups
            }
            
            result = self.network_client.call_tool("chat", args)
            parsed_data = self._parse_mcp_content(result)

            # Check for Token Expiry inside the response data
            # (Assuming the API returns 401/403 equivalent in the message body if failed)
            if parsed_data and isinstance(parsed_data, dict):
                status = parsed_data.get("status")
                message = parsed_data.get("message", "").lower()
                
                if status in [401, 403] or "token expired" in message:
                     if _retry_on_token_expired:
                        logging.warning("Token expired, refreshing...")
                        self.token = None
                        if self.login():
                            return self.query_private_gpt(prompt, use_public, language, groups, False)
                        else:
                            return json.dumps({"error": "Re-login failed"})

                # Success case
                # API usually returns { content: { answer: "..." } } or similar
                # Adjust based on exact PGPT API response.
                if "content" in parsed_data and "answer" in parsed_data["content"]:
                    return json.dumps({"answer": parsed_data["content"]["answer"]})
                
                # Fallback if structure is flat or different
                if "answer" in parsed_data:
                     return json.dumps({"answer": parsed_data["answer"]})

            return json.dumps({"answer": str(parsed_data)})

        except NetworkError as e:
            return json.dumps({"error": str(e)})

    def logout(self):
        if not self.token:
            return

        try:
            self.network_client.call_tool("logout", {"token": self.token})
            logging.info(self.get_lang_message("logout_success"))
            self.token = None
            self.network_client.close()
        except NetworkError:
            pass

    def _parse_mcp_content(self, result):
        """
        Helper to extract JSON from MCP TextContent.
        robuste Version: Falls kein JSON drin ist, wird der Text als Message zurückgegeben.
        """
        try:
            if "content" in result and isinstance(result["content"], list):
                # Extrahiere den Text-Teil
                text_content = result["content"][0].get("text", "")
                
                # Versuch 1: Ist es valides JSON?
                try:
                    return json.loads(text_content)
                except json.JSONDecodeError:
                    # Fallback: Es ist kein JSON, sondern wahrscheinlich eine Fehlermeldung vom Server
                    # (z.B. "API Error: 401 Unauthorized" oder "500...")
                    logging.warning(f"⚠️ Server returned raw text (not JSON): {text_content}")
                    return {"message": text_content, "status": "error", "data": {}}
                    
        except Exception as e:
            logging.error(f"Failed to parse MCP content structure: {e}")
        
        # Falls gar nichts klappt, gib das Original zurück
        return result

    def respond(self, user_input, groups=None):
        response = self.knowledge_base.get(user_input, None)
        if response:
            return json.dumps({"answer": response})
        else:
            return self.query_private_gpt(user_input, groups=groups)

    def run(self):
        # (Same as original run method)
        if not self.token:
            print(self.get_lang_message("authentication_failed"), flush=True)
            return

        print(f"{Color.OKGREEN}{self.get_lang_message('welcome')}{Color.ENDC}", flush=True)
        
        while True:
            try:
                user_input = input(f"{Color.OKBLUE}{self.get_lang_message('user_question')}{Color.ENDC}")
                if user_input.strip().lower() == "exit":
                    print(f"{Color.OKGREEN}{self.get_lang_message('goodbye')}{Color.ENDC}", flush=True)
                    break
                elif not user_input.strip():
                    continue

                result = self.respond(user_input)
                parsed_result = json.loads(result)
                if "answer" in parsed_result:
                    print(f"{Color.OKGREEN}{self.get_lang_message('agent_answer', answer=parsed_result['answer'])}{Color.ENDC}", flush=True)
                else:
                    print(f"{Color.FAIL}{self.get_lang_message('agent_error', error=parsed_result.get('error'))}{Color.ENDC}", flush=True)
            except (KeyboardInterrupt, EOFError):
                break
