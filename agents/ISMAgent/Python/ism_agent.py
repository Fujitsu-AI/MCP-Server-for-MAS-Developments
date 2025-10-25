# ============================================================
# ISM Agent – generate descriptive text for ISM nodes
# - Structured white console logs (emoji-safe, aligned)
# - Optional AgentInterface imports (PrivateGPTAgent, etc.)
# - HTTP (FIPA-ACL) request to chatbot agent
# - Robust error handling, retries with backoff, NDJSON events
# - Paths (input/output/logs) are read from config["paths"]
# ============================================================

import json
import re
import time
import sys
import argparse
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from colorama import init as colorama_init, Fore, Style
from wcwidth import wcswidth  # emoji/wide-char aware width calc

# ------------------------------------------------------------
# OPTIONAL: AgentInterface (PrivateGPT) – best-effort imports
# ------------------------------------------------------------
try:
    from ...AgentInterface.Python.agent import PrivateGPTAgent, GroupValidationError
    from ...AgentInterface.Python.config import Config as PGPTConfig, ConfigError as PGPTConfigError
    from ...AgentInterface.Python.language import languages as pgpt_languages
    from ...AgentInterface.Python.color import Color
    _HAS_AGENT_IFACE = True
except Exception:
    _HAS_AGENT_IFACE = False

colorama_init()  # enable ANSI handling on Windows

# ============================================================
# Structured console / file logging (white text only)
# ============================================================
class StructuredLog:
    """IoT-style structured console/file logger with white text only and emoji-safe alignment."""
    COL_TIME = 19
    COL_ICON = 4
    COL_COMP = 12
    COL_ACT  = 14
    COL_DIR  = 9

    LEVEL_ICONS = {
        "DEBUG":    "🐛",
        "INFO":     "ℹ️",
        "WARNING":  "⚠️",
        "ERROR":    "❌",
        "CRITICAL": "‼️",
    }

    def __init__(self, ndjson_path: Optional[str] = None, use_color: bool = True):
        self.ndjson_path = ndjson_path
        self.use_color = use_color
        self._ensure_dir()

    # ---------------- internal helpers ----------------
    def _ensure_dir(self) -> None:
        if self.ndjson_path:
            os.makedirs(os.path.dirname(self.ndjson_path), exist_ok=True)
            if not os.path.exists(self.ndjson_path):
                with open(self.ndjson_path, "w", encoding="utf-8"):
                    pass

    @staticmethod
    def _ts() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    @staticmethod
    def _pad_raw(s: str, width: int) -> str:
        """Pad string to visual width 'width' (handles emojis & wide chars)."""
        s = (s or "")
        vis = wcswidth(s)
        if vis < 0:
            vis = len(s)
        return s + " " * max(0, width - vis)

    def _white(self, text: str) -> str:
        """Force bright white output for all columns (icons keep native glyph color)."""
        if not self.use_color:
            return text
        return f"{Style.BRIGHT}{Fore.WHITE}{text}{Style.RESET_ALL}"

    def _icon(self, kind: str, level: Optional[str] = None) -> str:
        """Return an icon (emoji + trailing space). If 'level' is given, prefer level icon."""
        if level:
            lvl = level.upper()
            if lvl in self.LEVEL_ICONS:
                return self.LEVEL_ICONS[lvl] + " |"
        #mapping = {
        #    "info":  "🅸",
        #    "ok":    "✓",
         #   "warn":  "⚠",
         #   "error": "⛔",
         #   "net":   "↔",
         #   "file":  "💾",
         #   "proc":  "▶",
         #   "mqtt":  "🐍",
         #   "cb":    "🤖",
        #}
        #return mapping.get(kind, "🅸") + " "  # trailing space stabilizes width

    def _line(self, icon: str, component: str, action: str, direction: str, message: str) -> str:
        t_col   = self._pad_raw(self._ts(), self.COL_TIME)
        i_col   = self._pad_raw(icon, self.COL_ICON)
        c_col   = self._pad_raw(component, self.COL_COMP)
        a_col   = self._pad_raw(action,    self.COL_ACT)
        d_col   = self._pad_raw(direction, self.COL_DIR)
        msg_col = message or ""

        c_col   = self._white(c_col)
        a_col   = self._white(a_col)
        d_col   = self._white(d_col)
        msg_col = self._white(msg_col)

        return "".join([
            t_col, " | ",
            i_col, " ",
            c_col, " ",
            a_col, " ",
            d_col, " | ",
            msg_col,
        ])

    # ---------------- public API ----------------
    def console(self, icon_kind: str, component: str, action: str, direction: str, message: str, level: str = "info") -> None:
        line = self._line(self._icon(icon_kind, level), component, action, direction, message)
        lvl = (level or "info").lower()
        if lvl == "error":
            logging.error(line)
        elif lvl == "warning":
            logging.warning(line)
        elif lvl == "debug":
            logging.debug(line)
        elif lvl == "critical":
            logging.critical(line)
        else:
            logging.info(line)

    def file_event(self, **record) -> None:
        """Append a JSON record to NDJSON log (if configured)."""
        if not self.ndjson_path:
            return
        record.setdefault("ts", self._ts())
        with open(self.ndjson_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


slog: Optional[StructuredLog] = None


# ============================================================
# Logging setup
# ============================================================
def setup_logging(verbose: bool):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(message)s")


# ============================================================
# Config / Input Utilities
# ============================================================
def load_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in configuration file: {path} ({e})")

    chatbot = data.get("chatbot_agent", {})
    if not chatbot.get("api_url"):
        raise ValueError("Missing 'chatbot_agent.api_url' in config.")
    if not chatbot.get("api_key"):
        raise ValueError("Missing 'chatbot_agent.api_key' in config.")

    chatbot.setdefault("use_public", True)
    chatbot.setdefault("groups", [])
    chatbot.setdefault("timeout_seconds", 20)
    data.setdefault("language", "en")

    # Paths block is expected but optional; defaults below if missing.
    paths = data.get("paths", {})
    paths.setdefault("input", "agents/ISMAgent/data/ism_nodes.json")
    paths.setdefault("output", "agents/ISMAgent/output/ism_nodes_report.txt")
    paths.setdefault("ndjson", "agents/ISMAgent/logs/ism_agent.ndjson")
    paths.setdefault("dump_json_dir", "agents/ISMAgent/logs/node_json")
    data["paths"] = paths

    return data


# ---------- PDF with embedded JSON (optional input format) ----------
def _parse_pdf_json(pdf_path: Path) -> Dict[str, Any]:
    try:
        import PyPDF2
    except Exception as e:
        raise RuntimeError("PyPDF2 is required to read PDFs. Install via 'pip install PyPDF2'.") from e

    text_chunks = []
    with open(pdf_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text_chunks.append(page.extract_text() or "")
    full = "\n".join(text_chunks)
    start, end = full.find("{"), full.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"No JSON found inside PDF: {pdf_path}")
    json_text = full[start:end + 1]
    json_text = re.sub(r"-\n", "", json_text)
    json_text = re.sub(r"[ \t\r\f\v]+", " ", json_text)
    try:
        return json.loads(json_text)
    except json.JSONDecodeError:
        json_text_2 = re.sub(r",\s*([}\]])", r"\1", json_text)
        return json.loads(json_text_2)


def load_nodes(path: Path) -> List[Dict[str, Any]]:
    if slog:
        slog.console("info", "ism", ":filesystem", "read", f"Reading input file: {path}")

    if not path.exists():
        if slog:
            slog.console("error", "ism", ":filesystem", "Error", f"Input file not found: {path}", level="error")
        raise FileNotFoundError(f"Input file not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            if slog:
                slog.console("error", "ism", ":json", "Error", f"Invalid JSON: {e}", level="error")
            raise
    elif suffix == ".pdf":
        data = _parse_pdf_json(path)
    else:
        raise ValueError(f"Unsupported input file type: {suffix} (expected .json or .pdf)")

    if isinstance(data, dict):
        nodes = (data.get("IsmBody") or {}).get("Nodes") or []
    elif isinstance(data, list):
        nodes = data
    else:
        raise ValueError("Unexpected JSON type (expected dict or list).")

    if not isinstance(nodes, list):
        raise ValueError("'Nodes' field is not a list.")

    if not nodes:
        if slog:
            slog.console("warning", "ism", ":json", "-", "No nodes found in input.", level="warning")
    else:
        if slog:
            slog.console("info", "ism", ":json", "-", f"{len(nodes)} nodes loaded.")
    if slog:
        slog.file_event(event="nodes_loaded", count=len(nodes), source=str(path))
    return nodes


# ============================================================
# Health check (optional)
# ============================================================
def check_server_health(cfg: Dict[str, Any]) -> None:
    url = (cfg.get("chatbot_agent") or {}).get("health_url")
    if not url:
        return
    try:
        r = requests.get(url, timeout=5)
        if r.status_code >= 400:
            if slog:
                slog.console("warning", "chatbot", ":health", "Warn", f"{r.status_code}: {r.text[:200]}", level="warning")
    except Exception as e:
        if slog:
            slog.console("warning", "chatbot", ":health", "Error", f"{e}", level="warning")


# ============================================================
# Node parameter builder
# ============================================================
def _v(x: Any) -> str:
    if x is None:
        return ""
    s = str(x).strip()
    return s if s and s not in ("-", "None", "null", "NULL") else ""


def node_params(node: Dict[str, Any]) -> Dict[str, Any]:
    bios = _v(node.get("BiosVersion")) or "Not specified"
    irmc = _v(node.get("iRMC Firmware Version")) or "Not specified"
    hw_issues = _v(node.get("HardwareIssues")) or "No specific hardware problems mentioned."

    params = {
        "Node Name": _v(node.get("Name")),
        "NodeId": _v(node.get("NodeId")),
        "Type": _v(node.get("Type")),
        "Model": _v(node.get("Model")),
        "Status": _v(node.get("Status")),
        "AlarmStatus": _v(node.get("AlarmStatus")),
        "PowerStatus": _v(node.get("PowerStatus")),
        "IP-Version": _v(node.get("IpVersion")),
        "IP": _v(node.get("IpAddress")),
        "WEB-URL": _v(node.get("WebUrl")),
        "Hardware Issues": hw_issues,
        "BIOS Version": bios,
        "iRMC Firmware Version": irmc,
    }
    # keep only non-empty
    return {k: v for k, v in params.items() if v}


# ============================================================
# Chatbot Request (FIPA-ACL) – One Node per Request with retry
# ============================================================
def generate_logical_sentence(
    parameters: Dict[str, Any],
    language_code: str,
    config: Dict[str, Any],
    use_public: Optional[bool] = None,
    groups: Optional[List[str]] = None,
    wait_seconds: float = 5.0,
    max_retries: int = 5,
) -> str:
    attempt = 0
    last_error = None

    prompt = (
        f"Generate a fluent, well-written paragraph in {language_code.upper()} describing the following node. "
        "It should read like a technical report (no tables or bullet points). "
        "Here are the data:\n"
        + json.dumps(parameters, ensure_ascii=False, indent=4)
    )

    if use_public is None:
        use_public = bool(config.get("chatbot_agent", {}).get("use_public", True))
    if groups is None:
        groups = config.get("chatbot_agent", {}).get("groups", [])
    if not isinstance(groups, list):
        groups = []

    timeout_sec = int(config.get("chatbot_agent", {}).get("timeout_seconds", 20))
    api_url = config["chatbot_agent"]["api_url"]

    node_name = parameters.get("Node Name", "<unknown>")

    while attempt < max_retries:
        attempt += 1
        try:
            payload = {
                "performative": "request",
                "sender": "ISM_Agent",
                "receiver": "Chatbot_Agent",
                "language": "fipa-sl",
                "ontology": "fujitsu-iot-ontology",
                "content": {
                    "question": prompt,
                    "usePublic": use_public,
                    "groups": groups,
                    "language": language_code or config.get("language", "en"),
                },
            }

            headers = {
                "Content-Type": "application/json",
                "X-API-KEY": config["chatbot_agent"]["api_key"],
            }

            if slog:
                slog.console("cb", "chatbot", ":request", "Outgoing", f"Request for node: {node_name}")
                slog.file_event(event="request", component="chatbot_agent", node=node_name)

            response = requests.post(api_url, json=payload, headers=headers, timeout=timeout_sec)

            if slog:
                slog.console("cb", "chatbot", ":response", "Incoming", f"{response.status_code}")
                slog.file_event(event="response", status=response.status_code, node=node_name)

            if response.status_code != 200:
                try:
                    body = response.json()
                except Exception:
                    body = response.text
                raise RuntimeError(f"HTTP {response.status_code}: {body}")

            data = response.json()
            generated_sentence = (
                (data.get("content") or {}).get("answer")
                or data.get("answer")
                or data.get("response")
                or ""
            )
            if not generated_sentence:
                raise RuntimeError(f"Empty response from chatbot agent: {data}")

            return generated_sentence.strip()

        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_error = f"Network error: {e}"
            backoff = min(wait_seconds * (2 ** (attempt - 1)), 30)
            if slog:
                slog.console("warning", "chatbot", ":network", "Error", last_error, level="warning")
            time.sleep(backoff)
        except Exception as e:
            last_error = f"Chatbot request failed: {e}"
            backoff = min(wait_seconds * (2 ** (attempt - 1)), 30)
            if slog:
                slog.console("warning", "chatbot", ":error", "-", last_error, level="warning")
            time.sleep(backoff)

    raise RuntimeError(last_error or "Unknown chatbot request error.")


# ============================================================
# Per-node JSON dump helpers
# ============================================================
def safe_filename(s: str) -> str:
    s = re.sub(r"[^\w\-.]+", "_", s.strip())
    return s or "noname"


def dump_node_json(
    dump_dir: Optional[Path],
    idx: int,
    node_name: str,
    params: Dict[str, Any],
    answer: Optional[str] = None,
):
    if dump_dir is None:
        return
    dump_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    fname = f"{ts}_{idx:05d}_{safe_filename(node_name)}.json"
    payload = {
        "node": node_name,
        "index": idx,
        "parameters": params,
        "answer": answer,
        "timestamp": ts,
    }
    (dump_dir / fname).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if slog:
        slog.console("file", "filesystem", ":write", "-", f"Record added to {dump_dir.name}/{fname}")
        slog.file_event(event="node_dump_written", file=str(dump_dir / fname), node=node_name)


# ============================================================
# Main
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="ISM Agent – robust generator for ISM nodes.")
    parser.add_argument("--config", default="agents/ISMAgent/config.json", help="Path to config.json (default: agents/ISMAgent/config.json)")
    parser.add_argument("--language", help="Override language from config (optional)")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds to wait between requests (default 0.5)")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    setup_logging(args.verbose)
    global slog

    # Load config & paths
    cfg = load_config(Path(args.config))
    paths = cfg.get("paths", {})
    input_path = Path(paths.get("input", "agents/ISMAgent/data/ism_nodes.json"))
    output_path = Path(paths.get("output", "agents/ISMAgent/output/ism_nodes_report.txt"))
    ndjson_path = paths.get("ndjson", "agents/ISMAgent/logs/ism_agent.ndjson")
    dump_dir = Path(paths.get("dump_json_dir", "agents/ISMAgent/logs/node_json"))

    slog = StructuredLog(ndjson_path, use_color=True)

    # Optional health check
    check_server_health(cfg)

    # Language selection
    lang = (args.language or cfg.get("language") or "en").strip().lower()

    # Read nodes
    try:
        nodes = load_nodes(input_path)
    except Exception as e:
        if slog:
            slog.console("error", "main", ":startup", "Error", f"{e}", level="error")
        sys.exit(1)

    results: List[str] = []

    for idx, node in enumerate(nodes, 1):
        node_name = node.get("Name", f"Node{idx}")
        try:
            params = node_params(node)
            if slog:
                slog.console("proc", "ism", ":process", "-", f"Processing node {idx}/{len(nodes)}: {node_name}")
                slog.file_event(event="node_processing", node=node_name, index=idx)

            text = generate_logical_sentence(params, lang, cfg, max_retries=5)
            results.append(text.strip())

            dump_node_json(dump_dir, idx, node_name, params, text)
            time.sleep(max(0.0, float(args.delay)))
        except Exception as e:
            if slog:
                slog.console("error", "ism", ":process", "Error", f"{node_name}: {e}", level="error")
                slog.file_event(event="node_failed", node=node_name, error=str(e))
            # continue with next node

    if not results:
        if slog:
            slog.console("error", "main", ":report", "Error", "No report could be generated.", level="error")
        sys.exit(2)

    # Write report
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        out_text = "\n\n".join(results) + "\n"
        output_path.write_text(out_text, encoding="utf-8")
        if slog:
            slog.console("file", "filesystem", ":write", "-", f"Report saved: {output_path}")
            slog.file_event(event="report_written", path=str(output_path), size=len(out_text))
    except Exception as e:
        if slog:
            slog.console("error", "filesystem", ":write", "Error", f"{e}", level="error")
        sys.exit(3)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        if slog:
            slog.console("warning", "main", ":shutdown", "-", "User aborted (CTRL+C).", level="warning")
        sys.exit(130)
    except Exception as e:
        if slog:
            slog.console("critical", "main", ":fatal", "Error", f"{e}", level="critical")
        sys.exit(99)
