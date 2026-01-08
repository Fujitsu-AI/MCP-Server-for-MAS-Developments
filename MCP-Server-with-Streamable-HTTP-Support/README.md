# Fujitsu MCP Server for MAS Developments

This server implements the **Model Context Protocol (MCP)** using the **SSE (Server-Sent Events)** transport layer. It serves as a specialized gateway between MCP-compliant clients (like the MCP Inspector or Claude Desktop) and the **Fujitsu PrivateGPT API**.

---

## 🚀 Features

* **Full Tool Integration:** Implementation of all 23 tools including Chat, Sources, Groups, Users, and Scenarios.
* **SSE Transport Mode:** High-stability HTTP streaming connection, optimized for remote and tunneled environments.
* **Dynamic Configuration:** Fully managed via `pgpt.env.json` (Ports, SSL, API Endpoints, and Feature Flags).
* **Stream-Safe Architecture:** Engineered to prevent "Stream not readable" errors commonly encountered in SSH-tunneled Node.js environments.
* **Auto-Session Bind:** Features a "Single-User Auto-Fix" logic to maintain connection stability even during network fluctuations.

---

## 🛠 Prerequisites

* **Node.js:** Version 18.x or higher.
* **Network:** SSH access for remote port forwarding (Tunneling).
* **API Credentials:** Valid access headers for the PrivateGPT instance.

---

## 📦 Server Installation (Linux or Windows)

### 🐧 Linux

1.  **Log in to your server as a user with sudo privileges and clone the repository:**
    ```bash
    git clone [https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git](https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git)
    cd MCP-Server-for-MAS-Developments/MCP-Server-with-Streamable-HTTP-Support
    ```

2.  **Install dependencies:**
    ```bash
    chmod +x Install-MPC-SSE.sh
    sudo ./Install-MPC-SSE.sh
    ```

---

### 🪟 Windows

1.  **Open PowerShell, clone the repository, and navigate to the directory:**
    ```powershell
    git clone [https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git](https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git)
    cd MCP-Server-for-MAS-Developments\MCP-Server-with-Streamable-HTTP-Support
    ```

2.  **Install dependencies:**
    Run the installation script (ensure execution policies allow running scripts):
    ```powershell
    .\Install-MPC-SSE.ps1
    ```
  
3.  **Prepare Configuration:**
    Create a `pgpt.env.json` in the root folder using the template below or rename the existing `pgpt.env.json.example`.

---

## ⚙️ Configuration (`pgpt.env.json`)
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
        "PORT": 5000,
        "SSL_VALIDATE": "false",
        "PW_ENCRYPTION": "false",
        "PRIVATE_KEY": "~/.ssh/id_rsa",
        "ENABLE_TLS": "false",
        "SSL_KEY_PATH": "~/.ssh/certs/server.key",
        "SSL_CERT_PATH": "~/.ssh/certs/server.crt"
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

## 🏃‍♂️ Operation

### 1. Start the Server
On the remote machine (your server), execute the following command:
```bash
node src/index.js
```
The console will display: `SERVER v14.0 (COMPLETE) RUNNING on Port 5000`.

### 2. Check the connection
Open your browser and use the url: `http://<your server ip>:5000/health`
The server must respond with a version message, e.g. `V14 ONLINE`. If not, check the network, firewall settings etc.

### 3. Start the MCP Inspector on your local PC for testing
```bash
npx @modelcontextprotocol/inspector
```

### 4. Connect via MCP Inspector
Open the MCP Inspector on your local browser and use these settings, please select `SSE` as the `Streamable HTTP` entry is misleading!
* **Transport Type:** `SSE`
* **URL:** `http://<your server ip>:5000/sse`
* **Connection** `Direct`

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

### "Stream is not readable"
The server v14 has `express.json()` disabled by default to prevent interference with the SSE stream. Ensure no other middleware intercepts the POST body.

### "Session not found" / 404
Simply refresh the client (F5). The server's Auto-Fix Bind will automatically pick up the latest transport session.

---

## 📄 License
© 2026 Fujitsu MAS Development Team. All rights reserved.