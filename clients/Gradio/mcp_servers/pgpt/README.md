# mcp-server-pgpt
Model Context Protocol server to access PrivateGPT functionalities

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/release/python-3120/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Demos


https://github.com/user-attachments/assets/dc4e377b-4efb-43e6-85fa-93ed852fe21f

uv sync

## Quickstart

To try this in Claude Desktop app, add this to your claude config files:

```json
{
  "mcpServers": {
    "mcp-server-oracle": {
      "command": "uvx",
      "args": [
        "mcp-server-oracle"
      ],
      "env": {
        "ORACLE_CONNECTION_STRING": "username/password@hostname:password/service_name"
      }
    }
  }
}
```

### Prerequisites

- UV (pacakge manager)
- Python 3.12+
- Claude Desktop

### Installation

#### Claude Desktop Configuration

Add the server configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application\ Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`


## Contributing

1. Fork the repository from [mcp-server-oracle](https://github.com/hdcola/mcp-server-oracle)
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
