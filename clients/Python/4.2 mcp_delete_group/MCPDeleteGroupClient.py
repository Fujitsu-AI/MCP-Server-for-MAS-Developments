import socket
import ssl
import json
import argparse

def send_delete_group_request(server_ip, server_port, token, group_name, use_ssl=True, accept_self_signed=False):
    """
    Sends a request to delete an existing group to the MCP server.

    :param server_ip: IP address of the MCP server
    :param server_port: Port number of the MCP server
    :param token: Authentication token
    :param group_name: Name of the group to delete
    :param use_ssl: Whether to use SSL/TLS for the connection
    :param accept_self_signed: Whether to accept self-signed certificates
    :return: Response from the server
    """
    # Prepare the request payload
    payload = {
        "command": "delete_group",
        "token": token,
        "arguments": {
            "groupName": group_name
        }
    }

    # Convert the payload to a JSON string
    payload_json = json.dumps(payload)
    
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
    # Argument parser for command-line arguments
    parser = argparse.ArgumentParser(description="Send a request to delete an existing group to the MCP server.")
    parser.add_argument("--server-ip", required=True, help="IP address of the MCP server")
    parser.add_argument("--server-port", required=True, type=int, help="Port number of the MCP server")
    parser.add_argument("--token", required=True, help="Authentication token")
    parser.add_argument("--group-name", required=True, help="Name of the group to delete")
    parser.add_argument("--use-ssl", action="store_true", help="Connect using SSL/TLS")
    parser.add_argument("--accept-self-signed", action="store_true", help="Accept self-signed certificates (disable certificate verification)")

    args = parser.parse_args()

    # Send the delete group request and print the response
    response = send_delete_group_request(
        args.server_ip,
        args.server_port,
        args.token,
        args.group_name,
        use_ssl=args.use_ssl,
        accept_self_signed=args.accept_self_signed
    )
    print("Response from server:", response)
