# Fsas Technologies AI Team: MCP Server with STDIO Support

This server implements the **Model Context Protocol (MCP)** using the **STDIO (Standard Input/Output)** transport layer. It is the specialized integration client designed to run directly inside applications like **Claude Desktop** or **VS Code**, communicating with the **PGPT API v1.5**.

---

## 🚀 Features

* **Zero Latency:** Direct process communication via pipes (stdin/stdout) eliminates network overhead.
* **Maximum Security:** No open network ports. The server runs purely as a local subprocess.
* **Full Tool Integration:** Implementation of all 23 tools including Chat, Sources, Groups, Users, and Scenarios.
* **Dynamic Configuration:** Managed via `pgpt.env.json` for flexible API targeting.
* **Environment Isolation:** Runs independently of system-wide proxy settings or firewall restrictions (outbound only).

---

## 🛠 Prerequisites

* **Node.js:** Version 22.x (Recommended).
* **PGPT API:** An active instance of PrivateGPT (v1.5) reachable from this machine.
* **Client Application:** Claude Desktop App, VS Code (with MCP extension), or the MCP Inspector.

---

## 📦 Installation (Linux or Windows)

### 🐧 Linux

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git](https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git)
    cd MCP-Server-for-MAS-Developments/MCP-Server-with-STDIO-Support
    ```

2.  **Install Dependencies:**
    Use the provided setup script to handle dependencies and build the project automatically.
    ```bash
    chmod +x Install-MPC-Stdio.sh
    ./Install-MPC-Stdio.sh
    ```

---

### 🪟 Windows

1.  **Clone the Repository:**
    Open PowerShell and run:
    ```powershell
    git clone [https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git](https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git)
    cd MCP-Server-for-MAS-Developments\MCP-Server-with-STDIO-Support
    ```

2.  **Install Dependencies:**
    Use the provided setup script to handle dependencies and build the project automatically.
    ```powershell
    .\Install-MPC-Stdio.ps1
    ```

3.  **Prepare Configuration:**
    Create a `pgpt.env.json` in the root folder of this server.

---

## ⚙️ Configuration (`pgpt.env.json`)

*Note: Since this is an STDIO server, listening ports and SSL certificates are **not** required.*

```json
{
    "PGPT_Url": {
        "API_URL": "https://<your-subdomain>.ai-testdrive.com/api/v1"
    },
    "Proxy_Config": {
        "USE_PROXY": "true",
        "HEADER_ENCRYPTED": "false",
        "ACCESS_HEADER": "<your-anonymized-access-header>"
    },
    "Server_Config": {
        "SSL_VALIDATE": "false",
        "PW_ENCRYPTION": "false",
        "PRIVATE_KEY": "~/.ssh/id_rsa"
    },
    "Functions": {
        "ENABLE_LOGIN": true,
        "ENABLE_LOGOUT": true,
        "ENABLE_CHAT": true,
        "ENABLE_CONTINUE_CHAT": true,
        "ENABLE_GET_CHAT_INFO": true,
        "ENABLE_DELETE_CHAT": true,
        "ENABLE_DELETE_ALL_CHATS": true,
        "ENABLE_CREATE_SOURCE": true,
        "ENABLE_EDIT_SOURCE": true,
        "ENABLE_GET_SOURCE": true,
        "ENABLE_LIST_SOURCES": true,
        "ENABLE_DELETE_SOURCE": true,
        "ENABLE_LIST_GROUPS": true,
        "ENABLE_STORE_GROUP": true,
        "ENABLE_DELETE_GROUP": true,
        "ENABLE_STORE_USER": true,
        "ENABLE_EDIT_USER": true,
        "ENABLE_DELETE_USER": true,
        "ENABLE_REACTIVATE_USER": true,
        "ENABLE_LIST_SCENARIOS": true,
        "ENABLE_CREATE_SCENARIO": true,
        "ENABLE_EDIT_SCENARIO": true,
        "ENABLE_DELETE_SCENARIO": true
    }
}
```

---

## 🏃‍♂️ Integration & Usage

Since this is an STDIO server, you do not "start" it in a terminal to wait for connections. Instead, you configure your client (e.g., Claude) to launch it.

### Option A: Integration with Claude Desktop
Edit your configuration file:
* **MacOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
* **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add the following entry (adjust the path to match your installation):

```json
{
  "mcpServers": {
    "fsas-pgpt-v15": {
      "command": "node",
      "args": [
        "/absolute/path/to/MCP-Server-with-STDIO-Support/dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Option B: Testing with MCP Inspector
To test the tools without Claude, use the MCP Inspector in "Command Mode":

```bash
# Make sure you are in the server directory
cd MCP-Server-with-STDIO-Support

# Launch Inspector
npx @modelcontextprotocol/inspector@latest node dist/index.js
```
* The Inspector UI will open in your browser (usually ` http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=...`).
* Transport Type: `STDIO`
* Command: `node`
* Arguments: `dist/index.js`

* You can now execute tools directly.

---

## 🛠 Tool Categories

| Category | Description |
| :--- | :--- |
| **Authentication** | Login and Logout session management. |
| **Conversations** | Core Chat and Continuation logic. |
| **Data Management** | Source creation, retrieval, and deletion (RAG). |
| **Administration** | Group and User management. |
| **AI Strategy** | Scenario configuration and retriever settings. |

---

## ⚠️ Troubleshooting

### "Module not found" / Path Errors
Claude Desktop requires **absolute paths** in the config file. Do not use relative paths like `./dist/index.js` or `~/`. Always use the full path: `/home/user/...` or `C:\Users\...`.

### "Connection Refused" (in Inspector)
Check your `pgpt.env.json`. Since the server acts as a client to the PGPT API, ensure `API_URL` is reachable and `ACCESS_HEADER` is correct.

### Logs & Debugging
Since there is no console window for STDIO servers, errors are often silent. To debug, try running the server manually with `node dist/index.js`. If it sits silently waiting for input, it is working correctly. If it crashes immediately, check the output error message.

---

## License
This project is licensed under the MIT License - see the LICENSE file for details.