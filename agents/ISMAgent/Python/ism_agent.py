# ============================================================
# ISM Agent – generate descriptive text for ISM nodes
# - Structured white console logs (emoji-safe, aligned)
# - Optional AgentInterface imports (PrivateGPTAgent, etc.)
# - HTTP (FIPA-ACL) request to chatbot agent
# - Robust error handling, retries with backoff, NDJSON events
# - Paths (input/output/logs) are read from config["paths"]
# - After successful input read: archive input with sequential extension
# - NEW: Optional SFTP upload of the output file after completion
# - NEW: Delete local output file upon successful SFTP upload
# ============================================================

import json
import re
import time
import sys
import argparse
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from colorama import init as colorama_init, Fore, Style
from wcwidth import wcswidth # emoji/wide-char aware width calc

# NEW: SFTP deps
import paramiko
import posixpath

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
        return "ℹ️ |"

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
    
    # NEU: Standard-Prompt-Template hinzufügen (für Konfigurations-Unabhängigkeit)
    default_prompt = (
        "prompt_template parameter not set. Repeat this sentence."
    )
    chatbot.setdefault("prompt_template", default_prompt)
    data["chatbot_agent"] = chatbot # Update data with chatbot defaults

    data.setdefault("language", "en")

    # Paths block is expected but optional; defaults below if missing.
    paths = data.get("paths", {})
    paths.setdefault("input", "agents/ISMAgent/data/ism_nodes.json")
    # Hinzugefügter Pfad für die Inventardaten
    paths.setdefault("inventory", "agents/ISMAgent/data/ism_inventory.json") 
    paths.setdefault("output", "agents/ISMAgent/output/ism_nodes_report.txt")
    paths.setdefault("ndjson", "agents/ISMAgent/logs/ism_agent.ndjson")
    paths.setdefault("dump_json_dir", "agents/ISMAgent/logs/node_json")
    # NEW: archive directory default
    paths.setdefault("archive_dir", "agents/ISMAgent/archive")
    data["paths"] = paths

    # NEW: SFTP defaults (optional)
    sftp = data.get("sftp", {})
    if sftp:
        sftp.setdefault("enabled", True)
        sftp.setdefault("port", 22)
        sftp.setdefault("remote_path", "/")
        sftp.setdefault("remote_filename", None)
        data["sftp"] = sftp

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


# NEU: Funktion zum Laden und Mappen der Inventardaten
def load_inventory_map(path: Path) -> Dict[int, Dict[str, Any]]:
    if slog:
        slog.console("info", "ism", ":filesystem", "read", f"Reading inventory file: {path}")

    if not path.exists():
        if slog:
            slog.console("error", "ism", ":filesystem", "Error", f"Inventory file not found: {path}", level="error")
        raise FileNotFoundError(f"Inventory file not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        if slog:
            slog.console("error", "ism", ":json", "Error", f"Invalid JSON in inventory: {e}", level="error")
        raise

    nodes = (data.get("IsmBody") or {}).get("Nodes") or []
    inventory_map = {}

    for node in nodes:
        node_id = node.get("NodeId")
        if node_id is not None:
            # Speichere die VariableData, die die meisten Details enthält
            inventory_map[int(node_id)] = node.get("VariableData", {})
    
    if slog:
        slog.console("info", "ism", ":json", "-", f"{len(inventory_map)} inventory details mapped.")
        slog.file_event(event="inventory_mapped", count=len(inventory_map), source=str(path))

    return inventory_map


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


def node_params(node: Dict[str, Any], inventory_map: Dict[int, Dict[str, Any]]) -> Dict[str, Any]:
    # Lade die Basis-Daten aus ism_nodes.json
    node_id = int(node.get("NodeId", 0))
    # Versuche, die Inventardaten zu laden
    inv_data = inventory_map.get(node_id, {})

    # Initialisiere Basis-Parameter aus ism_nodes.json
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
        "Rack Position": _v((node.get("RackInfo") or {}).get("Name")),
        "Node Group": _v(node.get("NodeGroupName")),
    }

    # ------------------------------------------------------------
    # Füge detaillierte Inventardaten aus ism_inventory.json hinzu
    # ------------------------------------------------------------
    if inv_data:
        # Extrahiere Hardware-Informationen (Beispiele: CPUs, Memory, Disks)
        cpus = inv_data.get("Cpus", [])
        if cpus:
            cpu_model = _v(cpus[0].get("Model"))
            cpu_core_speed = _v(cpus[0].get("CoreSpeed"))
            cpu_count = len(cpus)
            params["CPU Summary"] = f"{cpu_count}x {cpu_model} @ {_v(cpu_core_speed)}MHz"
            
        memory_modules = [m for m in inv_data.get("MemoryModules", []) if m.get("MemorySize")]
        total_mem_gb = 0
        if memory_modules:
            for m in memory_modules:
                size_str = _v(m.get("MemorySize"))
                if size_str and "GB" in size_str:
                    try:
                        total_mem_gb += int(size_str.replace("GB", "").strip())
                    except ValueError:
                        pass
            
            if total_mem_gb > 0:
                mem_freq = _v(memory_modules[0].get("Frequency"))
                params["Memory Summary"] = f"{len(memory_modules)} physical modules, {total_mem_gb}GB total RAM @ {mem_freq}"

        disks = inv_data.get("Disks", [])
        if disks:
            disk_count = len(disks)
            disk_types = ", ".join(sorted(list(set([_v(d.get("MediaType")) for d in disks]))))
            disk_models = ", ".join(sorted(list(set([_v(d.get("Model")) for d in disks]))))
            
            # Summiere RAID-Volumen für eine bessere Gesamtkapazitätsschätzung
            total_raid_capacity_bytes = sum([int(_v(r.get("TotalCapacity", 0))) 
                                             for r in inv_data.get("Raid", []) 
                                             if _v(r.get("TotalCapacityUnit")) == "B"])
            
            # Wandel Bytes in TB um (1 TB = 10^12 Bytes für Marketing, oder 2^40 Bytes für binär)
            # Wir nehmen 10^12 für eine glatte Darstellung
            total_raid_capacity_tb = round(total_raid_capacity_bytes / (1000**4), 2)
            
            params["Storage Summary"] = f"{disk_count} disks ({disk_types}), {total_raid_capacity_tb}TB RAID capacity, models: {disk_models}"

        # Firmware-Informationen (BIOS, iRMC)
        for fw in inv_data.get("Firmware", []):
            if _v(fw.get("Type")) == "BIOS":
                params["BIOS Version"] = _v(fw.get("FirmwareVersion"))
            elif _v(fw.get("Type")) == "iRMC":
                params["iRMC Firmware Version"] = f"{_v(fw.get('Version'))} ({_v(fw.get('FirmwareVersion'))})"

        # Health / Issues
        disk_health_issues = [d for d in disks if _v(d.get("Health")) and _v(d.get("Health")) != "100"]
        if disk_health_issues:
             params["Hardware Issues"] = "Disk health warning or failure detected."
             params["Disk Health Issues"] = f"{len(disk_health_issues)} disks report issues (e.g., predicted life left < 100%)."

    # Lese die spezifischen, manuell getaggten Issues/Infos aus ism_nodes.json
    description = _v(node.get("Description"))
    if description:
        params["Node Description"] = description
        
    hardware_issues_from_nodes = _v(node.get("HardwareIssues")) or "No specific hardware problems mentioned."
    params.setdefault("Hardware Issues", hardware_issues_from_nodes) # Füge hinzu, falls nicht schon durch Disk Health gesetzt

    # Bereinigung: Entferne leere oder redundante Einträge
    final_params = {k: v for k, v in params.items() if v and v not in ("-", "None", "null", "NULL", "Not specified")}
    return final_params


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
    
    # Lese das Prompt-Template aus der Konfiguration
    prompt_template = config.get("chatbot_agent", {}).get("prompt_template")
    if not prompt_template:
        # Sollte nicht passieren, wenn load_config korrekt ist
        prompt_template = (
            "Generate a fluent, well-written paragraph in {language_code} describing the following node. "
            "It should read like a technical report (no tables or bullet points). "
            "Here are the data:\n"
            "{json_data}"
        )

    # Erstelle den finalen Prompt durch Ersetzen der Platzhalter
    # Hier: {language_code} und {json_data}
    prompt = prompt_template.format(
        language_code=language_code.upper(),
        json_data=json.dumps(parameters, ensure_ascii=False, indent=4)
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
                    "question": prompt, # Verwende den aus der Config generierten Prompt
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
# Input Archiving helpers
# ============================================================
def _next_archive_path(src: Path, archive_dir: Path) -> Path:
    """
    Determine next archive filename:
    <original-name>.<NNN> (e.g., ism_nodes.json.001, .002, ...)
    """
    archive_dir.mkdir(parents=True, exist_ok=True)
    stem_with_suffix = src.name  # full name incl. .json/.pdf
    max_idx = 0
    for p in archive_dir.glob(stem_with_suffix + ".*"):
        suf = p.suffix  # e.g. ".001"
        if len(suf) >= 2 and suf[1:].isdigit():
            try:
                idx = int(suf[1:])
                if idx > max_idx:
                    max_idx = idx
            except ValueError:
                pass
    next_idx = max_idx + 1
    return archive_dir / f"{stem_with_suffix}.{next_idx:03d}"


def archive_input_file(src: Path, archive_dir: Path) -> Optional[Path]:
    """
    Move input file into archive with sequential extension.
    Archive only if src exists and isn't already inside archive_dir.
    Return target path or None if skipped.
    """
    try:
        # Skip if already inside archive_dir
        try:
            src.resolve().relative_to(archive_dir.resolve())
            return None
        except Exception:
            pass

        if not src.exists():
            return None
        target = _next_archive_path(src, archive_dir)
        shutil.move(str(src), str(target))
        if slog:
            slog.console("file", "filesystem", ":archive", "-", f"Archived input to: {target}")
            slog.file_event(event="input_archived", source=str(src), target=str(target))
        return target
    except Exception as e:
        if slog:
            slog.console("warning", "filesystem", ":archive", "Error", f"{e}", level="warning")
            slog.file_event(event="archive_failed", source=str(src), error=str(e))
        return None


# ============================================================
# NEW: SFTP helpers (inspired by iot_mqtt_agent.py)  
# ============================================================
def _sftp_mkdirs(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    """
    Recursively ensure that remote_dir exists (POSIX).
    """
    remote_dir = posixpath.normpath(remote_dir)
    parts = [p for p in remote_dir.split("/") if p]
    path = "/"
    for p in parts:
        path = posixpath.join(path, p)
        try:
            sftp.chdir(path)
        except IOError:
            sftp.mkdir(path)
            sftp.chdir(path)

def sftp_upload_file(local_path: Path, sftp_cfg: Dict[str, Any]) -> bool:
    """
    Upload local_path to SFTP server into sftp_cfg['remote_path'].
    If 'remote_filename' is set, use it; otherwise keep basename.
    """
    host = sftp_cfg.get("host")
    port = int(sftp_cfg.get("port", 22))
    user = sftp_cfg.get("username")
    pwd  = sftp_cfg.get("password")
    remote_base = sftp_cfg.get("remote_path", "/")
    remote_name = sftp_cfg.get("remote_filename") or os.path.basename(str(local_path))

    if not (host and user and pwd and remote_base):
        if slog:
            slog.console("warning", "sftp", ":config", "Skip", "Incomplete SFTP config; skipping upload.", level="warning")
            slog.file_event(event="sftp_skipped", reason="incomplete_config")
        return False

    try:
        if slog:
            slog.console("info", "sftp", ":connect", "Outgoing", f"{user}@{host}:{port}")
        transport = paramiko.Transport((host, port))
        transport.connect(username=user, password=pwd)
        sftp = paramiko.SFTPClient.from_transport(transport)

        # ensure directory exists
        _sftp_mkdirs(sftp, remote_base)

        remote_path = posixpath.join(remote_base, remote_name)
        sftp.put(str(local_path), remote_path)

        if slog:
            slog.console("info", "sftp", ":put", "Outgoing", f"{local_path} → {remote_path}")
            slog.file_event(event="sftp_upload_ok", local=str(local_path), remote=remote_path)

        sftp.close()
        transport.close()
        return True
    except Exception as e:
        if slog:
            slog.console("error", "sftp", ":put", "Error", f"{e}", level="error")
            slog.file_event(event="sftp_upload_failed", local=str(local_path), error=str(e))
        try:
            transport.close()
        except Exception:
            pass
        return False


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
    inventory_path = Path(paths.get("inventory", "agents/ISMAgent/data/ism_inventory.json"))
    output_path = Path(paths.get("output", "agents/ISMAgent/output/ism_nodes_report.txt"))
    ndjson_path = paths.get("ndjson", "agents/ISMAgent/logs/ism_agent.ndjson")
    dump_dir = Path(paths.get("dump_json_dir", "agents/ISMAgent/logs/node_json"))
    archive_dir = Path(paths.get("archive_dir", "agents/ISMAgent/archive"))

    slog = StructuredLog(ndjson_path, use_color=True)

    # Optional health check
    check_server_health(cfg)

    # Language selection
    lang = (args.language or cfg.get("language") or "en").strip().lower()

    # 1. Read nodes (ism_nodes.json - primary input)
    try:
        nodes = load_nodes(input_path)
    except Exception as e:
        if slog:
            slog.console("error", "main", ":startup", "Error", f"{e}", level="error")
        sys.exit(1)
    
    # 2. Load and map inventory data (ism_inventory.json)
    try:
        inventory_map = load_inventory_map(inventory_path)
    except Exception as e:
        if slog:
            slog.console("error", "main", ":startup", "Error", f"Failed to load inventory map: {e}", level="error")
        # Continue with empty inventory map if loading fails
        inventory_map = {} 
        
    # After successful read: archive input
    archive_input_file(input_path, archive_dir)

    results: List[str] = []

    for idx, node in enumerate(nodes, 1):
        node_name = node.get("Name", f"Node{idx}")
        try:
            # 3. Merge data using the new node_params function
            params = node_params(node, inventory_map) 
            if slog:
                slog.console("proc", "ism", ":process", "-", f"Processing node {idx}/{len(nodes)}: {node_name}")
                slog.file_event(event="node_processing", node=node_name, index=idx)

            # 4. Generate logical sentence
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

    # ─────────────────────────────────────────────────────────
    # Write report (Append-if-exists, Create-if-missing)
    # ─────────────────────────────────────────────────────────
    wrote_ok = False
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        out_text = "\n\n".join(results).rstrip() + "\n"

        if output_path.exists():
            with open(output_path, "a", encoding="utf-8") as f:
                f.write(out_text)
            if slog:
                slog.console("file", "filesystem", ":append", "-", f"Appended {len(out_text)} bytes to: {output_path}")
                slog.file_event(event="report_appended", path=str(output_path), size=len(out_text))
        else:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(out_text)
            if slog:
                slog.console("file", "filesystem", ":write", "-", f"Report created: {output_path}")
                slog.file_event(event="report_written", path=str(output_path), size=len(out_text))
        wrote_ok = True
    except Exception as e:
        if slog:
            slog.console("error", "filesystem", ":write", "Error", f"{e}", level="error")
        sys.exit(3)

    # ─────────────────────────────────────────────────────────
    # SFTP upload and subsequent deletion of the local file
    # ─────────────────────────────────────────────────────────
    if wrote_ok:
        sftp_cfg = cfg.get("sftp") or {}
        if sftp_cfg.get("enabled", False):
            # Starte den Upload und speichere das Ergebnis (True/False)
            upload_ok = sftp_upload_file(output_path, sftp_cfg)
            
            # Lösche die lokale Output-Datei, wenn der Upload erfolgreich war
            if upload_ok:
                try:
                    os.remove(output_path)
                    if slog:
                        slog.console("file", "filesystem", ":delete", "Done", f"Local report deleted after successful SFTP: {output_path}")
                        slog.file_event(event="report_deleted", path=str(output_path))
                except Exception as e:
                    if slog:
                        slog.console("error", "filesystem", ":delete", "Error", f"Failed to delete local report: {e}", level="error")
                        slog.file_event(event="delete_failed", path=str(output_path), error=str(e))

            # Logik für fehlgeschlagenen Upload beibehalten (kein Löschen)
            if not upload_ok:
                # Do not fail the whole job on upload issues; just log
                if slog:
                    slog.console("warning", "sftp", ":post", "Warn", "Upload failed; report remains local.", level="warning")
        else:
            if slog:
                slog.console("info", "sftp", ":post", "Skip", "SFTP disabled in config.")

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