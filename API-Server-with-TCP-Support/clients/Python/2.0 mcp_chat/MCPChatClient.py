import socket
import ssl
import json
import argparse
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')


def send_mcp_request(server_ip, server_port, token, question, use_public, groups=None, language="de", use_ssl=True, accept_self_signed=False):
    """
    Sends a question to an MCP server and retrieves the response.

    :param server_ip: IP address of the MCP server
    :param server_port: Port number of the MCP server
    :param token: Authentication token for the MCP server
    :param question: The question to send
    :param use_public: Whether to use the public knowledge base
    :param groups: List of groups for retrieval-augmented generation
    :param language: Language code for the request
    :param use_ssl: Whether to use SSL/TLS for the connection
    :param accept_self_signed: Whether to accept self-signed certificates
    :return: Response from the server
    """
    # Prepare the request payload
    payload = {
        "command": "chat",
        "token": token,
        "arguments": {
            "question": question,
            "usePublic": use_public,
            "groups": groups or [],
            "language": language
        }
    }

    # Convert the payload to a JSON string
    payload_json = json.dumps(payload)
    
    # Initialize socket variables
    raw_socket = None
    client_socket = None

    try:
        # Create a socket object
        raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_socket.settimeout(10)

        # Establish SSL/TLS connection if required
        if use_ssl:
            context = ssl.create_default_context()
            if accept_self_signed:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            client_socket = context.wrap_socket(raw_socket, server_hostname=server_ip)
        else:
            client_socket = raw_socket
        
        # Connect to the server
        client_socket.connect((server_ip, server_port))

        # Send the request
        client_socket.sendall(payload_json.encode('utf-8'))

        # Receive the response
        response = b""
        while True:
            part = client_socket.recv(4096)
            if not part:
                break
            response += part

        # Decode the response
        return json.loads(response.decode('utf-8'))

    except ssl.SSLError:
        return {"status": "error", "message": "Connection failed: Server and/or Client may require TLS encryption. Please enable SSL/TLS."}
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
    parser = argparse.ArgumentParser(description="Send a question to the MCP server and retrieve the response.")
    parser.add_argument("--server-ip", required=True, help="IP address of the MCP server")
    parser.add_argument("--server-port", required=True, type=int, help="Port number of the MCP server")
    parser.add_argument("--token", required=True, help="Authentication token")
    parser.add_argument("--question", required=True, help="The question to ask the MCP server")
    parser.add_argument("--use-public", action="store_true", help="Use the public knowledge base")
    parser.add_argument("--groups", nargs="*", help="List of groups for retrieval-augmented generation", default=[])
    parser.add_argument("--language", default="de", help="Language code for the request (default: 'de')")
    parser.add_argument("--use-ssl", action="store_true", help="Connect using SSL/TLS")
    parser.add_argument("--accept-self-signed", action="store_true", help="Accept self-signed certificates (disable certificate verification)")

    args = parser.parse_args()

    # Send the question to the MCP server
    response = send_mcp_request(
        server_ip=args.server_ip,
        server_port=args.server_port,
        token=args.token,
        question=args.question,
        use_public=args.use_public,
        groups=args.groups,
        language=args.language,
        use_ssl=args.use_ssl,
        accept_self_signed=args.accept_self_signed
    )

    print("Response from server:", json.dumps(response, indent=2, ensure_ascii=False))
