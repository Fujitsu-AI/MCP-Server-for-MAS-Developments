import socket
import ssl
import json
import logging
import time
from .language import languages

class NetworkError(Exception):
    pass

class NetworkClient:
    def __init__(
        self, server_ip, server_port, language="en",
        retries=3, delay=5, use_ssl=True, accept_self_signed=True
    ):
        self.server_ip = server_ip
        self.server_port = server_port
        self.retries = retries
        self.delay = delay
        self.use_ssl = use_ssl
        self.accept_self_signed = accept_self_signed
        self.language = language if language in languages else "en"
        self.lang = languages[self.language]

    def get_lang_message(self, key, **kwargs):
        """
        Secure method to retrieve messages from the language dictionary.
        Returns a default message if the key does not exist.
        """
        message = self.lang.get(key, "Message not defined.")
        utf8_encoded_string = bytes(message, 'utf-8')
        message = str(utf8_encoded_string, 'utf-8')
        try:
            return message.format(**kwargs)
        except KeyError as e:
            logging.error(f"Missing placeholder in language file for key '{key}': {e}")
            return message

    def send_request(self, payload):
        payload_json = json.dumps(payload)
        #logging.info(f"Prepared payload: {payload_json}")

        for attempt in range(1, self.retries + 1):
            client_socket = None
            try:
                raw_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                raw_socket.settimeout(30)
                
                logging.info(
                    self.get_lang_message(
                        "connecting_to_server",
                        ip=self.server_ip,
                        port=self.server_port,
                        attempt=attempt,
                        retries=self.retries
                    )
                )
                
                # SSL/TLS initialisieren (falls gewünscht)
                if self.use_ssl:
                    context = ssl.create_default_context()
                    if self.accept_self_signed:
                        context.check_hostname = False
                        context.verify_mode = ssl.CERT_NONE
                    client_socket = context.wrap_socket(raw_socket, server_hostname=self.server_ip)
                else:
                    client_socket = raw_socket
                
                # Verbinden
                client_socket.connect((self.server_ip, self.server_port))
                logging.info(self.get_lang_message("connection_established"))
                
                # Anfrage senden
                #logging.info(
                #    self.get_lang_message(
                #        "sending_payload",
                #        payload=payload_json
                #    )
                #)
                client_socket.sendall((payload_json + '\n').encode("utf-8"))
                
                # Alle Daten empfangen, bis Server von sich aus schließt oder Timeout
                response = b""
                while True:
                    try:
                        part = client_socket.recv(4096)
                        if not part:
                            # Keine Daten mehr -> Server hat Verbindung geschlossen
                            break
                        response += part
                    except socket.timeout:
                        # Wenn wir hier sicher sind, dass keine weiteren Daten mehr kommen,
                        # kann man das Lesen beenden. Oder retry. Je nach Protokoll.
                        logging.warning(self.get_lang_message("connection_timed_out"))
                        break
                
                decoded = response.decode("utf-8").strip()
                #logging.info(f"Received response: {decoded}")
                
                if not decoded:
                    raise ValueError("Empty response received")

                # JSON parsen
                try:
                    parsed_response = json.loads(decoded)
                    logging.info(
                        self.get_lang_message("formatted_response"),
                        extra={"data": parsed_response}
                    )
                    
                    if "data" in parsed_response and "personalGroups" in parsed_response["data"]:
                        personal_groups = parsed_response["data"]["personalGroups"]
                        logging.info(
                            self.get_lang_message("personal_groups_received", groups=personal_groups)
                        )
                    
                    # Erfolgreich -> Socket normal schließen und Ergebnis zurückgeben
                    client_socket.close()
                    return parsed_response

                except json.JSONDecodeError:
                    logging.error(self.get_lang_message("invalid_json_response"))
                    raise NetworkError(self.get_lang_message("invalid_json_response"))
            
            except socket.timeout:
                logging.warning(self.get_lang_message("connection_timed_out"))
            except Exception as e:
                logging.error(
                    self.get_lang_message(
                        "connection_error",
                        error=str(e)
                    )
                )
            
            # Bei Misserfolg (und wenn noch Versuche übrig): warten, neu versuchen
            if attempt < self.retries:
                logging.info(
                    self.get_lang_message(
                        "retrying_in_seconds",
                        delay=self.delay
                    )
                )
                time.sleep(self.delay)
            
            # Socket schließen (wenn noch offen), kein shutdown(SHUT_RDWR) verwenden
            if client_socket is not None:
                try:
                    client_socket.close()
                except:
                    pass
        
        # Nach allen Versuchen fehlgeschlagen
        logging.error(self.get_lang_message("all_retries_failed"))
        raise NetworkError(self.get_lang_message("all_retries_failed"))
