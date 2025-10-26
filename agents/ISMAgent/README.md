# Fujitsu PrivateGPT ISM Agent

The **ISM Agent** is a Python-based automation component that processes Infrastructure and Server Management (ISM) data, analyzes node information, and generates descriptive, human-readable reports via an integrated Chatbot Agent.  
It uses structured, emoji-safe logging for clean console and NDJSON outputs, and follows the FIPA ACL (Agent Communication Language) standard for interoperability in multi-agent ecosystems.

---

## Features

- **Structured Logging (IoT-Style):**  
  Provides aligned, emoji-safe console logs with NDJSON support for external analysis or dashboards.

- **Config-Driven Operation:**  
  All input, output, and log paths are fully configurable via `config.json`, allowing seamless integration into larger multi-agent systems.

- **PDF and JSON Input:**  
  Reads ISM node data either from standard JSON files or directly from embedded JSON in PDF reports.

- **FIPA ACL Communication:**  
  Communicates with a Chatbot Agent using the **FIPA ACL** standard to request language-based logical descriptions of ISM nodes.

- **Retry and Backoff Mechanism:**  
  Automatically retries chatbot requests with exponential backoff in case of network issues or timeouts.

- **Structured Output Reports:**  
  Generates complete text-based technical summaries describing each ISM node and stores them in a target output file.

- **Optional NDJSON Logging:**  
  Creates structured machine-readable logs for further analytics or ingestion into data lakes or Elastic environments.

---

## How It Works

1. **Configuration Loading:**  
   The agent loads its configuration from `agents/ISMAgent/config.json`.  
   Example structure:
   ```json
   {
     "paths": {
       "input": "agents/ISMAgent/data/ism_nodes.json",
       "output": "agents/ISMAgent/output/ism_nodes_report.txt",
       "ndjson": "agents/ISMAgent/logs/ism_agent.ndjson",
       "dump_json_dir": "agents/ISMAgent/logs/node_json"
     },
     "chatbot_agent": {
       "api_url": "http://127.0.0.1:5001/ask",
       "api_key": "IhrSichererAPIKey123",
       "use_public": true,
       "groups": [],
       "timeout_seconds": 20
     },
     "language": "en"
   }
   ```

---

## PowerShell Launcher Script (`start_ism_agent.ps1`)

The included **PowerShell startup script** provides a Windows-friendly way to execute the ISM Agent without manually handling Python arguments or dependencies.  
It automates setup, verification, and launch tasks, ensuring smooth execution of the Python-based ISM Agent.

---

### 🧩 Overview

This script wraps the execution of the Python agent `agents/ISMAgent/Python/ism_agent.py` and provides a **clean command-line interface** with optional parameters for logging, language selection, and startup delay.

---

### ⚙️ Parameters

| Parameter | Type | Default | Description |
|------------|------|----------|--------------|
| `ConfigPath` | `string` | `"agents\ISMAgent\config.json"` | Path to the agent’s configuration file. |
| `VerboseLog` | `switch` | `$false` | Enables detailed console logging when set. |
| `Language` | `string` | `""` | Overrides the default language setting (e.g. `"en"` or `"de"`). |
| `Delay` | `double` | `0.5` | Delay factor (in seconds) passed to the Python agent for throttled operations. |

---

### 🔧 Functionality

1. **UTF-8 Output Configuration:**  
   Ensures that PowerShell and Python use UTF-8 encoding for clean emoji/log output:
   ```powershell
   $env:PYTHONIOENCODING = "utf-8"
   [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   ```

2. **Dependency Check:**  
   Automatically installs or updates Python dependencies before startup:
   ```powershell
   pip install -r agents\ISMAgent\requirements.txt
   ```

3. **Configuration Validation:**  
   Verifies that the given config file exists.  
   If not found, the script terminates with an error message:
   ```powershell
   if (-not (Test-Path -LiteralPath $ConfigPath)) {
       Write-Error "Config file not found: $ConfigPath"
       exit 1
   }
   ```

4. **Dynamic Argument Assembly:**  
   Constructs a precise argument list for the Python module:
   ```powershell
   python -m agents.ISMAgent.Python.ism_agent --config agents\ISMAgent\config.json
   ```
   Optional parameters (`--verbose`, `--language`, `--delay`) are added automatically.

5. **Agent Execution:**  
   Runs the Python module in the current console window and waits until completion:
   ```powershell
   Start-Process -FilePath "python" -ArgumentList $argList -NoNewWindow -PassThru -Wait
   ```

6. **Exit Code Handling:**  
   The script monitors the agent’s return code and displays a success or error message accordingly:
   ```powershell
   ✅ ISM Agent finished successfully.
   ❌ ISM Agent exited with code X.
   ```

---

### 🧠 Example Usage

```powershell
# Start the agent with default configuration
.\start_ism_agent.ps1

# Run with verbose logging
.\start_ism_agent.ps1 -VerboseLog

# Specify a different configuration file
.\start_ism_agent.ps1 -ConfigPath "C:\custom\ism_config.json"

# Run in German with 1 second delay between operations
.\start_ism_agent.ps1 -Language "de" -Delay 1.0
```

---

### 💡 Notes

- The script **requires Python** to be available in the system path.  
- It is **safe to re-run** multiple times; dependencies will be checked each time.
- UTF-8 output ensures correct rendering of emoji and non-ASCII logs in PowerShell and Windows Terminal.
- Designed for **automation, integration tests**, or **non-developer environments** where manual Python handling should be avoided.
