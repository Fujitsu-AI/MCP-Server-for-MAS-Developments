import axios, { AxiosInstance } from 'axios';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { ChatArgs, SourceArgs, ListSourcesArgs, GetSourceArgs } from '../types/api.js';

export class PGPTService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    // Initialize axios instance with base configuration
    this.api = axios.create({
      baseURL: process.env.PGPT_API_URL || 'http://localhost:3000',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      const email = process.env.PGPT_EMAIL;
      const password = process.env.PGPT_PASSWORD;

      if (!email || !password) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Missing authentication credentials'
        );
      }

      try {
        const response = await this.api.post('/api/v1/login', {
          email,
          password,
        });
        this.token = response.data.data.token;
        this.api.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Authentication failed'
        );
      }
    }
  }

  async chat(args: ChatArgs) {
    await this.ensureAuthenticated();

    try {
      const response = await this.api.post('/api/v1/chats', {
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
      const response = await this.api.post('/api/v1/sources', {
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
      const response = await this.api.get('/api/v1/groups');

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
      const response = await this.api.post('/api/v1/sources/groups', {
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
      const response = await this.api.get(`/api/v1/sources/${args.sourceId}`);

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
