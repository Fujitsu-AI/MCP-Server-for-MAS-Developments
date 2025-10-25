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
