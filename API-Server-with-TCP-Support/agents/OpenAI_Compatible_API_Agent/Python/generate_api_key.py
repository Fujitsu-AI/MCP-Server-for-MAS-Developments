import argparse
import base64


def encrypt_api_key(login, password):
    """
    This is PoC code and methods should be replaced with a more secure way to deal with credentials (e.g. in a db)
    """
    login = login + ":" + password
    sample_string_bytes = login.encode("ascii")
    base64_bytes = base64.b64encode(sample_string_bytes)
    api_key = base64_bytes.decode("ascii")
    # Print the result so the user can copy the key
    print("Your API key is: " + api_key)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Login to MCP server and retrieve a token.")
    parser.add_argument("--email", required=True, help="Email address for login")
    parser.add_argument("--password", required=True, help="Password for login")
    args = parser.parse_args()
    encrypt_api_key(args.email, args.password)