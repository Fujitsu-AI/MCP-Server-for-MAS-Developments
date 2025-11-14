# PrivateGPT MCP Server

A Model Context Protocol (MCP) server implementation that allows you to use PrivateGPT as an agent for your preferred MCP client. This enables seamless integration between PrivateGPT's powerful capabilities and any MCP-compatible application.

> Maintained by [elswa-dev](https://github.com/elswa-dev)

## What is MCP?

MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

### Why MCP?

MCP helps you build agents and complex workflows on top of LLMs. LLMs frequently need to integrate with data and tools, and MCP provides:
- A growing list of pre-built integrations that your LLM can directly plug into
- The flexibility to switch between LLM providers and vendors
- Best practices for securing your data within your infrastructure

### How it Works

At its core, MCP follows a client-server architecture where a host application can connect to multiple servers:

- **MCP Hosts**: Programs like Claude Desktop, IDEs, or AI tools that want to access data through MCP
- **MCP Clients**: Protocol clients that maintain 1:1 connections with servers
- **MCP Servers**: Lightweight programs that each expose specific capabilities through the standardized Model Context Protocol
- **Local Data Sources**: Your computer's files, databases, and services that MCP servers can securely access
- **Remote Services**: External systems available over the internet (e.g., through APIs) that MCP servers can connect to

## Overview

This server provides a bridge between MCP clients and the PrivateGPT API, allowing you to:
- Chat with PrivateGPT using both public and private knowledge bases
- Create and manage knowledge sources
- Organize sources into groups
- Control access through group-based permissions

## Features

### Authentication
- Secure login using email/password credentials
- Automatic token management
- Bearer token authentication for all API requests
- Logout functionality to invalidate tokens

### Chat Capabilities
- Start new chat conversations
- Continue existing chat conversations
- Get chat information and history
- Use public knowledge base
- Use group-specific knowledge bases
- Multi-language support
- Context-aware responses

### Source Management
- Create new sources with markdown formatting
- Edit existing sources (name, content, groups)
- Delete sources
- Assign sources to groups
- List sources by group
- Get source details and metadata
- Track source states (creation → vectorized)

### Group Management
- List personal groups
- List assignable groups
- Create new groups
- Delete existing groups
- Group-based access control
- Personal workspace isolation

### User Management
- Create new users with full configuration
- Edit existing users (all properties)
- Delete users
- Role-based permissions
- FTP access management
- Language and timezone preferences

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Fujitsu-AI/MCP-Server-for-MAS-Developments.git
cd MCP-Server-for-MAS-Developments/clients/Gradio/mcp_servers/pgpt-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

Create a `.env` file with your PrivateGPT credentials:
```env
PRIVATE_GPT_API_URL=http://your-privategpt-instance/api/v1
user=your.email@example.com
password=your_password
```

## MCP Client Setup

### Prerequisites
- Node.js 18 or higher installed
- A running instance of PrivateGPT with API access
- An MCP-compatible client application

### Setup Steps
1. Build the project as described in the Installation section above

2. Configure your MCP client to use this server. The exact configuration depends on your client, but typically involves:
   - Specifying the runtime as `node`
   - Pointing to the compiled server at `dist/index.js`
   - Setting environment variables for PrivateGPT connection

### Example Configuration (Claude Desktop)
```json
{
  "mcpServers": {
    "pgpt": {
      "runtime": "node",
      "command": "node",
      "args": ["path/to/pgpt-mcp-server/dist/index.js"],
      "stdio": "pipe",
      "env": {
        "PRIVATE_GPT_API_URL": "https://your-privategpt-instance/api/v1",
        "user": "your.email@example.com",
        "password": "your_password",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

### Environment Variables
- `PRIVATE_GPT_API_URL`: Your PrivateGPT API endpoint
- `user`: Your PrivateGPT username/email
- `password`: Your PrivateGPT password
- `NODE_TLS_REJECT_UNAUTHORIZED`: Set to "0" for self-signed certificates (development only)

### Troubleshooting
- Verify the server path points to the compiled `dist/index.js` file
- Check that Node.js is accessible from your system PATH
- Ensure the PrivateGPT instance is accessible from your machine
- Verify environment variables are correctly set
- Check your MCP client logs for connection errors

## Usage

Start the server:
```bash
node dist/index.js
```

The server will start and listen on stdio for MCP commands.

## Available Tools

### chat
Start or continue a chat with PrivateGPT.
```typescript
{
  question: string;      // The question or prompt to send
  usePublic?: boolean;   // Whether to use public knowledge base
  groups?: string[];     // Group names to use for RAG
  language?: string;     // Language code (e.g., "en")
}
```

### create_source
Create a new source with automatic markdown formatting.
```typescript
{
  name: string;         // Name of the source
  content: string;      // Content to be formatted as markdown
  groups?: string[];    // Optional groups to assign the source to
}
```

### list_groups
Get available personal and assignable groups.
```typescript
{} // No parameters required
```

### list_sources
List all sources in a specific group.
```typescript
{
  groupName: string;    // Name of the group to list sources from
}
```

### get_source
Get information about a specific source.
```typescript
{
  sourceId: string;     // ID of the source to retrieve
}
```

### continue_chat
Continue an existing chat conversation.
```typescript
{
  chatId: string;       // ID of the chat to continue
  question: string;     // The question or prompt to send
}
```

### get_chat
Get information about an existing chat.
```typescript
{
  chatId: string;       // ID of the chat to retrieve
}
```

### edit_source
Edit an existing source.
```typescript
{
  sourceId: string;     // ID of the source to edit
  name?: string;        // New name for the source (optional)
  content?: string;     // New content for the source (optional)
  groups?: string[];    // New groups for the source (optional)
}
```

### delete_source
Delete an existing source.
```typescript
{
  sourceId: string;     // ID of the source to delete
}
```

### create_group
Create a new group.
```typescript
{
  groupName: string;    // Name of the group to create
}
```

### delete_group
Delete an existing group.
```typescript
{
  groupName: string;    // Name of the group to delete
}
```

### create_user
Create a new user.
```typescript
{
  name: string;         // Full name of the user
  email: string;        // Email address of the user
  password: string;     // Password for the user
  language?: string;    // Language preference (optional, defaults to "en")
  timezone?: string;    // Timezone preference (optional, defaults to "Europe/Berlin")
  usePublic: boolean;   // Whether user can use public knowledge base
  groups: string[];     // Groups to assign to the user
  roles: string[];      // Roles to assign to the user
  activateFtp?: boolean; // Whether to activate FTP access (optional)
  ftpPassword?: string; // FTP password (optional, required if activateFtp is true)
}
```

### edit_user
Edit an existing user.
```typescript
{
  email: string;        // Email address of the user to edit (required)
  name?: string;        // New full name (optional)
  password?: string;    // New password (optional)
  language?: string;    // New language preference (optional)
  timezone?: string;    // New timezone preference (optional)
  publicUpload?: boolean; // Whether user can upload to public (optional)
  groups?: string[];    // New groups for the user (optional)
  roles?: string[];     // New roles for the user (optional)
  activateFtp?: boolean; // Whether to activate FTP access (optional)
  ftpPassword?: string; // New FTP password (optional)
}
```

### delete_user
Delete an existing user.
```typescript
{
  email: string;        // Email address of the user to delete
}
```

### logout
Logout and invalidate the current API token.
```typescript
{} // No parameters required
```

## API Integration Details

### Authentication Flow
1. Server starts with email/password credentials
2. First request triggers login to get Bearer token
3. Token is cached and reused for subsequent requests
4. All API calls use Bearer authentication

### Response Handling
- Success responses include data, message, and status
- Error responses are mapped to appropriate MCP error codes
- Detailed error messages are preserved
- Debug logging helps troubleshoot issues

### Security
- SSL certificate validation (disabled in development)
- Secure credential handling
- Token-based authentication
- Group-based access control

## Development

### Building
```bash
npm run build
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Testing
```bash
npm test
```

## Project Structure

```
src/
  ├── index.ts              # Main server implementation
  ├── types/                # TypeScript type definitions
  │   └── api.ts           # API interface types
  └── services/            # Service implementations
      └── pgpt-service.ts  # PrivateGPT API service
```

## Error Handling

The server handles various error scenarios:
- Authentication failures
- Network errors
- Invalid requests
- API errors
- Rate limiting
- Timeout errors

Errors are mapped to appropriate MCP error codes and include detailed messages for debugging.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.