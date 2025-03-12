import json
import socket
import ssl


def delete_source(self, source_id, use_ssl=False, accept_self_signed=False):
    """
    Sends a request to the MCP server to delete an existing source.

    :param server_ip: IP address of the MCP server
    :param server_port: Port number of the MCP server
    :param token: Authorization token
    :param source_id: ID of the source to delete
    :param use_ssl: Whether to use SSL/TLS for the connection
    :param accept_self_signed: Whether to accept self-signed certificates
    :return: Response from the server
    """
    payload = {
        "command": "delete_source",
        "token": self.token,
        "arguments": {
            "sourceId": source_id
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
            client_socket = context.wrap_socket(raw_socket, server_hostname=self.server_ip)
        else:
            client_socket = raw_socket

        client_socket.connect((self.server_ip, self.server_port))
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


def send_list_sources_request(self, group_name, use_ssl=False, accept_self_signed=False):
    """
    Sends a request to list sources in a specific group to the MCP server.

    :param server_ip: IP address of the MCP server
    :param server_port: Port number of the MCP server
    :param token: Authentication token
    :param group_name: Name of the group to list sources from
    :param use_ssl: Whether to use SSL/TLS for the connection
    :param accept_self_signed: Whether to accept self-signed certificates
    :return: Response from the server
    """
    payload = {
        "command": "list_sources",
        "token": self.token,
        "attributes": {
            "groupName": group_name
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
            client_socket = context.wrap_socket(raw_socket, server_hostname=self.server_ip)
        else:
            client_socket = raw_socket

        client_socket.connect((self.server_ip, self.server_port))
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


def send_create_source_request(self, name, content, groups, use_ssl=False,
                               accept_self_signed=False):
    """
    Sends a request to create a new source to the MCP server.

    :param server_ip: IP address of the MCP server
    :param server_port: Port number of the MCP server
    :param token: Authentication token
    :param name: Name of the new source
    :param content: Content to be formatted as markdown
    :param groups: List of groups to assign the source to
    :param use_ssl: Whether to use SSL/TLS for the connection
    :param accept_self_signed: Whether to accept self-signed certificates
    :return: Response from the server
    """
    payload = {
        "command": "create_source",
        "token": self.token,
        "arguments": {
            "name": name,
            "content": content,
            "groups": groups or []
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
            client_socket = context.wrap_socket(raw_socket, server_hostname=self.server_ip)
        else:
            client_socket = raw_socket

        # Connect to the server
        client_socket.connect((self.server_ip, self.server_port))

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