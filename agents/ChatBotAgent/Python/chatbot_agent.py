from flask import Flask, request, jsonify
import logging
import json
import threading
from waitress import serve
from flask_cors import CORS
from pathlib import Path
import os
import platform
import socket
import sys

# Import der erforderlichen Module/Klassen für den Agenten
from ...AgentInterface.Python.agent import PrivateGPTAgent, GroupValidationError
from ...AgentInterface.Python.config import Config, ConfigError
from ...AgentInterface.Python.language import languages

# ───────────────────────────────────────────────────────────────
# Konstante Spaltenbreiten für saubere Formatierung
# ───────────────────────────────────────────────────────────────
TIMESTAMP_WIDTH  = 20
COMPONENT_WIDTH  = 16
TAG_WIDTH        = 10
MESSAGE_WIDTH    = 12
LABEL_WIDTH      = 30  # Einheitliche Breite für "Received message on topic" etc.
TOPIC_WIDTH      = 40
PARAMETER_WIDTH  = 35
VALUE_WIDTH      = 15
STATUS_WIDTH     = 8
RESPONSE_WIDTH   = 40

# Funktion zur Formatierung von Text mit fester Breite
def format_text(text: str, width: int, align: str = "<") -> str:
    """Bringt den Text auf eine feste Breite und richtet ihn aus (links '<', rechts '>')."""
    return f"{text:{align}{width}}"[:width]

# ───────────────────────────────────────────────────────────────
# Custom Logging Formatter (Emoji + einheitliche Spaltenbreite)
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
        record.component = format_text(getattr(record, "component", "main"), COMPONENT_WIDTH)
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

    # Konfiguration des Root-Loggers mit dem benutzerdefinierten Handler
    logging.basicConfig(level=log_level, handlers=[handler])
    logging.debug("Logging initialisiert.", extra={"component": "Logging", "tag": "INIT", "message_type": "DEBUG"})

# Initialisiere das Logging
setup_logging({"level": "DEBUG"})

app = Flask(__name__)

# CORS-Konfiguration
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)
logging.debug("CORS konfiguriert.", extra={"component": "Flask", "tag": "CORS", "message_type": "DEBUG"})

# ───────────────────────────────────────────────────────────────
# Konfiguration laden
# ───────────────────────────────────────────────────────────────
try:
    config_file = Path.absolute(Path(__file__).parent.parent / "config.json")
    config = Config(
        config_file=config_file,
        required_fields=["email", "password", "mcp_server", "api_ip", "api_port", "api_key"]
    )
    logging.info("Konfiguration erfolgreich geladen.", extra={"component": "Config", "tag": "LOAD", "message_type": "INFO"})
except ConfigError as e:
    logging.error(f"Configuration Error: {e}", extra={"component": "Config", "tag": "ERROR", "message_type": "ERROR"})
    exit(1)

# ───────────────────────────────────────────────────────────────
# Initialisierung des PrivateGPTAgent
# ───────────────────────────────────────────────────────────────
try:
    agent = PrivateGPTAgent(config)
    logging.info("PrivateGPTAgent initialisiert.", extra={"component": "Agent", "tag": "INIT", "message_type": "INFO"})
except GroupValidationError as e:
    logging.error(f"Group Validation Error: {e}", extra={"component": "Agent", "tag": "VALIDATION", "message_type": "ERROR"})
    exit(1)
except Exception as e:
    logging.error(f"Unexpected Error during Agent Initialization: {e}", extra={"component": "Agent", "tag": "ERROR", "message_type": "ERROR"})
    exit(1)

# Laden des API-Schlüssels
api_key = config.get("api_key", "default_api_key")
logging.debug("API-Key geladen.", extra={"component": "Config", "tag": "API_KEY", "message_type": "DEBUG"})

# Konfiguration des Loggings für Flask (Werkzeug)
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.setLevel(logging.ERROR)
werkzeug_handler = logging.FileHandler('flask.log')
werkzeug_handler.setLevel(logging.ERROR)
werkzeug_formatter = logging.Formatter('%(asctime)s %(levelname)s: %(message)s')
werkzeug_handler.setFormatter(werkzeug_formatter)
werkzeug_logger.addHandler(werkzeug_handler)
logging.debug("Werkzeug-Logger konfiguriert.", extra={"component": "Flask", "tag": "LOGGER", "message_type": "DEBUG"})

# ───────────────────────────────────────────────────────────────
# Anzeige des Startup-Headers
# ───────────────────────────────────────────────────────────────
def display_startup_header():
    server_ip = config.get("api_ip", "0.0.0.0")
    server_port = config.get("api_port", 8000)
    api_key_status = "✔️ Set" if api_key != "default_api_key" else "❌ Not Set"
    header = f"""
────────────────────────────────────────────────
Fujitsu PrivateGPT ChatBot Agent - Startup
────────────────────────────────────────────────
System Information:
- Hostname      : {socket.gethostname()}
- Operating Sys : {platform.system()} {platform.release()}
- Python Version: {platform.python_version()}

Server Configuration:
- API Endpoint  : http://{server_ip}:{server_port}
- API Key Status: {api_key_status}

Logs:
- Flask Log     : flask.log
- Agent Log     : agent.log
────────────────────────────────────────────────
🚀 Ready to serve requests!
"""
    print(header)
    logging.info("Startup-Header angezeigt.", extra={"component": "Startup", "tag": "HEADER", "message_type": "INFO"})
    logging.info(f"Current working directory: {os.getcwd()}", extra={"component": "Startup", "tag": "CWD", "message_type": "INFO"})

# ───────────────────────────────────────────────────────────────
# Verbindung zum MCP-Server herstellen
# ───────────────────────────────────────────────────────────────
def connect_to_mcp_server():
    """
    Versucht, eine Verbindung zum MCP-Server herzustellen.
    Liest die Serverinformationen ausschließlich aus dem "mcp_server"-Eintrag in der Konfiguration.
    Wird keine Verbindung hergestellt, wird eine Exception geworfen.
    """
    logging.debug("Lese MCP Server Konfiguration.", extra={"component": "MCP", "tag": "CONFIG", "message_type": "DEBUG"})
    mcp_config = config.get("mcp_server")
    logging.debug(f"MCP Server Config: {mcp_config}", extra={"component": "MCP", "tag": "CONFIG", "message_type": "DEBUG"})
    
    if not mcp_config:
        msg = "MCP server configuration is missing in the config file."
        logging.error(msg, extra={"component": "MCP", "tag": "CONFIG", "message_type": "ERROR"})
        raise Exception(msg)
    
    if not isinstance(mcp_config, dict):
        msg = "MCP server configuration is not a dictionary: {}".format(mcp_config)
        logging.error(msg, extra={"component": "MCP", "tag": "CONFIG", "message_type": "ERROR"})
        raise Exception(msg)
    
    # Lese host und port
    mcp_host = mcp_config.get("host")
    mcp_port = mcp_config.get("port")
    
    logging.debug(f"Loaded MCP host: {mcp_host}", extra={"component": "MCP", "tag": "HOST", "message_type": "DEBUG"})
    logging.debug(f"Loaded MCP port: {mcp_port}", extra={"component": "MCP", "tag": "PORT", "message_type": "DEBUG"})
    
    if mcp_host is None or mcp_port is None:
        msg = "MCP server host or port is missing in the configuration. Found host: {}, port: {}".format(mcp_host, mcp_port)
        logging.error(msg, extra={"component": "MCP", "tag": "CONFIG", "message_type": "ERROR"})
        raise Exception(msg)
    
    # Versuche, den Port in einen Integer umzuwandeln
    try:
        mcp_port = int(mcp_port)
    except Exception as e:
        msg = "MCP server port is not a valid integer: " + str(e)
        logging.error(msg, extra={"component": "MCP", "tag": "PORT", "message_type": "ERROR"})
        raise Exception(msg)
    
    try:
        with socket.create_connection((mcp_host, mcp_port), timeout=5) as sock:
            logging.info(f"Successfully connected to MCP server at {mcp_host}:{mcp_port}",
                         extra={"component": "MCP", "tag": "CONNECT", "message_type": "INFO"})
            return True
    except Exception as e:
        msg = "Could not connect to MCP server: " + str(e)
        # Begrenze die Nachricht auf 100 Zeichen
        limited_msg = (msg[:97] + '...') if len(msg) > 100 else msg
        logging.error(limited_msg, extra={"component": "MCP", "tag": "CONNECT", "message_type": "ERROR"})
        raise Exception(limited_msg)

# ───────────────────────────────────────────────────────────────
# Flask Middleware: Authentifizierung
# ───────────────────────────────────────────────────────────────
@app.before_request
def authenticate():
    # OPTIONS-Anfragen werden ohne Authentifizierung erlaubt
    if request.method == 'OPTIONS':
        logging.debug("OPTIONS request - keine Authentifizierung erforderlich.",
                      extra={"component": "Auth", "tag": "SKIP", "message_type": "DEBUG"})
        return
    if request.endpoint != 'status':
        provided_key = request.headers.get('X-API-KEY')
        if not provided_key or provided_key != api_key:
            logging.warning("Unauthorized request detected.",
                            extra={"component": "Auth", "tag": "FAIL", "message_type": "WARNING"})
            return jsonify({"error": "Unauthorized"}), 401
        else:
            logging.debug("API-Key validiert.",
                          extra={"component": "Auth", "tag": "SUCCESS", "message_type": "DEBUG"})

# ───────────────────────────────────────────────────────────────
# Flask Route: /ask
# ───────────────────────────────────────────────────────────────
@app.route('/ask', methods=['POST'])
def ask():
    """
    Endpoint zum Stellen einer Frage an den Chatbot-Agenten.
    Akzeptiert entweder eine FIPA-ACL-Nachricht oder das Legacy-JSON-Format.
    """
    data = request.get_json()
    logging.debug("Received request on /ask endpoint.", extra={"component": "Route", "tag": "ASK", "message_type": "DEBUG"})

    # Prüfen, ob es sich um eine FIPA-ACL-Nachricht handelt
    if data and "performative" in data and "content" in data:
        performative = data.get("performative", "unknown")
        sender = data.get("sender", "unknown")
        receiver = data.get("receiver", "unknown")
        ontology = data.get("ontology", "none")
        content = data["content"]
        if not content or 'question' not in content:
            logging.error("Invalid FIPA-ACL request: 'content.question' fehlt.",
                          extra={"component": "Route", "tag": "ASK", "message_type": "ERROR"})
            return jsonify({"error": "Invalid FIPA-ACL request. 'content.question' is required."}), 400

        question = content['question']
        use_public = content.get('usePublic', False)
        groups = content.get('groups', None)
        language = content.get('language', 'en')

        logging.info(f"Received FIPA-ACL message: performative={performative}, sender={sender}, receiver={receiver}, ontology={ontology}",
                     extra={"component": "Route", "tag": "ASK", "message_type": "INFO"})
    else:
        # Fallback: Legacy-Format
        if not data or 'question' not in data:
            logging.error("Invalid legacy request: 'question' field is required.",
                          extra={"component": "Route", "tag": "ASK", "message_type": "ERROR"})
            return jsonify({"error": "Invalid request. 'question' field is required."}), 400
        question = data['question']
        use_public = data.get('usePublic', False)
        groups = data.get('groups', None)
        language = data.get('language', 'en')
        logging.info("Received legacy JSON request (no FIPA ACL fields).",
                     extra={"component": "Route", "tag": "ASK", "message_type": "INFO"})

    # Sprache validieren
    if language not in languages:
        language = 'en'
        logging.warning("Unsupported language provided. Fallback to English.",
                        extra={"component": "Route", "tag": "LANG", "message_type": "WARNING"})

    # Gruppen validieren
    try:
        invalid_groups = agent.validate_groups(groups)
        if invalid_groups:
            msg = f"Invalid groups: {invalid_groups}"
            logging.error(msg, extra={"component": "Agent", "tag": "GROUP", "message_type": "ERROR"})
            return jsonify({"error": msg}), 400
        logging.debug("Gruppen validiert.",
                      extra={"component": "Agent", "tag": "GROUP", "message_type": "DEBUG"})
    except Exception as e:
        logging.error(f"Error during group validation: {e}",
                      extra={"component": "Agent", "tag": "GROUP", "message_type": "ERROR"})
        return jsonify({"error": "Group validation failed."}), 500

    # Versuch, eine Verbindung zum MCP-Server herzustellen
    try:
        connect_to_mcp_server()
    except Exception as e:
        failure_message = {
            "performative": "failure",
            "sender": "Chatbot_Agent",
            "receiver": "IoT_MQTT_Agent",
            "language": "fipa-sl",
            "ontology": "mcp-connection-ontology",
            "content": {
                "reason": f"Could not connect to MCP server: {str(e)}"
            }
        }
        logging.error(f"MCP connection error: {e}.",
                      extra={"component": "MCP", "tag": "CONNECT", "message_type": "ERROR"})
        logging.info(f"Send FIPA ACL failure to connected agents.",
                      extra={"component": "FIPA", "tag": "ACL", "message_type": "INFO"})
        return jsonify(failure_message), 200

    # Falls die Verbindung erfolgreich war, wird die Frage an den Agenten weitergereicht.
    response = agent.query_private_gpt(
        prompt=question,
        use_public=use_public,
        language=language,
        groups=groups
    )
    logging.info("Agent query erfolgreich durchgeführt.",
                 extra={"component": "Agent", "tag": "QUERY", "message_type": "INFO"})

    # Die Antwort wird als JSON zurückgegeben.
    return jsonify(json.loads(response)), 200

# ───────────────────────────────────────────────────────────────
# Flask Route: /logs (Anzeige der Logdatei)
# ───────────────────────────────────────────────────────────────
@app.route('/logs', methods=['GET'])
def view_logs():
    logging.debug("Request received for viewing logs.",
                  extra={"component": "Route", "tag": "LOGS", "message_type": "DEBUG"})
    try:
        with open('flask.log', 'r') as log_file:
            log_content = log_file.read()
        logging.info("Logs erfolgreich geladen.", extra={"component": "Route", "tag": "LOGS", "message_type": "INFO"})
        return f"<pre>{log_content}</pre>", 200
    except FileNotFoundError:
        logging.error("Log file not found.", extra={"component": "Route", "tag": "LOGS", "message_type": "ERROR"})
        return "Log file not found.", 404
    except Exception as e:
        logging.error(f"An error occurred: {str(e)}", extra={"component": "Route", "tag": "LOGS", "message_type": "ERROR"})
        return f"An error occurred: {str(e)}", 500

# ───────────────────────────────────────────────────────────────
# Flask Route: /status
# ───────────────────────────────────────────────────────────────
@app.route('/status', methods=['GET'])
def status():
    logging.debug("Statusabfrage erhalten.",
                  extra={"component": "Route", "tag": "STATUS", "message_type": "DEBUG"})
    return jsonify({"status": "PrivateGPT Agent is running."}), 200

# ───────────────────────────────────────────────────────────────
# API-Server starten
# ───────────────────────────────────────────────────────────────
def run_api_server():
    server_ip = config.get("api_ip", "0.0.0.0")
    server_port = config.get("api_port", 5001)
    logging.info(f"Starte API-Server auf {server_ip}:{server_port}",
                 extra={"component": "Server", "tag": "START", "message_type": "INFO"})
    serve(app, host=server_ip, port=int(server_port))

if __name__ == '__main__':
    # API-Server in separatem Thread starten
    api_thread = threading.Thread(target=run_api_server)
    api_thread.daemon = True
    api_thread.start()
    logging.info("API-Server Thread gestartet.",
                 extra={"component": "Server", "tag": "THREAD", "message_type": "INFO"})
    display_startup_header()
    # Starte den Agenten (dies blockiert, daher wird der Agent nach der API-Server-Initialisierung ausgeführt)
    try:
        agent.run()
    except Exception as e:
        logging.critical(f"Agent encountered a critical error: {e}",
                         extra={"component": "Agent", "tag": "RUN", "message_type": "CRITICAL"})
        exit(1)
