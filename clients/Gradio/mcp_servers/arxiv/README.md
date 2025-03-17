# arXiv MCP Server Integration

This integration allows you to use the arXiv MCP Server with the Gradio client. The arXiv MCP Server provides tools for searching, downloading, and reading arXiv papers.

## Prerequisites

- Python 3.10 or higher
- Node.js 16 or higher

## Installation

1. Install the arxiv-mcp-server package:
   ```bash
   pip install arxiv-mcp-server
   ```

2. Make sure the arxiv-stdio.js script is executable:
   ```bash
   chmod +x arxiv-stdio.js
   ```

## Configuration

Add the arxiv server to your server_config.json file:

```json
{
  "mcpServers": {
    "arxiv": {
      "command": "node",
      "args": [
        "clients/Gradio/mcp_servers/arxiv/arxiv-stdio.js"
      ]
    }
  }
}
```

## Available Tools

The arXiv MCP Server provides the following tools:

1. **search_papers**: Search for papers on arXiv
   - Parameters:
     - query: The search query
     - max_results: Maximum number of results to return (default: 10)

2. **download_paper**: Download a paper from arXiv
   - Parameters:
     - paper_id: The arXiv ID of the paper

3. **list_papers**: List downloaded papers
   - Parameters: None

4. **read_paper**: Read a downloaded paper
   - Parameters:
     - paper_id: The arXiv ID of the paper

## Example Usage

Here are some example prompts to use with the arXiv MCP Server:

- "Search for papers about large language models"
- "Download the paper with ID 2303.08774"
- "List all downloaded papers"
- "Read the paper with ID 2303.08774"

## Troubleshooting

If you encounter any issues, make sure:

1. The arxiv-mcp-server package is installed
2. The arxiv-stdio.js script is executable
3. The server_config.json file is correctly configured
4. You have an active internet connection to access arXiv
