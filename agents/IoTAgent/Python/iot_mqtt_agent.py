# iot_mqtt_agent.py

import paho.mqtt.client as mqtt
import logging
import json
from datetime import datetime
import os
import paramiko
import shutil
import argparse
import posixpath  # For remote paths
import requests  # For communication with the chatbot agent
import sys
import time
import warnings
from .language import languages  # Correct import statement
from ...AgentInterface.Python.color import Color
import socket  # For display_startup_header
import platform  # For display_startup_header

# Prometheus-Imports
from prometheus_client import Counter, Histogram, make_wsgi_app
from wsgiref.simple_server import make_server, WSGIRequestHandler
import threading

# ───────────────────────────────────────────────────────────────
# Constant column widths for clean formatting
# ───────────────────────────────────────────────────────────────
TIMESTAMP_WIDTH  = 20
COMPONENT_WIDTH  = 16
TAG_WIDTH        = 10
MESSAGE_WIDTH    = 12
LABEL_WIDTH      = 30  # Uniform width for "Received message on topic" etc.
TOPIC_WIDTH      = 40
PARAMETER_WIDTH  = 35
VALUE_WIDTH      = 15
STATUS_WIDTH     = 8
RESPONSE_WIDTH   = 40

# Function to format text with a fixed width
def format_text(text: str, width: int, align: str = "<") -> str:
    """
    Brings the text to a fixed width and aligns it (left '<', right '>').
    """
    return f"{text:{align}{width}}"[:width]

# ───────────────────────────────────────────────────────────────
# Custom Logging Formatter (Emoji + uniform column widths)
# ───────────────────────────────────────────────────────────────
class CustomFormatter(logging.Formatter):
    LEVEL_ICONS = {
        'DEBUG': '🐛',
        'INFO': 'ℹ️',
        'WARNING': '⚠️',
        'ERROR': '❌',
        'CRITICAL': '‼️'
    }

    def format(self, record):
        record.level_icon = self.LEVEL_ICONS.get(record.levelname, record.levelname)
        record.component = format_text(getattr(record, "component", "iot"), COMPONENT_WIDTH)
        record.tag = format_text(getattr(record, "tag", "-"), TAG_WIDTH)
        record.message_type = format_text(getattr(record, "message_type", "-"), MESSAGE_WIDTH)

        log_format = "{asctime} | {level_icon} {component} :{tag} | {message_type} | {message}"
        return log_format.format(
            asctime=self.formatTime(record, "%Y-%m-%d %H:%M:%S"),
            level_icon=record.level_icon,
            component=record.component,
            tag=record.tag,
            message_type=record.message_type,
            message=record.getMessage()
        )

def setup_logging(logging_config):
    level_name = logging_config.get("level", "INFO")
    log_level = getattr(logging, level_name.upper(), logging.INFO)

    formatter = CustomFormatter()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    # basicConfig is only called once before logging is used.
    logging.basicConfig(level=log_level, handlers=[handler])

if __name__ == "__main__":
    setup_logging({"level": "DEBUG"})
    # From now on, all subsequent logging calls will use the custom formatter.
    # Rest of the code...

# Temporary filtering of DeprecationWarning (as a transitional solution)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# Global variable for the current language
current_language = "en"

# ───────────────────────────────────────────────────────────────
# Prometheus Metriken definieren
# ───────────────────────────────────────────────────────────────
# Zählt eingehende MQTT-Nachrichten
MQTT_MESSAGE_COUNT = Counter(
    "mqtt_message_count",
    "Number of MQTT messages received by IoT agent"
)

# Misst die Bearbeitungszeit (Sekunden) in on_message
MQTT_MESSAGE_LATENCY = Histogram(
    "mqtt_message_latency_seconds",
    "Time spent processing each MQTT message"
)

# --------------------------------------------
# Custom WSGI RequestHandler for Prometheus
# -> Logs every scrape request
# --------------------------------------------
class LoggingWSGIRequestHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        # Erzeugt einen INFO-Logeintrag pro Request
        logging.info(
            'Prometheus request: ' + format % args,
            extra={"component": "metrics", "tag": "scrape", "message_type": "Incoming"}
        )

# Class for handling userdata
class UserData:
    def __init__(self, handlers, config):
        self.handlers = handlers
        self.config = config

# Function to load the configuration
def load_config(config_path, current_language):
    try:
        with open(config_path, 'r', encoding='utf-8') as config_file:
            config = json.load(config_file)
        return config
    except Exception as e:
        message = languages[current_language]["error_loading_config"].format(e=e)
        logging.error(message)
        sys.exit(1)

# Callback function for connection setup (adapted for MQTT v5)
def on_connect(client, userdata, flags, rc, properties=None):
    global current_language
    if rc == 0:
        logging.info(
            "Connected to MQTT broker",
            extra={"component": "mqtt", "tag": "connect", "message_type": "Status"}
        )
        client.subscribe(userdata.config['mqtt']['topic'])
        subscribed_message = f"Subscribed to {userdata.config['mqtt']['topic']}."
        logging.info(Color.color_text(subscribed_message, Color.OKBLUE))
    else:
        logging.error(
            f"Failed to connect, return code {rc}",
            extra={"component": "mqtt", "tag": "connect", "message_type": "Error"}
        )

# Callback function for incoming messages (adapted)
def on_message(client, userdata, msg):
    global current_language
    start_time = time.time()  # Für Latenzmessung

    try:
        timestamp = datetime.now().isoformat()
        parameter = msg.topic.split('/')[-1]
        payload = msg.payload.decode('utf-8')

        try:
            value = json.loads(payload) if payload.startswith('{') else payload
        except json.JSONDecodeError:
            value = payload

        record = {
            "timestamp": timestamp,
            "vehicle": userdata.config['mqtt']['vehicle_name'],
            "parameter": parameter,
            "value": value
        }

        flabel = "Received message on topic"
        ftopic = msg.topic
        fparam = parameter
        fvalue = payload.strip()

        logging.info(
            f"{flabel} | {ftopic} | Parameter: {fparam} | Value: {fvalue}",
            extra={"component": "mqtt", "tag": "message", "message_type": "Incoming"}
        )

        # Erhöhe Zähler
        MQTT_MESSAGE_COUNT.inc()

        # Speichern
        userdata.handlers['json'].append_record(record)

        interpret_and_output(record, userdata.handlers, userdata.config)

        logging.info(
            f"{ftopic} | Parameter: {fparam} | Value: {fvalue}",
            extra={"component": "chatbot_agent", "tag": "request", "message_type": "Outgoing"}
        )

    except Exception as e:
        error_message = languages[current_language]["error_in_interpret_and_output"].format(e=e)
        logging.error(error_message)
    finally:
        latency = time.time() - start_time
        MQTT_MESSAGE_LATENCY.observe(latency)


class LocalFileHandler:
    """
    This class manages local files with dynamic, timestamp-based names.
    It ensures that each file has a unique timestamp and a 5-digit counter in its name.
    """

    def __init__(self, base_name, local_dir, file_type, size_limit, remote_subdir, config, language_code):
        """
        Initializes the FileHandler.

        :param base_name: Base name of the file (e.g. 'mqtt.json', 'translated_text_de.txt')
        :param local_dir: Local directory where the files will be saved
        :param file_type: Type of file ('json', 'txt')
        :param size_limit: Size limit in bytes
        :param remote_subdir: Remote subdirectory on the SFTP server
        :param config: Entire configuration data
        :param language_code: Language code (e.g. 'de', 'en')
        """
        self.base_name = base_name
        self.local_dir = local_dir
        self.file_type = file_type
        self.size_limit = size_limit
        self.remote_subdir = remote_subdir
        self.config = config
        self.language_code = language_code
        self.current_file_path = self._create_new_file()

    def _create_new_file(self):
        """
        Creates a new local file with a timestamp and a counter.

        :return: Path to the newly created file
        """
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")  # Format: YYYYMMDDHHMMSS
        if self.file_type == "json":
            suffix = "JSON"
        else:
            suffix = self.language_code.upper()
        prefix = f"{self.config['files']['base_filename']}-{suffix}-"
        full_prefix = f"{prefix}{timestamp}-"
        counter = self._get_next_suffix(full_prefix)
        if counter is None:
            error_message = languages[current_language]["cannot_create_new_file"].format(file_type=self.file_type, language=self.language_code)
            logging.error(error_message)
            return None
        extension = "json" if self.file_type == "json" else "txt"
        filename = f"{full_prefix}{counter}.{extension}"
        file_path = os.path.join(self.local_dir, filename)
        os.makedirs(self.local_dir, exist_ok=True)
        if self.file_type == "json":
            with open(file_path, 'w', encoding='utf-8') as file:
                json.dump([], file, ensure_ascii=False, indent=4)
        message = languages[current_language]["new_file_created"].format(file_path=file_path)
        logging.info(message)
        return file_path

    def _get_next_suffix(self, full_prefix):
        """
        Determines the next available 5-digit suffix.

        :param full_prefix: Complete prefix including timestamp
        :return: 5-digit suffix as a string or None if none are available
        """
        try:
            # Connect to SFTP to determine existing suffixes
            transport = paramiko.Transport((self.config['sftp']['host'], self.config['sftp']['port']))
            transport.connect(username=self.config['sftp']['username'], password=self.config['sftp']['password'])
            sftp = paramiko.SFTPClient.from_transport(transport)
            remote_base_dir = posixpath.join(self.config['sftp']['remote_path'], self.remote_subdir)
            try:
                sftp.chdir(remote_base_dir)
                existing_files = sftp.listdir(remote_base_dir)
            except IOError:
                existing_files = []
            sftp.close()
            transport.close()

            suffixes = []
            for file in existing_files:
                if file.startswith(full_prefix):
                    suffix_part = file[len(full_prefix):].split('.')[0]
                    if suffix_part.isdigit() and len(suffix_part) == 5:
                        suffixes.append(int(suffix_part))

            for i in range(100000):
                if i not in suffixes:
                    return f"{i:05}"

            logging.error(languages[current_language]["error_getting_suffixes"].format(e="All suffixes are occupied."))
            return None
        except Exception as e:
            error_message = languages[current_language]["error_getting_suffixes"].format(e=e)
            logging.error(error_message)
            return None

    def append_record(self, record):
        """
        Adds a data record to the JSON file.

        :param record: The data record to store (dictionary)
        """
        if self.file_type != "json":
            error_message = languages[current_language]["invalid_group"].format(groups=self.file_type)
            logging.error(error_message)
            return

        try:
            if not self.current_file_path:
                error_message = languages[current_language]["error_writing_file"].format(file_path=self.current_file_path, e="File path is not set.")
                logging.error(error_message)
                return

            with open(self.current_file_path, 'r+', encoding='utf-8') as file:
                try:
                    data = json.load(file)
                except json.JSONDecodeError:
                    data = []
                    warning_message = languages[current_language]["file_empty_or_corrupted"].format(file_path=self.current_file_path)
                    logging.warning(Color.color_text(warning_message, Color.WARNING))
                data.append(record)
                file.seek(0)
                json.dump(data, file, indent=4, ensure_ascii=False)
                file.truncate()
            record_added_message = languages[current_language]["record_added"].format(file_path=self.current_file_path)
            logging.info(
                f"{record_added_message}",
                extra={"component": "iot", "tag": "filesystem", "message_type": "write"}
            )

            self._check_size_and_rotate()
        except Exception as e:
            error_message = languages[current_language]["error_writing_file"].format(file_path=self.current_file_path, e=e)
            logging.error(error_message)

    def append_text(self, text):
        """
        Appends text to the text file.

        :param text: The text to store (string)
        """
        if self.file_type != "txt":
            error_message = languages[current_language]["invalid_group"].format(groups=self.file_type)
            logging.error(error_message)
            return

        try:
            if not self.current_file_path:
                error_message = languages[current_language]["error_writing_file"].format(file_path=self.current_file_path, e="File path is not set.")
                logging.error(error_message)
                return

            with open(self.current_file_path, 'a', encoding='utf-8') as file:
                file.write(text + '\n')
            logging.info(
                f"{text}",
                extra={"component": "iot", "tag": "filesystem", "message_type": "write"}
            )

            self._check_size_and_rotate()
        except Exception as e:
            error_message = languages[current_language]["error_writing_file"].format(file_path=self.current_file_path, e=e)
            logging.error(error_message)

    def _check_size_and_rotate(self):
        """
        Checks the file size and rotates the file if the limit is reached.
        """
        global current_language
        try:
            if not self.current_file_path:
                return
            file_size = os.path.getsize(self.current_file_path)
            if file_size >= self.size_limit:
                logging.info(languages[current_language]["file_limit_reached"].format(file_path=self.current_file_path, size_limit=self.size_limit))
                success = upload_file(self.current_file_path, self.file_type, self.remote_subdir, self.config)
                if success:
                    archive_file(self.current_file_path)
                    self.current_file_path = self._create_new_file()
        except Exception as e:
            error_message = languages[current_language]["error_writing_file"].format(file_path=self.current_file_path, e=e)
            logging.error(error_message)

# Generic function for SFTP file transfer with a new naming scheme
def upload_file(file_path, file_type, remote_subdir, config):
    """
    Transfers a file via SFTP with a timestamp and a 5-digit suffix in the filename.

    :param file_path: Path to the local file
    :param file_type: Type of file ('json', 'txt')
    :param remote_subdir: Remote subdirectory on the SFTP server
    :param config: Entire configuration data
    :return: True on success, False on error
    """
    global current_language
    try:
        uploading_message = languages[current_language]["start_uploading_file"].format(file_path=file_path)
        #logging.debug(uploading_message)
        transport = paramiko.Transport((config['sftp']['host'], config['sftp']['port']))
        transport.connect(username=config['sftp']['username'], password=config['sftp']['password'])
        sftp = paramiko.SFTPClient.from_transport(transport)

        # Remote directory including subdirectory
        remote_base_dir = posixpath.join(config['sftp']['remote_path'], remote_subdir)
        try:
            sftp.chdir(remote_base_dir)
            directory_exists_message = languages[current_language]["remote_directory_exists"].format(remote_base_dir=remote_base_dir)
            #logging.debug(directory_exists_message)
        except IOError:
            sftp.mkdir(remote_base_dir)
            sftp.chdir(remote_base_dir)
            directory_created_message = languages[current_language]["remote_directory_created"].format(remote_base_dir=remote_base_dir)
            #logging.debug(directory_created_message)

        # Determine the base filename without suffix
        # Since the local filename already has the timestamp and suffix, use it directly
        remote_file_name = os.path.basename(file_path)
        remote_file_path = posixpath.join(remote_base_dir, remote_file_name)

        # Transfer the file
        sftp.put(file_path, remote_file_path)
        upload_success_message = languages[current_language]["file_uploaded_successfully"].format(
            file_path=file_path, host=config['sftp']['host'], remote_file_path=remote_file_path)
        logging.info(upload_success_message)

        # Close the SFTP connection
        sftp.close()
        transport.close()
        finished_uploading_message = languages[current_language]["finished_uploading_file"].format(file_path=file_path)
        #logging.debug(finished_uploading_message)
        return True
    except Exception as e:
        error_message = languages[current_language]["error_sftp_upload"].format(file_path=file_path, e=e)
        logging.error(error_message)
        return False

# Function to archive the file after transfer
def archive_file(file_path):
    global current_language
    try:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        archive_name = f"{os.path.splitext(file_path)[0]}_{timestamp}{os.path.splitext(file_path)[1]}"
        shutil.move(file_path, archive_name)
        archive_message = languages[current_language]["file_archived"].format(file_path=file_path, archive_name=archive_name)
        logging.info(archive_message)
    except Exception as e:
        error_message = languages[current_language]["error_archiving_file"].format(file_path=file_path, e=e)
        logging.error(error_message)

# Function to generate a logical sentence via the chatbot agent with a retry mechanism
def generate_logical_sentence(parameters, language_code, config, wait_seconds=5):
    """
    Sends the parameters to the chatbot agent in the form of a FIPA-ACL request and receives a logical sentence.
    If a FIPA-ACL failure message is received (e.g. due to connection problems), it is logged that
    the chatbot agent reports a problem and the IoT agent waits until an OK answer is received.
    Once an OK answer is received, it is also logged that the problem has been resolved.
    """
    while True:
        try:
            # Create the prompt from the parameters
            prompt = (
                "Create a logical sentence from the following JSON parameters:\n" +
                json.dumps(parameters, ensure_ascii=False, indent=4)
            )

            # Build the FIPA-ACL request
            acl_payload = {
                "performative": "request",
                "sender": "IoT_MQTT_Agent",
                "receiver": "Chatbot_Agent",
                "language": "fipa-sl",
                "ontology": "fujitsu-iot-ontology",
                "content": {
                    "question": prompt,
                    "usePublic": True,
                    "groups": [],
                    "language": language_code
                }
            }

            headers = {
                "Content-Type": "application/json",
                "X-API-KEY": config['chatbot_agent']['api_key']
            }

            response = requests.post(
                config['chatbot_agent']['api_url'],
                json=acl_payload,
                headers=headers,
                timeout=10
            )
            data = response.json()

            status_code = response.status_code
            data = response.json()  # Attempt to parse the JSON response
            response_text = json.dumps(data, ensure_ascii=False, indent=2)  # For logging

            # Uniform formatting
            flabel = format_text("Chatbot API Response", LABEL_WIDTH)

            # Extract only the content of the "answer" key, if present
            answer_text = data.get("answer", "No answer received").strip('"')

            logging.info(
                f"{answer_text}",
                extra={"component": "chatbot_agent", "tag": "response", "message_type": "Incoming"}
            )

            # Check if the chatbot agent sends a failure
            if data.get("performative") == "failure":
                reason = data.get("content", {}).get("reason", "Unknown reason.")
                # Shorten or remove duplicates in the message:
                reason_short = reason.replace("Could not connect to MCP server: ", "")
                # Limit overly long messages to e.g. 80 characters:
                max_len = 80
                if len(reason_short) > max_len:
                    reason_short = reason_short[:max_len] + "..."

                error_msg = f"ChatBot Agent reports a problem: {reason_short}. Waiting for recovery..."
                logging.error(error_msg)
                time.sleep(wait_seconds)
                continue

            # If no failure is present, the expected sentence is taken from the "answer" field.
            generated_sentence = data.get("answer", "")
            if not generated_sentence:
                raise ValueError("Empty 'answer' field in normal response.")

            # Log that an OK was received and the problem is resolved.
            ok_msg = "OK response received. Stable connection."
            logging.info(ok_msg)

            return generated_sentence

        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, ValueError) as e:
            # e might contain [WinError 10061], etc.
            # We shorten the string as needed:
            e_str = str(e)
            max_len = 80
            if len(e_str) > max_len:
                e_str = e_str[:max_len] + "..."
            logging.error(f"Error during request: {e_str}. Waiting for retry...")
            time.sleep(wait_seconds)
        except Exception as e:
            logging.error(f"Unexpected error: {e}. Waiting for retry...")
            time.sleep(wait_seconds)

# Function to generate readable sentences based on configured languages
def interpret_and_output(record, local_handlers, config):
    global current_language
    try:
        try:
            timestamp = datetime.fromisoformat(record["timestamp"]).strftime("%d-%m-%Y at %H:%M:%S")
        except ValueError:
            # If format is incorrect, just take the original
            timestamp = record["timestamp"]
            warning_message = languages[current_language]["file_empty_or_corrupted"].format(file_path=record["timestamp"])
            logging.warning(warning_message)

        vehicle = record.get("vehicle", "Unknown vehicle")
        parameter = record.get("parameter", "unknown")
        value = record.get("value", "not available")

        # Iterate over the configured languages
        for language_code in config.get("languages", ["de", "en"]):
            if language_code not in config['files']['translated_text_files']:
                error_message = languages[current_language]["no_translation_file_configured"].format(language=language_code)
                logging.error(error_message)
                continue

            # Define parameters based on the language
            if language_code == "de":
                parameters = {
                    "Zeitpunkt": timestamp,
                    "Fahrzeug": vehicle,
                    "Parameter": parameter,
                    "Wert": value
                }
            elif language_code == "en":
                parameters = {
                    "Timestamp": timestamp,
                    "Vehicle": vehicle,
                    "Parameter": parameter,
                    "Value": value
                }
            else:
                warning_message = languages[current_language]["unknown_language"].format(language=language_code)
                logging.warning(warning_message)
                continue

            # Generate the sentence
            generated_sentence = generate_logical_sentence(parameters, language_code, config)

            if generated_sentence:
                # Determine the full language name
                if language_code == "de":
                    language_full = "German"
                elif language_code == "en":
                    language_full = "English"
                else:
                    language_full = language_code.upper()

                # Log and display the sentence
                sentence_message = languages[current_language]["language_sentence_generated"].format(
                    language_full=language_full, sentence=generated_sentence
                )
                logging.info(
                    f"{generated_sentence}",
                    extra={"component": "chatbot_agent", "tag": "sentence_message", "message_type": "Incoming"}
                )

                # Store the sentence in the corresponding text file
                handler_key = f"{language_code}_txt"
                if handler_key in local_handlers:
                    local_handlers[handler_key].append_text(generated_sentence)
                else:
                    file_handler_error_message = languages[current_language]["no_file_handler_found"].format(language=language_code)
                    logging.error(file_handler_error_message)
            else:
                # Determine the full language name
                if language_code == "de":
                    language_full = "German"
                elif language_code == "en":
                    language_full = "English"
                else:
                    language_full = language_code.upper()
                no_sentence_message = languages[current_language]["no_sentence_generated"].format(language_full=language_full)
                logging.warning(no_sentence_message)
    except Exception as e:
        error_message = languages[current_language]["error_in_interpret_and_output"].format(e=e)
        logging.error(error_message)

def display_startup_header(config):
    global current_language
    api_url = config.get("chatbot_agent", {}).get("api_url", "http://0.0.0.0:5001/ask")
    try:
        server_ip = api_url.split("//")[-1].split(":")[0]
        server_port = api_url.split(":")[-1].split("/")[0]
    except IndexError:
        server_ip = "0.0.0.0"
        server_port = "5001"

    api_key = config.get("chatbot_agent", {}).get("api_key", "default_api_key")
    api_key_status = "✔️ Set" if api_key != "default_api_key" else "❌ Not Set"

    header = f"""
────────────────────────────────────────────────
Fujitsu PrivateGPT MQTT IoT Agent - Startup
────────────────────────────────────────────────
System Information:
- Hostname      : {socket.gethostname()}
- Operating Sys : {platform.system()} {platform.release()}
- Python Version: {platform.python_version()}

Server Configuration:
- API Endpoint  : {api_url}
- API Key Status: {api_key_status}

Logs:
- Agent Log     : iot_agent.log
────────────────────────────────────────────────
🚀 Ready to serve requests!
"""
    print(header)
    logging.info("Startup header displayed.", extra={"component": "Startup", "tag": "HEADER", "message_type": "Info"})

def main():
    global current_language  # Global variable for the current language

    parser = argparse.ArgumentParser(description="MQTT to JSON and sentence generation with SFTP transfer.")
    parser.add_argument('--config', type=str, default='pgpt_iot_agent.json', help='Path to the JSON configuration file.')
    args = parser.parse_args()

    # Temporarily load the config to get the language
    try:
        with open(args.config, 'r', encoding='utf-8') as config_file:
            temp_config = json.load(config_file)
    except Exception:
        sys.exit(1)

    languages_list = temp_config.get("languages", ["en"])
    current_language = languages_list[0] if languages_list else "en"

    # Load the configuration
    config = load_config(args.config, current_language)

    # Logging
    log_level = getattr(logging, config['logging'].get('level', 'INFO').upper(), logging.INFO)
    log_format = config['logging'].get('format', '%(asctime)s - %(levelname)s - %(message)s')
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("iot_agent.log", encoding='utf-8')
        ]
    )

    # Start Prometheus (custom WSGI) in extra Thread
    def start_prometheus_if_configured(cfg):
        if 'metrics' in cfg and 'port' in cfg['metrics']:
            prom_port = cfg['metrics']['port']
            logging.info(f"Starting Prometheus WSGI server on port {prom_port}...",
                         extra={"component": "metrics", "tag": "start", "message_type": "Info"})
            # Unsere WSGI-App
            prometheus_app = make_wsgi_app()
            # Server instanzieren
            httpd = make_server('', prom_port, prometheus_app, handler_class=LoggingWSGIRequestHandler)
            httpd.serve_forever()
        else:
            logging.info("No Prometheus 'metrics.port' configured. Skipping metrics server.",
                         extra={"component": "metrics", "tag": "start", "message_type": "Info"})

    metrics_thread = threading.Thread(target=start_prometheus_if_configured, args=(config,), daemon=True)
    metrics_thread.start()

    # File handlers
    handlers = {
        'json': LocalFileHandler(
            base_name=config['files']['json_file_name'],
            local_dir=config['files']['local_subdirs']['json'],
            file_type="json",
            size_limit=config['files']['size_limits']['json'],
            remote_subdir=config['files']['sftp_subdirs']['json'],
            config=config,
            language_code="json"
        )
    }
    for language_code in config.get("languages", ["de", "en"]):
        if language_code in config['files']['translated_text_files']:
            handler_key = f"{language_code}_txt"
            handlers[handler_key] = LocalFileHandler(
                base_name=config['files']['translated_text_files'][language_code],
                local_dir=config['files']['local_subdirs'][f"{language_code}_txt"],
                file_type="txt",
                size_limit=config['files']['size_limits'][f"{language_code}_txt"],
                remote_subdir=config['files']['sftp_subdirs'][f"{language_code}_txt"],
                config=config,
                language_code=language_code
            )
        else:
            logging.error(
                languages[current_language]["no_translation_file_in_config"].format(language=language_code)
            )

    user_data = UserData(handlers=handlers, config=config)

    # MQTT
    client = mqtt.Client(protocol=mqtt.MQTTv5, userdata=user_data)
    client.username_pw_set(config['mqtt']['username'], config['mqtt']['password'])
    client.on_connect = on_connect
    client.on_message = on_message

    display_startup_header(config)

    try:
        broker_info = f"{config['mqtt']['broker']}:{config['mqtt']['port']}"
        logging.info(f"Connecting to MQTT broker {broker_info}",
                     extra={"component": "mqtt", "tag": "connect", "message_type": "Info"})
        client.connect(config['mqtt']['broker'], config['mqtt']['port'], 60)
    except Exception as e:
        logging.error(
            languages[current_language]["error_loading_config"].format(e=e)
        )
        return

    logging.info("Configuration loaded", extra={"component": "config", "tag": "load", "message_type": "Status"})
    client.loop_start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("Shutting down IoT MQTT Agent", extra={"component": "main", "tag": "shutdown", "message_type": "Status"})
        client.loop_stop()
        client.disconnect()
        sys.exit(0)
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()