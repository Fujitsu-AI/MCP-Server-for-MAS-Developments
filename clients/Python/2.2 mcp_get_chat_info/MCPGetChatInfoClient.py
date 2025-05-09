import socket
import ssl
import json
import argparse

def send_request(server_ip, server_port, payload, use_ssl=True, accept_self_signed=False):
    """
    Sends a generic request to the server.
    """
    payload_json = json.dumps(payload)
    
    raw_socket = None
    client_socket = None
    
    try:
        raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_socket.settimeout(10)

        if use_ssl:
            context = ssl.create_default_context()
            if accept_self_signed:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            client_socket = context.wrap_socket(raw_socket, server_hostname=server_ip)
        else:
            client_socket = raw_socket
        
        client_socket.connect((server_ip, server_port))
        client_socket.sendall(payload_json.encode('utf-8'))

        response = b""
        while True:
            part = client_socket.recv(4096)
            if not part:
                break
            response += part

        return json.loads(response.decode('utf-8'))
    except ssl.SSLError:
        return {"status": "error", "message": "Connection failed: Server and/or client may require TLS encryption. Please enable SSL/TLS."}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    finally:
        if client_socket is not None:
            try:
                client_socket.shutdown(socket.SHUT_RDWR)
            except:
                pass
            client_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Retrieve information about an existing conversation.")
    parser.add_argument("--server-ip", required=True, help="IP address of the MCP server")
    parser.add_argument("--server-port", required=True, type=int, help="Port number of the MCP server")
    parser.add_argument("--token", required=True, help="Authentication token")
    parser.add_argument("--chat-id", required=True, help="ID of the conversation")
    parser.add_argument("--use-ssl", action="store_true", help="Connect using SSL/TLS")
    parser.add_argument("--accept-self-signed", action="store_true", help="Accept self-signed certificates (disable certificate verification)")

    args = parser.parse_args()

    payload = {
        "command": "get_chat_info",
        "token": args.token,
        "arguments": {
            "chatId": args.chat_id
        }
    }

    print("📤 Sending request...")
    response = send_request(args.server_ip, args.server_port, payload, use_ssl=args.use_ssl, accept_self_signed=args.accept_self_signed)
    print("✔️ Response:", json.dumps(response, indent=2))