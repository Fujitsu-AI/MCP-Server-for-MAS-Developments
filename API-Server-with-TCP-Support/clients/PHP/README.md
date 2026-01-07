# MCP Agent Examples (PHP)
This repository contains examples for interacting with the MCP server using **PHP**. Each console application demonstrates a specific operation and its corresponding server interaction.

## Main Menu
Choose an operation from the list below. Each example demonstrates a specific server interaction.

### 1. Authentication
[1.1 Login User](#10-mcploginclient)
[1.2 Logout User](#12-mcplogoutclient)

### 2. Chat Operations
[2.1 Start a New Chat](#20-mcpchatclient)
[2.2 Continue a Chat Session](#21-mcpcontinuechatclient)
[2.3 Retrieve Chat Info](#22-mcpgetchatinfoclient)

### 3. Source Management
[3.1 Create a New Source](#30-mcpcreatesourceclient)
[3.2 Retrieve Source Details](#31-mcpgetsourceclient)
[3.3 List All Sources in a Group](#32-mcplistsourcesclient)
[3.4 Edit an Existing Source](#33-mcpeditsourceclient)
[3.5 Delete a Source](#34-mcpdeletesourceclient)

### 4. Group Management
[4.1 List All Groups](#40-mcplistgroupsclient)
[4.2 Create/Update a Group](#41-mcpstoregroupclient)
[4.3 Delete a Group](#42-mcpdeletegroupclient)

### 5. User Management
[5.1 Create/Update a User](#50-mcpstoreuserclient)
[5.2 Edit User Details](#51-mcpedituserclient)
[5.3 Delete a User](#52-mcpdeleteuserclient)

---

### 1.0 MCPLoginClient
- **Purpose**: Handles user authentication by sending login requests to the MCP server.

- **Main Features**:
  - Sends a `login` command to the server with user credentials.
  - Handles JSON-based requests and parses the server's response.
  
- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--email`: User email for authentication.
  - `--password`: User password for authentication.
  
- **Usage Example**:
  ```bash
  php MCPLoginClient.php ^
      --server-ip 127.0.0.1 ^
      --server-port 1234 ^
      --email user@example.com ^
      --password secret
  ```

### 1.2 MCPLogoutClient
- **Purpose**: Logs out an authenticated user by invalidating their session token.

- **Main Features**:
  - Sends a `logout` command to the server.
  - Invalidates the token provided in the request.
  
- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token to be invalidated.
  
- **Usage Example**:
  ```bash
  php MCPLogoutClient.php ^
      --server-ip 127.0.0.1 ^
      --server-port 1234 ^
      --token MyToken
  ```

---

### 2.0 MCPChatClient
- **Purpose**: Initiates a new chat session with the MCP server.

- **Main Features**:
  - Sends a `chat` command to the server with a question.
  - Supports optional parameters for public chats, groups, and language.
  
- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token.
  - `--question`: Initial question for the chat session.
  - `--use-public`: Optional flag for public chat.
  - `--groups`: Optional group list.
  - `--language`: Optional language parameter.
  
- **Usage Example**:
  ```bash
  php MCPChatClient.php ^
      --server-ip 127.0.0.1 ^
      --server-port 1234 ^
      --token MyToken ^
      --question "Hello World" ^
      --use-public ^
      --groups "devops,hr" ^
      --language en
  ```

### 2.1 MCPContinueChatClient
- **Purpose**: Continues an existing chat session by sending follow-up messages.

- **Main Features**:
  - Sends a `continue_chat` command to the server.
  - Provides the conversation ID and follow-up message.
  
- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token.
  - `--conversation-id`: ID of the conversation to continue.
  - `--message`: Follow-up message.
  
- **Usage Example**:
  ```bash
  php MCPContinueChatClient.php ^
      --server-ip 127.0.0.1 ^
      --server-port 1234 ^
      --token MyToken ^
      --conversation-id 12345 ^
      --message "Can you provide an update?"
  ```

### 2.2 MCPGetChatInfoClient
- **Purpose**: Retrieves metadata and status information about an existing chat session.

- **Main Features**:
  - Sends a `get_chat_info` command to the server.
  - Extracts and displays information about the chat session.
  
- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token.
  - `--chat-id`: ID of the chat session to retrieve information for.
  
- **Usage Example**:
  ```bash
  php MCPGetChatInfo.php ^
      --server-ip 127.0.0.1 ^
      --server-port 1234 ^
      --token MyToken ^
      --chat-id 6789
  ```

---

### 3.0 MCPCreateSourceClient
- **Purpose**: Creates a new source on the MCP server and associates it with specified groups.

- **Main Features**:
  - Sends a `create_source` command with details such as name, content, and associated groups.
  - Provides robust error handling for missing arguments and server communication issues.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the session.
  - `--name`: Name of the source to create.
  - `--content`: Content of the source in plain text or markdown.
  - `--groups`: (Optional) List of groups to associate with the source.

- **Usage Example**:
```bash
php MCPCreateSourceClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --name "Sample Source" ^
    --content "This is a test content" ^
    --groups devops hr
```

---

### 3.1 MCPGetSourceClient
- **Purpose**: Fetches detailed information about a specific source from the MCP server.

- **Main Features**:
  - Sends a `get_source` command to the server with the source ID as a parameter.
  - Retrieves and displays the source's metadata and contents.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the server.
  - `--source-id`: Unique ID of the source to retrieve.

- **Usage Example**:
```bash
php MCPGetSourceClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --source-id 12345
```

### 3.2 MCPListSourcesClient
- **Purpose**: Lists all sources belonging to a specified group on the MCP server.

- **Main Features**:
  - Sends a `list_sources` command with the group name as a parameter.
  - Displays a list of sources available in the specified group.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the server.
  - `--group-name`: Name of the group for which to list sources.

- **Usage Example**:
```bash
php MCPListSourcesClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --group-name devops
```

### 3.3 MCPEditSourceClient
- **Purpose**: Edits the details of an existing source on the MCP server.

- **Main Features**:
  - Sends an `edit_source` command with optional updates for the source title, content, and group associations.
  - Supports adding or updating multiple groups for the source.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the server. 
  - `--source-id`: ID of the source to edit.
  - `--title`: (Optional) New title for the source.
  - `--content`: (Optional) New content for the source.
  - `--groups`: (Optional) List of groups to associate with the source.

- **Usage Example**:
```bash
php MCPEditSourceClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --source-id 12345 ^
    --title "Updated Title" ^
    --content "Updated content for the source." ^
    --groups devops finance
```

### 3.4 MCPDeleteSourceClient
- **Purpose**: Deletes a specific source from the MCP server.

- **Main Features**:
  - Sends a `delete_source` command to remove the source identified by its ID.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the server.
  - `--source-id`: ID of the source to delete.

- **Usage Example**:
```bash
php MCPDeleteSourceClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --source-id 12345
```

---

### 4.0 MCPListGroupsClient
- **Purpose**:
Lists all the groups available on the MCP server.

- **Main Features**:
  - Sends a `list_groups` command to retrieve the available groups.
  - Outputs the groups in JSON format.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the session.

- **Usage Example**:
```bash
php MCPListGroupsClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken
```

### 4.1 MCPStoreGroupClient
- **Purpose**:
  - Creates or updates a group on the MCP server.

- **Main Features**:
  - Sends a `store_group` command with the group's name and description.
  - Allows creation of new groups or modification of existing ones.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the session.
  - `--group-name`: Name of the group to create or update.
  - `--description`: (Optional) Description of the group.

- **Usage Example**:
```bash
php MCPStoreGroupClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --group-name "Team DevOps" ^
    --description "Group for development and operations"
```

### 4.2 MCPDeleteGroupClient
- **Purpose**:
  - Deletes a specified group from the MCP server.

- **Main Features**:
  - Sends a `delete_group` command with the group name.
  - Ensures the group is removed from the server.

- **Key Arguments**:
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token for the session.
  - `--group-name`: Name of the group to delete.

- **Usage Example**:
```bash
php MCPDeleteGroupClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --group-name "Team DevOps"
```

---

### 5.0 MCPStoreUserClient
- **Purpose:** Creates or updates user details on the MCP server.

- **Main Features:**
  - Sends a `store_user` command with comprehensive user details.
  - Allows specification of default values for language and timezone if not provided.

- **Key Arguments:**
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token.
  - `--name`: Name of the user.
  - `--email`: Email address of the user.
  - `--password`: Password for the user account.
  - `--language` (Optional): User's preferred language (default: "en").
  - `--timezone` (Optional): User's timezone (default: "Europe/Berlin").
  - `--roles` (Optional): Roles assigned to the user.
  - `--groups` (Optional): Groups the user belongs to.
  - `--usePublic` (Optional): Flag to set the user as public.
  - `--activateFtp` (Optional): Flag to activate FTP access.
  - `--ftpPassword` (Optional): Password for FTP access.

**Usage Example:**
```bash
php MCPStoreUserClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --name John ^
    --email john@example.com ^
    --password secret ^
    --language en ^
    --roles admin manager ^
    --groups devops finance ^
    --usePublic ^
    --activateFtp ^
    --ftpPassword ftpPass123
```

### 5.1 MCPEditUserClient
- **Purpose:** Modifies the details of an existing user on the MCP server.

- **Main Features:**
  - Sends an `edit_user` command with the specified user details.
  - Supports conditional sending of fields to avoid unnecessary data transmission.

- **Key Arguments:**
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--token`: Authentication token.
  - `--user-id`: ID of the user to modify.
  - `--name` (Optional): New name of the user.
  - `--email` (Optional): New email for the user.
  - `--password` (Optional): New password for the user.
  - `--language` (Optional): New language for the user.
  - `--timezone` (Optional): New timezone for the user.
  - `--roles` (Optional): New roles for the user.
  - `--groups` (Optional): New groups for the user.
  - `--usePublic` (Optional): Flag to set the user as public.
  - `--activateFtp` (Optional): Flag to activate FTP for the user.
  - `--ftpPassword` (Optional): New password for FTP access.

- **Usage Example:**
```bash
php MCPEditUserClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --user-id 12345 ^
    --name Jane ^
    --roles manager devops ^
    --groups hr devops
```

### 5.2 MCPDeleteUserClient
- **Purpose:** Deletes a user from the MCP server.

- **Main Features:**
  - Sends a `delete_user` command using the user's email as an identifier.

- **Key Arguments:**
  - `--server-ip`: IP address of the MCP server.
  - `--server-port`: Port number of the MCP server.
  - `--email`: Email address of the user to delete.
  - `--token`: Authentication token.

- **Usage Example:**
```bash
php MCPDeleteUserClient.php ^
    --server-ip 127.0.0.1 ^
    --server-port 1234 ^
    --token MyToken ^
    --email jane.doe@example.com
```

---

## General Notes
**JSON Communication:**
- Each file constructs and sends JSON payloads specific to its functionality.
- Responses from the server are parsed and displayed in JSON format.

**Socket Communication:**
- The files use PHP's Socket class for establishing TCP connections with the MCP server.

**Error Handling:**
- The scripts handle missing or invalid arguments gracefully, printing clear usage instructions where necessary.

**Examples:**
- Replace placeholders (e.g., `<SERVER_IP>`, `<TOKEN>`) with actual values relevant to your environment.

## Prerequisites
Ensure you have PHP installed. The code is compatible with PHP 7.1 and above.

## Dependencies:
json which is meanwhile integrated in PHP directly

## Build and Run
Use the `php` command to run the PHP files with the appropriate parameters as described above:
```bash
php MCPLoginClient.php --<PARAMETER 1> --<PARAMETER 2> --<PARAMETER n> ...
```

## Error Handling
Both clients include error handling for:
- Missing or invalid parameters.
- Server connection issues.
- Unexpected server responses.

## Future Enhancements
- Add support for SSL/TLS encryption for secure communication.
- Implement a configuration file to simplify the command-line parameters.
- Enhance error reporting with detailed server-side error codes.

## License
This project is licensed under the MIT License - see the LICENSE file for details.
This repository and/or code is provided "as is" without warranty of any kind, and use is at your own risk.

