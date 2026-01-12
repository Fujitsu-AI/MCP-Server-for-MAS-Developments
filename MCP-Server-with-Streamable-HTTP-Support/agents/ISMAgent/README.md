# Fujitsu PrivateGPT ISM Agent

The **ISM Agent** is a Python-based automation component that processes Infrastructure and Server Management (ISM) data, analyzes node information, and generates descriptive, human-readable reports via an integrated Chatbot Agent.  
It uses structured, emoji-safe logging for clean console and NDJSON outputs, and follows the FIPA ACL (Agent Communication Language) standard for interoperability in multi-agent ecosystems.

---

## Features

- **Structured Logging (IoT-Style)**  
  Aligned, emoji-safe console logs with NDJSON support for downstream analytics.

- **Config-Driven Operation**  
  All input, output, and log paths are configurable via `config.json`.

- **PDF and JSON Input**  
  Reads ISM node data from JSON files or embedded JSON inside PDFs.

- **FIPA ACL Communication**  
  Requests technical, language-based descriptions for each node from a Chatbot Agent via FIPA ACL payloads.

- **Retry & Backoff**  
  Robust retry with exponential backoff for transient network errors.

- **Structured Output Reports**  
  Generates text reports that summarize each node and writes them to an output file.

- **Optional NDJSON Event Log**  
  Machine-readable event stream for observability and audit trails.

- **NEW: Optional SFTP Upload**  
  After the report is written, the agent can **upload the output file to a remote SFTP server**.  
  The agent **creates the remote directory path if it does not exist** (recursive, idempotent).

---

## How It Works

1. **Configuration Loading**  
   The agent loads `config.json`.

2. **Health Check (optional)**  
   If `chatbot_agent.health_url` is provided, a quick GET is performed (non-blocking).

3. **Input Read & Archive**  
   ISM nodes are read from JSON (or from embedded JSON in a PDF).  
   On successful read, the input file is archived into `paths.archive_dir` with a sequential suffix (e.g., `ism_nodes.json.001`).

4. **Per-Node Processing**  
   For each node, parameters are normalized and a FIPA ACL request is sent to the Chatbot Agent.  
   Responses are appended to an in-memory list; optional per-node dumps are written to `paths.dump_json_dir`.

5. **Report Write**  
   The aggregated text is written/appended to `paths.output`.

6. **(Optional) SFTP Upload**  
   If `sftp.enabled` is `true`, the output file is uploaded via SFTP:
   - The agent **ensures the remote directory exists** by creating all missing path segments before upload.
   - The remote file name can be overridden or defaults to the local file name.

7. **Exit Codes**  
   The agent exits non-zero on critical failures (e.g., unreadable input, failed write). SFTP upload errors are **logged but do not fail** the run unless you explicitly gate on them externally.

---

## Configuration

Create or edit `agents/ISMAgent/config.json`. Minimal structure:

## 🧾 Configuration Reference (Parameters within `<>` have to be set according your configuration)

```json
{
  "meta": {
    "agent_name": "ISM Agent",
    "version": "1.0.1",
    "created": "2025-10-30",
    "description": "Fixed configuration for the ISM Agent demo setup."
  },
  "paths": {
    "input": "agents/ISMAgent/data/ism_nodes.json",
    "inventory": "agents/ISMAgent/data/ism_inventory.json",
    "output": "agents/ISMAgent/output/ism_nodes_report.txt",
    "ndjson": "agents/ISMAgent/logs/ism_agent.ndjson",
    "dump_json_dir": "agents/ISMAgent/logs/node_json",
    "archive_dir": "agents/ISMAgent/archive"
  },
  "chatbot_agent": {
    "api_url": "http://127.0.0.1:5001/ask",
    "api_key": "<API_KEY>",
    "use_public": false,
    "groups": ["<YOUR GROUP 1>", "<YOUR GROUP 2>", "<YOUR GROUP xyz>"],
    "timeout_seconds": 20,
    "prompt_template": "Generate a concise, detailed technical report in a single paragraph (in {language_code}) based on the merged node data. Explicitly include the Model, Status, CPU Summary (count, model, speed), Memory Summary (total size, frequency), Storage Summary (type, capacity), Supported OS List, Firmware Details, and any detected Hardware Issues or Alerts (AlarmStatus). Node data: {json_data}"
  },
  "sftp": {
    "enabled": true,
    "host": "<SFTP_HOST>",
    "port": <PORT>,
    "username": "<SFTP_USER>",
    "password": "<SFTP_PASSWORD>",
    "remote_path": "/<GROUP_NAME>",
    "remote_filename": null
  },
  "language": "en"
}
```


### SFTP Options (details)

| Key               | Type     | Default | Description |
|-------------------|----------|---------|-------------|
| `enabled`         | boolean  | `false` | Enable/disable SFTP upload stage. |
| `host`            | string   | —       | SFTP server hostname/IP. |
| `port`            | integer  | `22`    | SFTP port. |
| `username`        | string   | —       | Login user. |
| `password`        | string   | —       | Login password (or use key-based auth by extending the code if desired). |
| `remote_path`     | string   | `"/"`   | **Target directory path on the SFTP server.** If it does not exist, the agent **creates it recursively**. The `remote_path` must correspond to an existing group of the PGPT user. Otherwise, the data will not be automatically imported. The user's SFTP access must also be activated at PGPT and the password for SFTP must be set.|
| `remote_filename` | string\|null | `null` | Optional override for the uploaded file name. If `null` or omitted, the local output file name is used. |


> **Directory creation behavior:**  
> Before uploading, the agent computes the final `remote_path/remote_filename` and **ensures the parent directory exists**, creating any missing segments (e.g., `/upload/ism/reports/2025/10`). This is safe and idempotent.

### Security Notes

- Prefer **secrets management** for credentials (e.g., environment variables or vaults).  
- If possible, use **key-based authentication** on the SFTP server (extend the code to load a private key via Paramiko).  
- Restrict SFTP accounts to a chrooted home and least privileges.  
- Consider rotating `api_key` and SFTP credentials regularly.

---

## PowerShell Launcher Script (`start_ism_agent.ps1`)

The provided PowerShell wrapper offers a Windows-friendly way to execute the agent without juggling Python arguments.

### Parameters

| Parameter   | Type    | Default                              | Description |
|-------------|---------|--------------------------------------|-------------|
| `ConfigPath`| string  | `agents\ISMAgent\config.json`        | Path to the configuration file. |
| `VerboseLog`| switch  | `$false`                             | Enables `--verbose` for detailed logs. |
| `Language`  | string  | `""`                                 | Overrides language (e.g., `en`, `de`). |
| `Delay`     | double  | `0.5`                                | Inter-request delay passed to the agent. |

### What the script does

1. Forces **UTF-8** output (PowerShell + Python).  
2. Installs/updates Python dependencies from `agents\ISMAgent\requirements.txt` (includes `paramiko` for SFTP).  
3. Validates config file presence.  
4. Builds arguments and runs:  
   ```powershell
   python -m agents.ISMAgent.Python.ism_agent --config agents\ISMAgent\config.json
   ```  
5. Surfaces success/failure based on the agent’s exit code.

### Example Usage

```powershell
# Start with default config
.\start_ism_agent.ps1

# Verbose logging
.\start_ism_agent.ps1 -VerboseLog

# Different config path
.\start_ism_agent.ps1 -ConfigPath "C:\custom\ism_config.json"

# German language and 1.0s delay
.\start_ism_agent.ps1 -Language "de" -Delay 1.0
```

---

## SFTP in Practice

### Prerequisites

- Python dependency: **paramiko** (should be in `requirements.txt`).  
  If needed:
  ```bash
  pip install paramiko
  ```

- Network/firewall allows outbound TCP **22** (or your custom port) to the SFTP server.

### Typical Workflow

1. Configure the `sftp` block in `config.json`.  
2. Run the agent (e.g., via `start_ism_agent.ps1`).  
3. After the report is written to `paths.output`, the agent:
   - Builds the target `remote_path` + `remote_filename` (or uses the local file name).
   - **Ensures** the parent directory exists on the server (recursively creates missing folders).
   - Uploads the file via SFTP.
4. Success or errors are logged to console and NDJSON log.  
   - **Note:** SFTP failures **do not fail** the overall run; they are warned and recorded so you can retry externally.

### Example SFTP Config Variants

**A) Simple flat folder**
```json
"sftp": {
  "enabled": true,
  "host": "sftp.example.org",
  "port": 22,
  "username": "uploader",
  "password": "secret",
  "remote_path": "/upload/ism/reports"
}
```

**B) Dated roll-up with custom filename**
```json
"sftp": {
  "enabled": true,
  "host": "10.0.0.10",
  "username": "ci",
  "password": "ci-password",
  "remote_path": "/<insert groupname PGPT>",
  "remote_filename": "ism_nodes_report_2025-10-26.txt.example"
}
```

---

## Logs & Observability

- **Console**: human-readable, emoji-safe aligned messages.  
- **NDJSON** (`paths.ndjson`): per-event records, e.g.:
  - `nodes_loaded`, `node_processing`, `report_written`, `sftp_upload_ok`, `sftp_upload_failed`, `sftp_mkdir`, etc.

You can ingest NDJSON into your observability stack (Elastic, Loki, etc.).

---

## Troubleshooting

- **“Input file not found”**  
  Check `paths.input` and working directory. The launcher script prints your config path.

- **Chatbot timeouts**  
  Increase `chatbot_agent.timeout_seconds`; verify `api_url` reachability and API key.

- **SFTP upload skipped**  
  Ensure `sftp.enabled` is true and **all required fields** are provided (`host`, `username`, `password`, `remote_path`). See logs for `sftp_skipped`.

- **SFTP directory missing**  
  The agent **creates it automatically**. If it still fails, check permissions of the SFTP account and server chroot settings.

- **Unicode in Windows console**  
  Use Windows Terminal or ensure UTF-8 output:
  ```powershell
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  ```

---

## Development Notes

- Code style: robust error handling, clear logging, retries with capped backoff.
- Input archive: moves the consumed input to `paths.archive_dir` with incremental suffix.
- The SFTP code is written to be idempotent and tolerant of race conditions during directory creation.

---

