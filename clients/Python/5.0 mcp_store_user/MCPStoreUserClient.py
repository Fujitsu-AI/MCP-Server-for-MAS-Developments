import socket
import ssl
import json
import argparse
import sys

def send_store_user_request(server_ip, server_port, token, name, email, password, language, timezone, roles, groups, usePublic, activateFtp, ftpPassword, use_ssl=True, accept_self_signed=False):
    """
    Sends a request to create a new user on the MCP server.
    """
    payload = {
        "command": "store_user",
        "token": token,
        "arguments": {
            "name": name,
            "email": email,
            "password": password,
            "language": language,
            "timezone": timezone,
            "roles": roles,
            "groups": groups,
            "usePublic": usePublic,
            "activateFtp": activateFtp,
            "ftpPassword": ftpPassword
        }
    }

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

        return response.decode('utf-8')
    except ssl.SSLError:
        return "Error: Server and/or client may require TLS encryption. Please enable SSL/TLS."
    except Exception as e:
        return f"Error: {e}"
    
    finally:
        if client_socket is not None:
            try:
                client_socket.shutdown(socket.SHUT_RDWR)
            except:
                pass
            client_socket.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Send a request to create a new user on the MCP server.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--server-ip", required=True, help="IP address of the MCP server")
    parser.add_argument("--server-port", required=True, type=int, help="Port number of the MCP server")
    parser.add_argument("--token", required=True, help="Authentication token")
    parser.add_argument("--name", required=True, help="Name of the user")
    parser.add_argument("--email", required=True, help="Email of the user")
    parser.add_argument("--password", required=True, help="Password for the user")
    parser.add_argument("--language", default="en", help="Language code (optional)")
    parser.add_argument("--timezone", default="Europe/Berlin", help="Timezone (optional)")
    parser.add_argument("--roles", nargs="+", default=[], help="Roles for the user (optional)")
    parser.add_argument("--groups", nargs="+", default=[], help="Groups for the user (optional)")
    parser.add_argument("--usePublic", action="store_true", help="Use the public knowledge base")
    parser.add_argument("--activateFtp", action="store_true", help="Activate FTP for the user")
    parser.add_argument("--ftpPassword", default="", help="FTP password for the user (optional)")
    parser.add_argument("--use-ssl", action="store_true", help="Connect using SSL/TLS")
    parser.add_argument("--accept-self-signed", action="store_true", help="Accept self-signed certificates (disable certificate verification)")

    if len(sys.argv) == 1:
        parser.print_help(sys.stderr)
        sys.exit(1)

    args = parser.parse_args()

    response = send_store_user_request(
        args.server_ip,
        args.server_port,
        args.token,
        args.name,
        args.email,
        args.password,
        args.language,
        args.timezone,
        args.roles,
        args.groups,
        args.usePublic,
        args.activateFtp,
        args.ftpPassword,
        use_ssl=args.use_ssl,
        accept_self_signed=args.accept_self_signed
    )
    print("Response from server:", response)
