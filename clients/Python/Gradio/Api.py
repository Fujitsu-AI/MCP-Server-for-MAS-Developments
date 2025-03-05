import base64
import json

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def initialize_session(proxy_user, proxy_password, access_header):
    """Set up the session with proxy authentication."""
    session = requests.Session()
    session.verify = False
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    if access_header is not None:
        headers['X-Custom-Header'] = access_header
    elif proxy_user is not None and proxy_password is not None:
        auth = base64.b64encode(f"{proxy_user}:{proxy_password}".encode()).decode()
        headers['Authorization'] = f'Basic {auth}'
    session.headers.update(headers)
    return session


class PrivateGPTAPI:
    def __init__(self, config, client_api_key=None):
        """Initialize the chat client with proxy authentication."""
        self.token = None
        self.chat_id = None

        self.base_url = config.get("base_url")
        self.proxy_user = config.get("proxy_user", None)
        if self.proxy_user == "":
            self.proxy_user = None
        self.proxy_password = config.get("proxy_password", None)
        if self.proxy_password == "":
            self.proxy_password = None
        self.access_header = config.get("access_header", None)
        if self.access_header == "":
            self.access_header = None

        self.chosen_groups = config.data["groups"] or []
        self.language = config.get("language", "en")
        self.use_public = config.get("use_public", True)
        self.whitelist_keys = config.get("whitelist_keys", [])
        self.logged_in = False
        self.email =  config.get("email", "")
        self.password = config.get("password", "")


        self.session = initialize_session(self.proxy_user, self.proxy_password, self.access_header)


    def login(self):
        """Authenticate the user and retrieve the token."""
        url = f"{self.base_url}/login"
        payload = {"email": self.email, "password": self.password}
        try:
            response = self.session.post(url, json=payload)
            print(response.content)
            response.raise_for_status()
            data = response.json()
            self.token = data['data']['token']

            # Prüfen, ob der Header bereits existiert
            if 'Authorization' in self.session.headers:
                self.session.headers['Authorization'] += f', Bearer {self.token}'
            else:
                self.session.headers['Authorization'] = f'Bearer {self.token}'
            self.chat_id = None
            print("✅ Login successful.")
            return True
        except requests.exceptions.RequestException as e:
            print(f"❌ Login failed: {e}")
        return False

    def create_chat(self, user_input):
        """Start a new chat session.

        This method sends a POST request to the '/chats' endpoint with the provided parameters.
        It initializes a new chat session and stores the chat ID for future use.
        """
        url = f"{self.base_url}/chats"
        payload = {
            "language": self.language,
            "question": user_input,  # Initial question to start the chat
            "usePublic": self.use_public,
            "groups": self.chosen_groups
        }
        try:
            response = self.session.post(url, json=payload)
            response.raise_for_status()  # Raise an exception if the response was not successful
            data = response.json()
            self.chat_id = data['data']['chatId']  # Store the chat ID for future use
            print("✅ Chat initialized.")
            resp = response.json()
            try:
                answer = resp.get('data', None).get('answer', "error")
            except:
                print(response.json())
                resp = {"data":
                            {"answer": "error"}
                        }
                answer = "error"

            if answer.startswith("{\"role\":"):
                answerj = json.loads(answer)
                resp["data"]["answer"] = answerj["content"]
                resp["data"]["chatId"] = "0"

            print(f"💡 Response: {answer}")
            return resp
        except requests.exceptions.RequestException as e:
            # It seems we get disconnections from time to time..
            # print(f"⚠️ Failed to get response on first try, trying again..: {e}")
            try:
                response = self.session.patch(url, json=payload)
                response.raise_for_status()
                data = response.json()
                answer = data.get('data', {}).get('answer', "No answer provided.")
                print(f"💡 Response: {answer}")
                return data
            except:
                print(f"❌ Failed to get response: {e}")
                return {"error": f"❌ Failed to get response: {e}"}

    def query_private_gpt(self, user_input) -> json:
        """Send a question to the chat and retrieve the response."""
        if not self.chat_id:
            print("❌ Chat session not initialized.")
            return False
        url = f"{self.base_url}/chats/{self.chat_id}"
        payload = {"question": user_input}
        try:
            response = self.session.patch(url, json=payload)
            # response.raise_for_status()
            resp = response.json()
            try:
                answer = resp.get('data', None).get('answer', "error")
            except:
                print(response.json())
                resp = {"data":
                            {"answer": "error"}
                        }
                answer = "error"

            if answer.startswith("{\"role\":"):
                answerj = json.loads(answer)
                resp["data"]["answer"] = answerj["content"]
                resp["data"]["chatId"] = "0"

            print(f"💡 Response: {answer}")
            return resp
        except requests.exceptions.RequestException as e:
            # It seems we get disconnections from time to time..
            # print(f"⚠️ Failed to get response on first try, trying again..: {e}")
            try:
                response = self.session.patch(url, json=payload)
                response.raise_for_status()
                data = response.json()
                answer = data.get('data', {}).get('answer', "No answer provided.")
                print(f"💡 Response: {answer}")
                return data
            except:
                print(f"❌ Failed to get response: {e}")
                return {"error": f"❌ Failed to get response: {e}"}

    def get_document_info(self, source_id):
        """Send a source id to retrieve details. Working with version 1.3.3 and newer"""
        url = f"{self.base_url}/sources/{source_id}"
        try:
            response = self.session.get(url)
            data = response.json()
            info = data.get('data', {})
            print(f"💡 Response: {str(info)}")
            return data
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to get response: {e}")
            return {"error": f"❌ Failed to get response: {e}"}
