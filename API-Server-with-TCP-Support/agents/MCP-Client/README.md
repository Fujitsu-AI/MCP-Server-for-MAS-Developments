
# MCP-Client

## Overview
The **MCP Client** is an example Client that uses the PGPT OpenAI-Compatible API (or other providers) and MCP Servers to make use of MCP tools. 


---

## Features
- **Load Multiple MCP servers** 
- **Communicate via Stdio**
- **List tools, and use tools**

## Prerequisites
- **Python:** 3.8 or higher
- **Dependencies:**  
- **Have the OpenAI Compatible API agent running** 
---

## Setup
1. **Clone the Repository:**
   ```bash
   git clone https://github.com/pgpt-dev/MCP-Server-for-MAS-Developments.git
   cd MCP-Server-for-MAS-Developments
   ```

2. **(Optional) Create and Activate a Virtual Environment:**
   - **Windows:**
     ```bash
     python -m venv venv
     .\venv\Scripts\activate
     ```
     
   - **Unix/MacOS:**
     ```bash
     python -m venv venv
     source venv/bin/activate
     ```

3. **Install Dependencies:**
   ```bash
   pip install -r agents/MCP-Client/requirements.txt
   ```

4. **Configure the Agent:**
   Copy the example configuration file and adjust it to your environment:

   ```bash
   cp agents/MCP-Client/.env.example agents/MCP-Client/.env
   ```

   **Example `config.json`:**

   ```env
   PGPT_API_KEY = '<your api key>'
   PGPT_OAI_BASE_URL = '<PGPT OpenAiCompatible API URL>'
   ```


## Running the Agent
To start the MCP-Client, ensure you're in the repository's root directory and the OAI Agent is running and run:

```bash
python -m agents.MCP-Client.Python.mcp_client
```

---


## License
This project is licensed under the MIT License - see the LICENSE file for details.
