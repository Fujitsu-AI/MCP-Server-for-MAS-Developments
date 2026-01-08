![privateGPT MCP Server](images/privateGPT-MCP.png)

# Fsas Technologies AI Team: 
# Multi-Transport Server Suite (v1.5)

Welcome to the server suite of the **Fsas Technologies AI Team**. This repository provides a highly specialized selection of gateway servers optimized to integrate the **PGPT API** into any IT environment—ranging from established legacy systems to cutting-edge AI agent architectures.



---

## 🚀 The Three Pillars of Our Connectivity

Each server in this package has been developed for a specific use case to ensure maximum performance and stability.

### 1. API Server with TCP Support
**The Bridge for Legacy Systems.**
This server is the ideal tool for environments that do not yet natively support the Model Context Protocol (MCP).
* **Purpose**: Enables older applications to access state-of-the-art AI logic via classic, high-performance TCP connections.
* **Advantage**: High compatibility without the overhead of complex web protocols. Perfect for industrial controls or proprietary software solutions that rely on proven socket communication.

### 2. MCP Server with STDIO Support
**The Standard for Local Integrations.**
This server implements the Model Context Protocol via the standard input/output channel.
* **Purpose**: The primary choice for direct integration into local AI environments such as **Claude Desktop**, **VS Code**, or IDE plugins.
* **Advantage**: Ultra-fast communication with minimal latency. Since no network ports need to be opened, this server offers outstanding security for local workflows directly on the developer machine.
* **⚠️ Requirement**: This server requires a running **PGPT Instance Version 1.5** to ensure full API compatibility.

### 3. MCP Server with Streamable-HTTP-Support (SSE)
**The Powerhouse for Remote and Web Architectures.**
This server utilizes Server-Sent Events (SSE) to realize a stable, bidirectional connection over HTTP.
* **Purpose**: Designed for distributed systems and network access. It is the first choice for the **MCP Inspector** or web-based dashboards.
* **Advantage**: Thanks to the integrated **Stream-Fix** and **Auto-Session-Recovery**, this server is extremely resilient against unstable network connections or SSH tunnels. It makes AI tools reliably usable over long distances.
* **⚠️ Requirement**: This server requires a running **PGPT Instance Version 1.5** to ensure full API compatibility.

---

## 🛠 Common Core Features (v1.5 Full Build)

All servers in this suite are based on the same hardened logic engine developed by the **Fsas Technologies AI Team**:

* **Full Tool Coverage**: Access to all 23 functions of the PGPT API (Chat, RAG Sources, Scenarios, User Management).
* **Intelligent Configuration**: Centrally managed via `pgpt.env.json` for maximum flexibility.
* **Enterprise Security**: Support for RSA-encrypted headers, TLS encryption, and secure SSH key authentication.
* **Optimized for Node.js 20+**: Full utilization of modern ESM modules and asynchronous runtimes for peak efficiency.

---

## 📂 Directory Structure

```text
.
├── API-Server-with-TCP-Support             # Legacy & Custom TCP Gateway
├── MCP-Server-with-STDIO-Support           # Local Agent Integration (Standard)
└── MCP-Server-with-Streamable-HTTP-Support # Remote & Web Gateway (SSE)
```

---

## 🏃‍♂️ Quick Start

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git
    cd MCP-Server-for-MAS-Developments
    ```
2. **Select the desired server**
* **API-Server-with-TCP-Support:** Best for Legacy application integrations & Custom TCP Gateway solutions
* **MCP-Server-with-STDIO-Support:** Local Agent Integration (Standard)
* **MCP-Server-with-Streamable-HTTP-Support:** Remote & Web Gateway (SSE)

3.  **Prepare Configuration:**
    Create a `pgpt.env.json` in the respective server directory with your PGPT API credentials.

4.  **Installation & Launch:**
    Choose your server type and follow the local `INSTALL.md` or use the provided setup script, for example:
    ```bash
    ./Install-MPC-Server.sh
    ```

---

## 📄 License & Copyright
© 2026 **Fsas Technologies AI Team**. All rights reserved.
This suite is optimized for deployment in professional enterprise AI environments.