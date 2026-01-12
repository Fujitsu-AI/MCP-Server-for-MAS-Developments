# Fujitsu MCP Server for MAS Developments

This server implements the **Model Context Protocol (MCP)** and acts as a gateway between MCP-compliant clients (e.g., MCP Inspector, Claude Desktop) and the **Fujitsu PrivateGPT API**.

The server supports two transports:
- **Streamable HTTP** (recommended): endpoint **`/mcp`**
- **Legacy SSE** (deprecated but supported): endpoint **`/sse`** with **`/messages`**

---

## Features

- **Full Tool Integration:** Implements the full tool set (Authentication, Chats, Sources, Groups, Users, Scenarios).
- **Streamable HTTP Transport (`/mcp`):** Recommended MCP transport for modern clients.
- **Legacy SSE Transport (`/sse`):** Backward-compatible transport for older clients and specific environments.
- **Dynamic Configuration:** Managed via `pgpt.env.json` (ports, SSL/TLS, API endpoints, feature flags).
- **Encryption Support:**
  - Optional **password decryption** for the `login` tool (`PW_ENCRYPTION`).
  - Optional **proxy access header decryption** (`HEADER_ENCRYPTED`).
- **TLS Support (Inbound):** Optional HTTPS with configurable certificate and key.

---

## Prerequisites

- **Node.js:** Version 18.x or higher.
- **Network:** If used remotely, ensure correct firewall and (optional) SSH port forwarding.
- **API Credentials:** Valid access header/token for the PrivateGPT instance.

---

## Server Installation (Linux or Windows)

### Linux

1. Clone the repository and navigate to the server directory:
   ```bash
   git clone https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git
   cd MCP-Server-for-MAS-Developments/MCP-Server-with-Streamable-HTTP-Support
   ```

2. Install dependencies:
   ```bash
   chmod +x Install-MPC-SSE.sh
   sudo ./Install-MPC-SSE.sh
   ```

---

### Windows

1. Open PowerShell, clone the repository, and navigate to the directory:
   ```powershell
   git clone https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git
   cd MCP-Server-for-MAS-Developments\MCP-Server-with-Streamable-HTTP-Support
   ```

2. Install dependencies:
   ```powershell
   .\Install-MPC-SSE.ps1
   ```

3. Prepare configuration:
   Create `pgpt.env.json` in the root folder using the template below or rename `pgpt.env.json.example`.

---

## Configuration (`pgpt.env.json`)

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
    "HOST": "0.0.0.0",
    "PORT": 5000,
    "SSL_VALIDATE": "false",

    "PW_ENCRYPTION": "false",
    "PRIVATE_KEY": "~/.ssh/id_rsa",

    "ENABLE_TLS": "false",
    "SSL_KEY_PATH": "~/.ssh/certs/server.key",
    "SSL_CERT_PATH": "~/.ssh/certs/server.crt",

    "SSL_CA_PATH": "~/.ssh/certs/ca.crt",
    "REQUIRE_CLIENT_CERT": "false"
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

Notes:
- `SSL_VALIDATE`: Controls **outbound** TLS certificate validation for the backend API (Axios).
- `ENABLE_TLS`: Controls **inbound** TLS (HTTPS) for this MCP server itself.
- `SSL_CA_PATH` and `REQUIRE_CLIENT_CERT` are optional for mTLS.

---

## Transport Endpoints

### Streamable HTTP (recommended)

- **GET /mcp**: Establishes the server-to-client stream.
- **POST /mcp**: Sends JSON-RPC messages to the server.
- **DELETE /mcp**: Closes the session.

Use this transport for MCP Inspector and modern clients unless you have a specific reason to use legacy SSE.

### Legacy SSE (deprecated but supported)

- **GET /sse**: Opens an SSE stream.
- **POST /messages?sessionId=...**: Sends messages for the SSE session.

This mode exists for compatibility. New deployments should prefer Streamable HTTP.

---

## Password Encryption / Decryption (Login Tool)

The server can **decrypt encrypted passwords** sent to the `login` tool.

### How it works

- Enable feature flag:
  - `Server_Config.PW_ENCRYPTION = "true"`
- The server loads the RSA private key from:
  - `Server_Config.PRIVATE_KEY` (supports `~` home expansion)
- The `login` tool expects the `password` field to be **base64-encoded ciphertext**.
- The server attempts RSA decryption using:
  - OAEP padding first (recommended)
  - PKCS#1 v1.5 padding as fallback

If `PW_ENCRYPTION` is `"false"`, the password is forwarded as plain text to the backend API.

### Important Security Notes

- Password encryption is only meaningful if the transport channel is protected (recommended: HTTPS).
- If you run without inbound TLS (`ENABLE_TLS=false`), encryption helps reduce exposure but does not replace transport security.

### Proxy Header Decryption

If `Proxy_Config.HEADER_ENCRYPTED = "true"`, the server also decrypts `ACCESS_HEADER` using the same RSA private key.

---

## Security Hardening

The following hardening measures are recommended for production deployments.

### 1) Prefer HTTPS (Inbound TLS)

Enable inbound TLS to protect:
- MCP session headers
- authentication payloads (including login)
- any tool parameters (sources, users, groups, scenarios)

Configuration keys:
- `Server_Config.ENABLE_TLS = "true"`
- `Server_Config.SSL_KEY_PATH`, `Server_Config.SSL_CERT_PATH`
- optional: `Server_Config.SSL_CA_PATH` for a custom CA

### 2) Consider mTLS (Mutual TLS) for administrative environments

If only managed clients should access the server, enable client certificate verification:
- `Server_Config.REQUIRE_CLIENT_CERT = "true"`
- Ensure `SSL_CA_PATH` points to the CA that issued client certificates

### 3) Restrict CORS and origins

For production, avoid `origin: true`. Prefer an explicit allowlist:
- allow only known web origins (e.g., your internal tools)
- avoid exposing the service to arbitrary browser origins

### 4) Network exposure and reverse proxy

- Bind to localhost if you use a reverse proxy: `Server_Config.HOST = "127.0.0.1"`
- Put a reverse proxy (Nginx/Traefik) in front for:
  - TLS termination
  - IP allowlisting
  - rate limiting
  - centralized logging

### 5) Access control and secret handling

- Keep `ACCESS_HEADER` and RSA private keys out of source control.
- Prefer encrypted configuration values (`HEADER_ENCRYPTED=true`, `PW_ENCRYPTION=true`) where applicable.
- Rotate tokens/headers regularly.

### 6) Outbound TLS validation

Keep `Server_Config.SSL_VALIDATE = "true"` unless you explicitly trust a private CA and have configured it correctly.
Disabling validation should only be used for controlled test environments.

---

## Operation

### 1) Start the server

On the server machine:
```bash
node src/index.js
```

If TLS is enabled, the server starts in HTTPS mode; otherwise HTTP.

### 2) Health check

Open:
- `http://<server-ip>:5000/health` (HTTP)
- `https://<server-ip>:5000/health` (HTTPS)

Expected response: `OK`

### 3) Start MCP Inspector locally

```bash
npx @modelcontextprotocol/inspector
```

### 4) Connect via MCP Inspector

Recommended settings (Streamable HTTP):
- **Transport Type:** `Streamable HTTP`
- **URL:** `http://<server-ip>:5000/mcp` (or `https://.../mcp` if TLS enabled)
- **Connection:** `Direct`

Fallback settings (Legacy SSE):
- **Transport Type:** `SSE`
- **URL:** `http://<server-ip>:5000/sse` (or `https://.../sse` if TLS enabled)
- **Connection:** `Direct`

---

## Tool Categories

| Category | Description |
| --- | --- |
| Authentication | Login and logout session management. |
| Conversations | Chat creation and continuation. |
| Data Management | Source creation/retrieval/deletion for RAG. |
| Administration | Group and user management. |
| AI Strategy | Scenario configuration and retriever settings. |

---

## Troubleshooting

### "Parse error: Invalid JSON" (Streamable HTTP or SSE)

Do not apply `express.json()` or similar body-parsing middleware to `/mcp` or `/messages`.
The MCP SDK transports must read the raw request stream.

### "Session not found" (Legacy SSE)

Ensure that `POST /messages` includes the correct `sessionId` query parameter matching the active `/sse` session.

### Disconnect shows AbortError in the Inspector

Some Inspector/Proxy versions log an `AbortError` when the stream is intentionally closed (e.g., on `DELETE /mcp`).
This is typically a client-side log artifact and not a server malfunction.

---

## License
This project is licensed under the MIT License - see the LICENSE file for details.
