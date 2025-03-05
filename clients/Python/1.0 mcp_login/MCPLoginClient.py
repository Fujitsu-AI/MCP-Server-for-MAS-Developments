#!/usr/bin/env python3
import socket
import ssl
import json
import argparse

def send_request(server_ip, server_port, payload, use_ssl=True, accept_self_signed=False):
    """
    Sends a generic request to the server.
    If use_ssl is True, an SSL/TLS connection will be established.
    If accept_self_signed is True, self-signed certificates will be accepted.
    """
    payload_json = json.dumps(payload)
    
    # Initialize variables here so they are visible in the finally block
    raw_socket = None
    client_socket = None

    try:
        # Create a raw socket
        raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_socket.settimeout(10)

        # Establish SSL/TLS connection if requested
        if use_ssl:
            context = ssl.create_default_context()
            if accept_self_signed:
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
            # Wrap socket in SSL context
            client_socket = context.wrap_socket(raw_socket, server_hostname=server_ip)
        else:
            # Unencrypted connection
            client_socket = raw_socket

        # Connect to the server
        client_socket.connect((server_ip, server_port))

        # Send request (with newline as delimiter)
        client_socket.sendall((payload_json + "\n").encode("utf-8"))

        # Receive response; stop after first line or if recv() returns empty
        response = b""
        while True:
            part = client_socket.recv(4096)
            if not part:
                # Server closed connection or no more data received
                break
            response += part
            # Stop if a newline is detected
            if b'\n' in part:
                break

        # Return response as JSON
        return json.loads(response.decode("utf-8").strip())
    
    except ssl.SSLError:
        return {"status": "error", "message": "Connection failed: server and client may require TLS encryption. Please enable SSL/TLS."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

    finally:
        # Ensure the connection is closed properly
        if client_socket is not None:
            try:
                # Shutdown signals that no further data will be sent/received
                client_socket.shutdown(socket.SHUT_RDWR)
            except:
                pass  # Ignore error if already closed
            client_socket.close()

def login(server_ip, server_port, email, password, use_ssl=True, accept_self_signed=False):
    """
    Performs login and returns the full response.
    """
    payload = {
        "command": "login",
        "arguments": {
            "email": email,
            "password": password
        }
    }
    response = send_request(server_ip, server_port, payload, use_ssl, accept_self_signed)
    return response

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Login to the MCP server and receive a token.")
    parser.add_argument("--server-ip", required=True, help="IP address of the MCP server")
    parser.add_argument("--server-port", required=True, type=int, help="Port number of the MCP server")
    parser.add_argument("--email", required=True, help="Email address for login")
    parser.add_argument("--password", required=True, help="Password for login")
    parser.add_argument("--use-ssl", action="store_true", help="Connect using SSL/TLS")
    parser.add_argument("--accept-self-signed", action="store_true",
                        help="Accept self-signed certificates (disable certificate verification)")

    args = parser.parse_args()

    try:
        print("🔐 Logging in...")
        response = login(
            args.server_ip,
            args.server_port,
            args.email,
            args.password,
            use_ssl=args.use_ssl,
            accept_self_signed=args.accept_self_signed
        )
        print("✅ Server Response:")
        print(json.dumps(response, indent=4))
    except Exception as e:
        print("❌ ERROR:", e)
