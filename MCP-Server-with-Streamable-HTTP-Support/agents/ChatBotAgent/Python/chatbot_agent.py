# -*- coding: utf-8 -*-
"""
Fujitsu PrivateGPT ChatBot Agent – optimierte Flask/Waitress-API

Speed-Ups (ohne Funktionsänderung der API):
- MCP-Connectivity-Check mit Cache/TTL (vermeidet TCP-Handshakes pro Request)
- Keep-Alive/Verbindungs-Reuse serverseitig (Waitress-Settings) + Hinweise für Client
- Schneller JSON-Pfad via orjson/ujson (Fallback: stdlib json)
- Log-I/O: Rotierende Logs, schlankes Format, optionales Tail in /logs
- Konstantzeit-Vergleich für API-Key (hmac.compare_digest)
- O(1)-Sprachprüfung via Set
- Leichtgewichtiges Request-Tracing zum Aufspüren von Zusatzaufrufen
"""

from flask import Flask, request, jsonify
import logging
import threading
from waitress import serve
from flask_cors import CORS
from pathlib import Path
import os
import platform
import socket
import sys
import time
import hmac
from logging.handlers import RotatingFileHandler
import http.client # Add this for light-weight HTTP check

# ───────────────────────────────────────────────────────────────
# Optionale schnelle JSON-Engines (orjson > ujson > json)
# ───────────────────────────────────────────────────────────────
try:
    import orjson as _fastjson
    _fast_loads = _fastjson.loads

    def _fast_dumps(obj):
        # orjson.dumps -> bytes
        return _fastjson.dumps(obj).decode("utf-8")
except Exception:
    try:
        import ujson as _fastjson
        _fast_loads = _fastjson.loads

        def _fast_dumps(obj):
            return _fastjson.dumps(obj)
    except Exception:
        import json as _fastjson
        _fast_loads = _fastjson.loads

        def _fast_dumps(obj):
            return _fastjson.dumps(obj)

# ───────────────────────────────────────────────────────────────
# Agent-Imports
# ───────────────────────────────────────────────────────────────
from ...AgentInterface.Python.agent import PrivateGPTAgent, GroupValidationError
from ...AgentInterface.Python.config import Config, ConfigError
from ...AgentInterface.Python.language import languages

# ───────────────────────────────────────────────────────────────
# Logging (schlank, rotierend)
# ───────────────────────────────────────────────────────────────
TIMESTAMP_WIDTH = 20
COMPONENT_WIDTH = 16
TAG_WIDTH       = 10
MESSAGE_WIDTH   = 12

def _fmt_fixed(text: str, width: int, align: str = "<") -> str:
    return f"{text or '':{align}{width}}"[:width]

class CustomFormatter(logging.Formatter):
    LEVEL_ICONS = {
        'DEBUG': '🐛', 'INFO': 'ℹ️', 'WARNING': '⚠️', 'ERROR': '❌', 'CRITICAL': '‼️'
    }

    def format(self, record):
        record.level_icon   = self.LEVEL_ICONS.get(record.levelname, record.levelname)
        record.component    = _fmt_fixed(getattr(record, "component", "main"), COMPONENT_WIDTH)
        record.tag          = _fmt_fixed(getattr(record, "tag", "-"), TAG_WIDTH)
        record.message_type = _fmt_fixed(getattr(record, "message_type", "-"), MESSAGE_WIDTH)
        return "{asctime} | {level_icon} {component} :{tag} | {message_type} | {msg}".format(
            asctime=self.formatTime(record, "%Y-%m-%d %H:%M:%S"),
            level_icon=record.level_icon,
            component=record.component,
            tag=record.tag,
            message_type=record.message_type,
            msg=record.getMessage()
        )

def setup_logging(level_name: str = "INFO"):
    log_level = getattr(logging, level_name.upper(), logging.INFO)

    # Console
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(CustomFormatter())

    logging.basicConfig(level=log_level, handlers=[stream_handler])

    # Werkzeug (HTTP-Access) -> rotierende Datei
    werk = logging.getLogger('werkzeug')
    werk.setLevel(logging.ERROR)
    werk.handlers.clear()
    file_handler = RotatingFileHandler(
        "flask.log", maxBytes=2 * 1024 * 1024, backupCount=2, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
    werk.addHandler(file_handler)

# LOG_LEVEL kann via Env gesetzt werden, z. B. LOG_LEVEL=DEBUG
setup_logging(os.environ.get("LOG_LEVEL", "DEBUG"))

# ───────────────────────────────────────────────────────────────
# Flask-App & CORS
# ───────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)
logging.debug("CORS initialisiert.", extra={"component": "Flask", "tag": "CORS", "message_type": "DEBUG"})

# ───────────────────────────────────────────────────────────────
# Konfiguration laden
# ───────────────────────────────────────────────────────────────
try:
    config_file = (Path(__file__).parent.parent / "config.json").resolve()
    config = Config(
        config_file=config_file,
        required_fields=["email", "password", "mcp_server", "api_ip", "api_port", "api_key"]
    )
    logging.info("Konfiguration geladen.", extra={"component": "Config", "tag": "LOAD", "message_type": "INFO"})
except ConfigError as e:
    logging.error(f"Configuration Error: {e}", extra={"component": "Config", "tag": "ERROR", "message_type": "ERROR"})
    sys.exit(1)

# ───────────────────────────────────────────────────────────────
# Agent initialisieren
# ───────────────────────────────────────────────────────────────
try:
    agent = PrivateGPTAgent(config)
    logging.info("PrivateGPTAgent initialisiert.", extra={"component": "Agent", "tag": "INIT", "message_type": "INFO"})
except GroupValidationError as e:
    logging.error(f"Group Validation Error: {e}", extra={"component": "Agent", "tag": "VALIDATION", "message_type": "ERROR"})
    sys.exit(1)
except Exception as e:
    logging.error(f"Unexpected Agent Init Error: {e}", extra={"component": "Agent", "tag": "ERROR", "message_type": "ERROR"})
    sys.exit(1)

# ───────────────────────────────────────────────────────────────
# Routen/Globals
# ───────────────────────────────────────────────────────────────
api_key = config.get("api_key", "default_api_key")
_languages_set = set(languages)  # O(1)-Mitgliedschaft

# MCP-Check mit Cache/TTL (Standard 5s, per config überschreibbar)
_MCP_CACHE = {"ok": False, "ts": 0.0}
_MCP_TTL = float(config.get("mcp_check_ttl_seconds", 5))

def _connect_to_mcp_server_once() -> bool:
    """
    Checks if MCP Server is reachable.
    Since the new server is HTTP based (Express), we can check the /health endpoint.
    """
    mcp_cfg = config.get("mcp_server")
    if not (isinstance(mcp_cfg, dict) and "host" in mcp_cfg and "port" in mcp_cfg):
        raise Exception("Invalid MCP config (host/port missing).")
        
    host, port = mcp_cfg["host"], int(mcp_cfg["port"])
    
    try:
        # Simple TCP Connect first (fastest)
        with socket.create_connection((host, port), timeout=2):
            pass
            
        # Optional: Verify it's actually the HTTP server we expect
        # This part ensures we aren't just hitting an open raw socket
        conn = http.client.HTTPConnection(host, port, timeout=2)
        conn.request("GET", "/health")
        resp = conn.getresponse()
        conn.close()
        
        return resp.status == 200
    except Exception:
        return False

def connect_to_mcp_server_cached() -> bool:
    now = time.monotonic()
    if (now - _MCP_CACHE["ts"]) < _MCP_TTL:
        return _MCP_CACHE["ok"]
    ok = _connect_to_mcp_server_once()
    _MCP_CACHE.update(ok=ok, ts=now)
    if ok:
        logging.debug("MCP ok (cached).", extra={"component": "MCP", "tag": "CONNECT", "message_type": "DEBUG"})
    return ok

# ───────────────────────────────────────────────────────────────
# Startup-Header
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
- Flask Log     : flask.log (rotating)
────────────────────────────────────────────────
🚀 Ready to serve requests!
"""
    print(header)
    logging.info("Startup-Header angezeigt.", extra={"component": "Startup", "tag": "HEADER", "message_type": "INFO"})

# ───────────────────────────────────────────────────────────────
# Request-Tracing & Auth
# ───────────────────────────────────────────────────────────────
@app.before_request
def _trace_and_auth():
    # Tracing
    logging.debug(
        f"{request.remote_addr} {request.method} {request.path} UA={request.headers.get('User-Agent','-')}",
        extra={"component": "HTTP", "tag": "REQ", "message_type": "DEBUG"}
    )

    # OPTIONS sowie /status ohne Auth
    if request.method == 'OPTIONS' or request.endpoint == 'status':
        return

    # API-Key prüfen (konstante Zeit)
    provided_key = request.headers.get('X-API-KEY')
    if not provided_key or not hmac.compare_digest(provided_key, api_key):
        logging.warning("Unauthorized.", extra={"component": "Auth", "tag": "FAIL", "message_type": "WARNING"})
        return jsonify({"error": "Unauthorized"}), 401

# ───────────────────────────────────────────────────────────────
# /ask
# ───────────────────────────────────────────────────────────────
@app.route('/ask', methods=['POST'])
def ask():
    """
    Stellt eine Frage an den Agenten.
    Akzeptiert FIPA-ACL oder Legacy-JSON.
    """
    data = request.get_json(silent=True, cache=False) or {}
    logging.debug("Request /ask empfangen.", extra={"component": "Route", "tag": "ASK", "message_type": "DEBUG"})

    # FIPA-ACL?
    if "performative" in data and "content" in data:
        content = data.get("content") or {}
        question = content.get("question")
        if not question:
            return jsonify({"error": "Invalid FIPA-ACL request. 'content.question' is required."}), 400
        use_public = bool(content.get("usePublic", False))
        groups = content.get("groups")
        language = (content.get("language") or "en").lower()
        logging.info("FIPA-ACL empfangen.", extra={"component": "Route", "tag": "ASK", "message_type": "INFO"})
    else:
        # Legacy
        question = data.get("question")
        if not question:
            return jsonify({"error": "Invalid request. 'question' field is required."}), 400
        use_public = bool(data.get("usePublic", False))
        groups = data.get("groups")
        language = (data.get("language") or "en").lower()
        logging.info("Legacy JSON empfangen.", extra={"component": "Route", "tag": "ASK", "message_type": "INFO"})

    # Sprache validieren
    if language not in _languages_set:
        language = 'en'
        logging.warning("Unsupported language -> fallback to en.", extra={"component": "Route", "tag": "LANG", "message_type": "WARNING"})

    # Gruppen validieren (nur wenn übergeben)
    if groups:
        try:
            invalid_groups = agent.validate_groups(groups)
            if invalid_groups:
                msg = f"Invalid groups: {invalid_groups}"
                logging.error(msg, extra={"component": "Agent", "tag": "GROUP", "message_type": "ERROR"})
                return jsonify({"error": msg}), 400
            logging.debug("Gruppen validiert.", extra={"component": "Agent", "tag": "GROUP", "message_type": "DEBUG"})
        except Exception as e:
            logging.error(f"Group validation failed: {e}", extra={"component": "Agent", "tag": "GROUP", "message_type": "ERROR"})
            return jsonify({"error": "Group validation failed."}), 500

    # MCP (mit Cache/TTL)
    try:
        connect_to_mcp_server_cached()
    except Exception as e:
        failure_message = {
            "performative": "failure",
            "sender": "Chatbot_Agent",
            "receiver": "IoT_MQTT_Agent",
            "language": "fipa-sl",
            "ontology": "mcp-connection-ontology",
            "content": {"reason": f"Could not connect to MCP server: {str(e)}"}
        }
        logging.error("MCP-Verbindung fehlgeschlagen.", extra={"component": "MCP", "tag": "CONNECT", "message_type": "ERROR"})
        return jsonify(failure_message), 200

    # Agent Query
    resp_json_text = agent.query_private_gpt(
        prompt=question,
        use_public=use_public,
        language=language,
        groups=groups
    )
    if not resp_json_text or not str(resp_json_text).strip():
        # LLM / MCP returned empty -> return minimal fallback
        return jsonify({"content": {"answer": "ERROR: empty LLM response"}}), 200

    logging.info("Agent-Query ok.", extra={"component": "Agent", "tag": "QUERY", "message_type": "INFO"})

    # Antwort ist JSON-String -> robust/schnell parsen
    try:
        resp_obj = _fast_loads(resp_json_text)
    except Exception:
        # Fallback, falls Agent Unerwartetes liefert
        resp_obj = {"content": {"answer": resp_json_text}}

    return jsonify(resp_obj), 200

# ───────────────────────────────────────────────────────────────
# /logs – optionales Tail (?tail=N Bytes)
# ───────────────────────────────────────────────────────────────
@app.route('/logs', methods=['GET'])
def view_logs():
    logging.debug("Request /logs.", extra={"component": "Route", "tag": "LOGS", "message_type": "DEBUG"})
    log_path = Path("flask.log")
    if not log_path.exists():
        return "Log file not found.", 404

    tail = request.args.get("tail", type=int)
    try:
        if tail and tail > 0:
            with log_path.open("rb") as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                start = max(0, size - tail)
                f.seek(start, os.SEEK_SET)
                data = f.read().decode("utf-8", errors="replace")
        else:
            data = log_path.read_text(encoding="utf-8", errors="replace")
        return f"<pre>{data}</pre>", 200
    except Exception as e:
        logging.error(f"Log read error: {e}", extra={"component": "Route", "tag": "LOGS", "message_type": "ERROR"})
        return f"An error occurred: {str(e)}", 500

# ───────────────────────────────────────────────────────────────
# /status
# ───────────────────────────────────────────────────────────────
@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "PrivateGPT Agent is running."}), 200

# ───────────────────────────────────────────────────────────────
# API-Server starten (Waitress mit sinnvollen Defaults)
# ───────────────────────────────────────────────────────────────
def run_api_server():
    server_ip = config.get("api_ip", "0.0.0.0")
    server_port = int(config.get("api_port", 5001))
    threads = min(32, (os.cpu_count() or 4) * 2)
    logging.info(
        f"Starte API-Server auf {server_ip}:{server_port} (threads={threads})",
        extra={"component": "Server", "tag": "START", "message_type": "INFO"}
    )
    serve(
        app,
        host=server_ip,
        port=server_port,
        threads=threads,
        connection_limit=1000,
        channel_timeout=60,  # Keep-Alive ermöglicht Reuse
        ident=None           # spart ein paar Header-Bytes
    )

# ───────────────────────────────────────────────────────────────
# Main
# ───────────────────────────────────────────────────────────────
def display_startup_header_safe():
    try:
        display_startup_header()
    except Exception as e:
        logging.warning(f"Startup header failed: {e}", extra={"component": "Startup", "tag": "HEADER", "message_type": "WARNING"})

if __name__ == '__main__':
    # API-Server in separatem Thread
    api_thread = threading.Thread(target=run_api_server, daemon=True)
    api_thread.start()
    logging.info("API-Server Thread gestartet.", extra={"component": "Server", "tag": "THREAD", "message_type": "INFO"})

    display_startup_header_safe()

    # Agent läuft im Main-Thread (blockierend)
    try:
        agent.run()
    except Exception as e:
        logging.critical(f"Agent critical: {e}", extra={"component": "Agent", "tag": "RUN", "message_type": "CRITICAL"})
        sys.exit(1)
