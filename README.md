[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/fujitsu-ai-mcp-server-for-mas-developments-badge.png)](https://mseep.ai/app/fujitsu-ai-mcp-server-for-mas-developments)

![privateGPT MCP Server](images/privateGPT-MCP.png)

# Fsas Technologies AI Team: MCP and TCP Multi-Transport Server and Agents Suite (v1.5)

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

# Security
The following security features are implemented to ensure data protection and secure communication between the client application and server. These features cover encryption, decryption, key management, and transport security.

---

## 1. Transport Layer Security (TLS)
- To secure communication between the client and server, TLS can be activate. All data transmitted between the client and server is encrypted using TLS (minimum version 1.2).

## Why Should TLS Be Enabled Between Client and Server?

### a. **Encryption of Communication**
- TLS (Transport Layer Security) ensures that all data transmitted between the client and server is encrypted. This protects sensitive information such as passwords, credit card details, and personal data from eavesdropping attacks (Man-in-the-Middle attacks).

### b. **Data Integrity**
- TLS guarantees that the transmitted data remains unchanged and unaltered. The integrity check ensures that the received data is exactly as it was sent.

### c. **Authentication**
- TLS enables secure authentication of the server (and optionally the client) through digital certificates. This prevents users from falling victim to phishing attacks on fake websites.

### d. **Protection Against Man-in-the-Middle Attacks**
- TLS encrypts the connection, making it nearly impossible for attackers to intercept or manipulate traffic. Without TLS, attackers could capture and modify data packets.

### e. **Compliance with Security Standards and Regulations**
- Many regulatory requirements (e.g., GDPR, PCI-DSS) mandate secure data transmission. TLS is a fundamental component of these security requirements.

### f. **Prevention of Downgrade and Replay Attacks**
- TLS protects against attacks that attempt to downgrade a connection to an insecure version (downgrade attacks) or replay previously valid requests (replay attacks).

## Conclusion
Enabling TLS between client and server is essential to ensure data privacy, security, and communication integrity. It not only protects sensitive information but also helps meet compliance requirements and increases user trust.

---

## 2. Password Encryption
Passwords can be encrypted using RSA (Rivest–Shamir–Adleman) public-key cryptography. This ensures that sensitive data, such as user passwords, are never transmitted in plaintext.

### Method
- **Public key encryption** with a **up to 4096-bit key length**.
- **Padding**: `RSA_PKCS1_PADDING` to enhance security and prevent known padding attacks.

### Process
1. The server administrator encrypts the client's password using the server's public key (`id_rsa_public.pem`) by executing `node security/generate_encrypted_password.js ~/.ssh/id_rsa_public.pem` and hand out the encrpyted password to the client.
2. Alternatively: The client encrypts the password using the server's public key (`id_rsa_public.pem`) by using the `keygen` - Function. Therefore the function has to be enabled in the server's config (`privateGPT.env.json`). Important: Using this function also means transmitting data via the network. Therefore, make sure that the data traffic is secure and cannot be intercepted.
3. Finally, the encrypted password is sent to the server, where it is decrypted using the server's private key.

### Advantages
- **Asymmetric encryption** ensures that only the server can decrypt the password.
- Even if the communication channel is compromised, encrypted data remains secure.

## 3. Key Management
To secure data communication and encryption processes, the following key management principles are followed:

### Public Key
- Stored securely on the server (`id_rsa.pub`).
- Used only for encryption and does not pose a security risk if exposed.

### PEM Key
- Stored securely on the server (`id_rsa_public.pem`).
- Has to be created by using the public cert (see: [Server Configuration](#server-configuration))

### Private Key
- Stored securely on the server (`id_rsa`).
- Restricted access with appropriate file permissions (`chmod 600`).
- Used exclusively for decryption operations.

### Key Rotation
- Keys can be rotated periodically or upon detection of a security incident. Important: if these are reissued, the clients or AI agents immediately lose access to the MCP server and require a new RSA key (encrypted password)!
- Old keys are securely invalidated.

## 4. Decryption on the Server
Decryption is exclusively performed on the server using the private key:

### Process
1. The server receives the encrypted password from the client.
2. The private key decrypts the password to retrieve the original plaintext.
3. The decrypted password is used internally (e.g., authentication) and never stored in plaintext.

### Secure Handling
- Decrypted passwords exist in memory only for the duration of processing.
- Secure memory management practices ensure sensitive data is cleared immediately after use.

### Certificate Validation
- Certificates are validated on both sides to ensure the authenticity of the server and client.
- Optionally, mutual TLS can be enabled for enhanced security.

## 5. Authorization Tokens
Tokens are used to authenticate requests and ensure only authorized users can access the system:

### Token Management
- Tokens are generated upon successful login.
- They are short-lived and automatically expire after a predefined time.
- Tokens are signed using HMAC or RSA, making them tamper-proof.

## License
This project is licensed under the MIT License - see the LICENSE file for details.