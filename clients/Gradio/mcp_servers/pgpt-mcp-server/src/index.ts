#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  Request
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';
import https from 'https';

// Assert environment variables are defined
let API_URL = process.env.PRIVATE_GPT_API_URL as string;
const USER = process.env.user as string;
const PASSWORD = process.env.password as string;

// Use the provided configuration
const BASE_URL = 'https://prometheus.ai-testdrive.com/api/v1';
const PROXY_USER = 'staging@ai-testdrive.com';
const PROXY_PASSWORD = 'StagingGpt$24';

// Set API_URL to use the provided base URL
API_URL = BASE_URL;

// Add /api/v1 prefix if not present
if (!API_URL.endsWith('/api/v1')) {
  API_URL = API_URL.replace(/\/?$/, '/api/v1');
}

// Validate required environment variables
if (!API_URL) {
  throw new Error('PRIVATE_GPT_API_URL environment variable is required');
}

if (!USER || !PASSWORD) {
  throw new Error('user and password environment variables are required');
}

console.error('Starting server with config:', {
  API_URL,
  USER
});

class PrivateGPTServer {
  private server: Server;
  private axiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'pgpt-mcp-server',
        version: '0.2',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Create axios instance with SSL disabled for development and proxy auth
    const proxyAuth = Buffer.from(`${PROXY_USER}:${PROXY_PASSWORD}`).toString('base64');
    this.axiosInstance = axios.create({
      baseURL: API_URL,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${proxyAuth}`
      },
      httpsAgent: new https.Agent({  
        rejectUnauthorized: false
      })
    });

    this.setupResourceHandlers();
    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async ensureAuthenticated() {
    if (!this.authToken) {
      console.error('Getting auth token...');
      try {
        const loginResponse = await this.axiosInstance.post('/login', {
          email: USER,
          password: PASSWORD
        });
        console.error('Login response:', loginResponse.data);
        this.authToken = loginResponse.data.data.token;
        console.error('Got auth token');

        // Update both the default headers and the instance headers with combined auth
        const proxyAuth = Buffer.from(`${PROXY_USER}:${PROXY_PASSWORD}`).toString('base64');
        const combinedAuth = `Basic ${proxyAuth}, Bearer ${this.authToken}`;
        
        // Set on multiple places to ensure it's used
        this.axiosInstance.defaults.headers.common['Authorization'] = combinedAuth;
        this.axiosInstance.defaults.headers['Authorization'] = combinedAuth;
        
        console.error('Updated Authorization header:', combinedAuth);
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    }
  }

  private setupResourceHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: []
    }));

    // List resource templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: []
    }));

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: Request) => {
      if (!request.params?.uri) {
        throw new McpError(ErrorCode.InvalidRequest, 'Missing URI parameter');
      }
      throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${request.params.uri}`);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'chat',
          description: 'Start or continue a chat with PrivateGPT with optional RAG capabilities',
          inputSchema: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The question or prompt to send'
              },
              usePublic: {
                type: 'boolean',
                description: 'Whether to use public knowledge base',
                default: false
              },
              groups: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Group names to use for RAG (mutually exclusive with usePublic)'
              },
              language: {
                type: 'string',
                description: 'Language code (e.g., "en" for English)',
                default: 'en'
              }
            },
            required: ['question']
          }
        },
        {
          name: 'create_source',
          description: 'Create a new source with automatic markdown formatting',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the source'
              },
              content: {
                type: 'string',
                description: 'Content to be formatted as markdown'
              },
              groups: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Optional groups to assign the source to'
              }
            },
            required: ['name', 'content']
          }
        },
        {
          name: 'list_groups',
          description: 'Get available personal and assignable groups',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'list_sources',
          description: 'List all sources in a specific group',
          inputSchema: {
            type: 'object',
            properties: {
              groupName: {
                type: 'string',
                description: 'Name of the group to list sources from'
              }
            },
            required: ['groupName']
          }
        },
        {
          name: 'get_source',
          description: 'Get information about a specific source',
          inputSchema: {
            type: 'object',
            properties: {
              sourceId: {
                type: 'string',
                description: 'ID of the source to retrieve'
              }
            },
            required: ['sourceId']
          }
        },
        {
          name: 'continue_chat',
          description: 'Continue an existing chat conversation',
          inputSchema: {
            type: 'object',
            properties: {
              chatId: {
                type: 'string',
                description: 'ID of the chat to continue'
              },
              question: {
                type: 'string',
                description: 'The question or prompt to send'
              }
            },
            required: ['chatId', 'question']
          }
        },
        {
          name: 'get_chat',
          description: 'Get information about an existing chat',
          inputSchema: {
            type: 'object',
            properties: {
              chatId: {
                type: 'string',
                description: 'ID of the chat to retrieve'
              }
            },
            required: ['chatId']
          }
        },
        {
          name: 'edit_source',
          description: 'Edit an existing source',
          inputSchema: {
            type: 'object',
            properties: {
              sourceId: {
                type: 'string',
                description: 'ID of the source to edit'
              },
              name: {
                type: 'string',
                description: 'New name for the source (optional)'
              },
              content: {
                type: 'string',
                description: 'New content for the source (optional)'
              },
              groups: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'New groups for the source (optional)'
              }
            },
            required: ['sourceId']
          }
        },
        {
          name: 'delete_source',
          description: 'Delete an existing source',
          inputSchema: {
            type: 'object',
            properties: {
              sourceId: {
                type: 'string',
                description: 'ID of the source to delete'
              }
            },
            required: ['sourceId']
          }
        },
        {
          name: 'create_group',
          description: 'Create a new group',
          inputSchema: {
            type: 'object',
            properties: {
              groupName: {
                type: 'string',
                description: 'Name of the group to create'
              }
            },
            required: ['groupName']
          }
        },
        {
          name: 'delete_group',
          description: 'Delete an existing group',
          inputSchema: {
            type: 'object',
            properties: {
              groupName: {
                type: 'string',
                description: 'Name of the group to delete'
              }
            },
            required: ['groupName']
          }
        },
        {
          name: 'create_user',
          description: 'Create a new user',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Full name of the user'
              },
              email: {
                type: 'string',
                description: 'Email address of the user'
              },
              password: {
                type: 'string',
                description: 'Password for the user'
              },
              language: {
                type: 'string',
                description: 'Language preference (optional, defaults to "en")'
              },
              timezone: {
                type: 'string',
                description: 'Timezone preference (optional, defaults to "Europe/Berlin")'
              },
              usePublic: {
                type: 'boolean',
                description: 'Whether user can use public knowledge base'
              },
              groups: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Groups to assign to the user'
              },
              roles: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Roles to assign to the user'
              },
              activateFtp: {
                type: 'boolean',
                description: 'Whether to activate FTP access (optional)'
              },
              ftpPassword: {
                type: 'string',
                description: 'FTP password (optional, required if activateFtp is true)'
              }
            },
            required: ['name', 'email', 'password', 'usePublic', 'groups', 'roles']
          }
        },
        {
          name: 'edit_user',
          description: 'Edit an existing user',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Email address of the user to edit (required)'
              },
              name: {
                type: 'string',
                description: 'New full name (optional)'
              },
              password: {
                type: 'string',
                description: 'New password (optional)'
              },
              language: {
                type: 'string',
                description: 'New language preference (optional)'
              },
              timezone: {
                type: 'string',
                description: 'New timezone preference (optional)'
              },
              publicUpload: {
                type: 'boolean',
                description: 'Whether user can upload to public (optional)'
              },
              groups: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'New groups for the user (optional)'
              },
              roles: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'New roles for the user (optional)'
              },
              activateFtp: {
                type: 'boolean',
                description: 'Whether to activate FTP access (optional)'
              },
              ftpPassword: {
                type: 'string',
                description: 'New FTP password (optional)'
              }
            },
            required: ['email']
          }
        },
        {
          name: 'delete_user',
          description: 'Delete an existing user',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                description: 'Email address of the user to delete'
              }
            },
            required: ['email']
          }
        },
        {
          name: 'logout',
          description: 'Logout and invalidate the current API token',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: Request) => {
      if (!request.params?.name) {
        throw new McpError(ErrorCode.InvalidRequest, 'Missing tool name');
      }

      try {
        await this.ensureAuthenticated();
        console.error(`Handling tool request: ${request.params.name}`, request.params);
        
        switch (request.params.name) {
          case 'chat': {
            const args = request.params.arguments as { question: string; usePublic?: boolean; groups?: string[]; language?: string };
            console.error('Making chat request:', args);
            const chatResponse = await this.axiosInstance.post('/chats', args);
            console.error('Got chat response:', chatResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: chatResponse.data.data.answer
                }
              ]
            };
          }

          case 'create_source': {
            const args = request.params.arguments as { name: string; content: string; groups?: string[] };
            console.error('Making create_source request:', args);
            const createSourceResponse = await this.axiosInstance.post('/sources', args);
            console.error('Got create_source response:', createSourceResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(createSourceResponse.data, null, 2)
                }
              ]
            };
          }

          case 'list_groups': {
            console.error('Making list_groups request');
            const listGroupsResponse = await this.axiosInstance.get('/groups');
            console.error('Got list_groups response:', listGroupsResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(listGroupsResponse.data, null, 2)
                }
              ]
            };
          }

          case 'list_sources': {
            const args = request.params.arguments as { groupName: string };
            console.error('Making list_sources request:', args);
            const listSourcesResponse = await this.axiosInstance.post('/sources/groups', {
              groupName: args.groupName
            });
            console.error('Got list_sources response:', listSourcesResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(listSourcesResponse.data, null, 2)
                }
              ]
            };
          }

          case 'get_source': {
            const args = request.params.arguments as { sourceId: string };
            console.error('Making get_source request:', args);
            const getSourceResponse = await this.axiosInstance.get(`/sources/${args.sourceId}`);
            console.error('Got get_source response:', getSourceResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(getSourceResponse.data, null, 2)
                }
              ]
            };
          }

          case 'continue_chat': {
            const args = request.params.arguments as { chatId: string; question: string };
            console.error('Making continue_chat request:', args);
            const continueResponse = await this.axiosInstance.patch(`/chats/${args.chatId}`, {
              question: args.question
            });
            console.error('Got continue_chat response:', continueResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: continueResponse.data.data.answer
                }
              ]
            };
          }

          case 'get_chat': {
            const args = request.params.arguments as { chatId: string };
            console.error('Making get_chat request:', args);
            const getChatResponse = await this.axiosInstance.get(`/chats/${args.chatId}`);
            console.error('Got get_chat response:', getChatResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(getChatResponse.data, null, 2)
                }
              ]
            };
          }

          case 'edit_source': {
            const args = request.params.arguments as { sourceId: string; name?: string; content?: string; groups?: string[] };
            console.error('Making edit_source request:', args);
            const { sourceId, ...updateData } = args;
            const editResponse = await this.axiosInstance.patch(`/sources/${sourceId}`, updateData);
            console.error('Got edit_source response:', editResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(editResponse.data, null, 2)
                }
              ]
            };
          }

          case 'delete_source': {
            const args = request.params.arguments as { sourceId: string };
            console.error('Making delete_source request:', args);
            const deleteResponse = await this.axiosInstance.delete(`/sources/${args.sourceId}`);
            console.error('Got delete_source response:', deleteResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(deleteResponse.data, null, 2)
                }
              ]
            };
          }

          case 'create_group': {
            const args = request.params.arguments as { groupName: string };
            console.error('Making create_group request:', args);
            const createGroupResponse = await this.axiosInstance.post('/groups', {
              groupName: args.groupName
            });
            console.error('Got create_group response:', createGroupResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(createGroupResponse.data, null, 2)
                }
              ]
            };
          }

          case 'delete_group': {
            const args = request.params.arguments as { groupName: string };
            console.error('Making delete_group request:', args);
            const deleteGroupResponse = await this.axiosInstance.delete('/groups', {
              data: { groupName: args.groupName }
            });
            console.error('Got delete_group response:', deleteGroupResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(deleteGroupResponse.data, null, 2)
                }
              ]
            };
          }

          case 'create_user': {
            const args = request.params.arguments as {
              name: string;
              email: string;
              password: string;
              language?: string;
              timezone?: string;
              usePublic: boolean;
              groups: string[];
              roles: string[];
              activateFtp?: boolean;
              ftpPassword?: string;
            };
            console.error('Making create_user request:', args);
            const createUserResponse = await this.axiosInstance.post('/users', args);
            console.error('Got create_user response:', createUserResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(createUserResponse.data, null, 2)
                }
              ]
            };
          }

          case 'edit_user': {
            const args = request.params.arguments as {
              email: string;
              name?: string;
              password?: string;
              language?: string;
              timezone?: string;
              publicUpload?: boolean;
              groups?: string[];
              roles?: string[];
              activateFtp?: boolean;
              ftpPassword?: string;
            };
            console.error('Making edit_user request:', args);
            const editUserResponse = await this.axiosInstance.patch('/users', args);
            console.error('Got edit_user response:', editUserResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(editUserResponse.data, null, 2)
                }
              ]
            };
          }

          case 'delete_user': {
            const args = request.params.arguments as { email: string };
            console.error('Making delete_user request:', args);
            const deleteUserResponse = await this.axiosInstance.delete('/users', {
              data: { email: args.email }
            });
            console.error('Got delete_user response:', deleteUserResponse.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(deleteUserResponse.data, null, 2)
                }
              ]
            };
          }

          case 'logout': {
            console.error('Making logout request');
            const logoutResponse = await this.axiosInstance.delete('/logout');
            console.error('Got logout response:', logoutResponse.data);
            // Clear the auth token after successful logout
            this.authToken = null;
            // Reset authorization header to just proxy auth
            const proxyAuth = Buffer.from(`${PROXY_USER}:${PROXY_PASSWORD}`).toString('base64');
            this.axiosInstance.defaults.headers.common['Authorization'] = `Basic ${proxyAuth}`;
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(logoutResponse.data, null, 2)
                }
              ]
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error('Error handling request:', error);
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message ?? error.message;
          console.error('API error details:', {
            status: error.response?.status,
            data: error.response?.data
          });
          return {
            content: [
              {
                type: 'text',
                text: `API error: ${message}`
              }
            ],
            isError: true
          };
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('PrivateGPT MCP server running on stdio');
  }
}

const server = new PrivateGPTServer();
server.run().catch(console.error);