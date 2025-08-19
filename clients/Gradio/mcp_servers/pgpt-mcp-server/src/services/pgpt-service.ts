import axios, { AxiosInstance } from 'axios';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ChatArgs, SourceArgs, ListSourcesArgs, GetSourceArgs } from '../types/api.js';

export class PGPTService {
  private api: AxiosInstance;
  private token: string | null = null;
  private proxyAuth: string;

  constructor() {
    // Set up proxy authentication
    const proxyUser = 'staging@ai-testdrive.com';
    const proxyPassword = 'StagingGpt$24';
    this.proxyAuth = Buffer.from(`${proxyUser}:${proxyPassword}`).toString('base64');

    // Initialize axios instance with base configuration
    this.api = axios.create({
      baseURL: process.env.PRIVATE_GPT_API_URL || 'http://localhost:3000',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.proxyAuth}`,
      },
    });

    console.log('Getting auth token...');
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      const email = process.env.user;
      const password = process.env.password;

      if (!email || !password) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Missing authentication credentials'
        );
      }

      try {
        const response = await this.api.post('/login', {
          email,
          password,
        });
        this.token = response.data.data.token;
        
        // Combine proxy auth with bearer token
        const combinedAuth = `Basic ${this.proxyAuth}, Bearer ${this.token}`;
        this.api.defaults.headers.common['Authorization'] = combinedAuth;
        
        console.log(`Updated Authorization header: ${combinedAuth}`);
      } catch (error) {
        console.error('Authentication error:', error);
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Authentication failed: ${axios.isAxiosError(error) ? error.response?.data?.message || error.message : error}`
        );
      }
    }
  }

  async chat(args: ChatArgs) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.post('/chats', {
        language: args.language || 'en',
        question: args.question,
        usePublic: args.usePublic || false,
        groups: args.groups || [],
      });

      return {
        content: [
          {
            type: 'text',
            text: response.data.data.answer,
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Chat failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async createSource(args: SourceArgs) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.post('/sources', {
        name: args.name,
        content: args.content,
        groups: args.groups || [],
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data.data, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Source creation failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async listGroups() {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get('/groups');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data.data, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Group listing failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async listSources(args: ListSourcesArgs) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.post('/sources/groups', {
        groupName: args.groupName,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data.data, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Source listing failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }

  async getSource(args: GetSourceArgs) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.get(`/sources/${args.sourceId}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data.data, null, 2),
          },
        ],
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Source retrieval failed: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }
}