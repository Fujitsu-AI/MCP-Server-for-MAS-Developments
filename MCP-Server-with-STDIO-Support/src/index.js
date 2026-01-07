#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import figlet from 'figlet';
import { fileURLToPath } from 'url';

// Own modules
import { messages } from './pgpt-messages.js';

/* ################ 1. SETUP & PATH LOGIC ################ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function expandPath(filePath) {
    if (!filePath) return filePath;
    const cleanPath = String(filePath);
    if (cleanPath.startsWith('~')) {
        return path.join(os.homedir(), cleanPath.slice(1));
    }
    return path.isAbsolute(cleanPath) ? cleanPath : path.resolve(__dirname, '..', cleanPath);
}

dotenv.config({ path: './pgpt.env' });
const envFilePath = path.resolve(__dirname, '../pgpt.env.json');
let config = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));

const getCfg = (p, fallback = null) => p.split('.').reduce((acc, part) => acc && acc[part], config) ?? fallback;

/* ################ 2. CRYPTOGRAPHY ################ */

const privateKeyPath = expandPath(getCfg('Server_Config.PRIVATE_KEY'));
const isPwEncEnabled = String(getCfg('Server_Config.PW_ENCRYPTION')) === 'true';

let privateKey;
try { 
    privateKey = fs.readFileSync(privateKeyPath, 'utf8'); 
} catch (e) { 
    console.error(chalk.yellow("Warning: SSH Key not loaded.")); 
}

function decrypt(data) {
    if (!data || !privateKey) return data;
    try {
        return crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(data, 'base64')).toString('utf8');
    } catch (e) {
        try { 
            return crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(data, 'base64')).toString('utf8'); 
        } catch (e2) { 
            return data; 
        }
    }
}

/* ################ 3. THE MCP SERVER (API v1.5 FULL BUILD) ################ */

class FujitsuPGPTServer {
    constructor() {
        this.server = new Server({ name: 'fujitsu-pgpt-v1-5-full', version: '2.8.0' }, { capabilities: { tools: {} } });
        this.setupAxios();
        this.setupHandlers();
    }

    setupAxios() {
        const useProxy = String(getCfg('Proxy_Config.USE_PROXY')) === 'true';
        const rawHeader = getCfg('Proxy_Config.ACCESS_HEADER');
        const isSSLValidate = String(getCfg('Server_Config.SSL_VALIDATE')) === 'true';

        let customHeader = null;
        if (useProxy && rawHeader) customHeader = String(getCfg('Proxy_Config.HEADER_ENCRYPTED')) === 'true' ? decrypt(rawHeader) : rawHeader;

        this.axiosInstance = axios.create({
            baseURL: getCfg('PGPT_Url.API_URL'),
            timeout: 120000, // Timeout according to v1.5
            headers: { 
                'Accept': 'application/json', 
                'Content-Type': 'application/json', 
                ...(customHeader ? { 'X-Custom-Header': customHeader } : {}) 
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: isSSLValidate })
        });
    }

    isAllowed(name) { 
        return config.Functions && config.Functions[`ENABLE_${name.toUpperCase()}`] === true; 
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [];
            const addTool = (name, desc, schema) => { if (this.isAllowed(name)) tools.push({ name, description: desc, inputSchema: schema }); };

            // AUTH & SYSTEM
            addTool('login', 'User login', { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] });
            addTool('logout', 'Invalidate API token', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });

            // CHATS (v1.5)
            const chatSchema = { type: 'object', properties: { token: { type: 'string' }, question: { type: 'string' }, language: { type: 'string', default: 'en' }, usePublic: { type: 'boolean', default: false }, groups: { type: 'array', items: { type: 'string' } } }, required: ['token', 'question', 'language'] };
            addTool('chat', 'New Chat', chatSchema);
            addTool('continue_chat', 'Continue existing chat', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' }, question: { type: 'string' } }, required: ['token', 'chatId', 'question'] });
            addTool('get_chat_info', 'Get chat details (incl. isLocked)', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' } }, required: ['token', 'chatId'] });
            addTool('delete_chat', 'Delete specific chat', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' } }, required: ['token', 'chatId'] });
            addTool('delete_all_chats', 'Flush all chats', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });

            // SOURCES (v1.5: groups mandatory)
            addTool('create_source', 'Add Markdown source', { type: 'object', properties: { token: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, groups: { type: 'array', items: { type: 'string' }, description: 'Use [] for public' } }, required: ['token', 'name', 'content', 'groups'] });
            addTool('list_sources', 'List sources in group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string', description: 'Empty string for public' } }, required: ['token', 'groupName'] });
            addTool('get_source', 'Get source info', { type: 'object', properties: { token: { type: 'string' }, sourceId: { type: 'string' } }, required: ['token', 'sourceId'] });
            addTool('edit_source', 'Update source (groups only updated if provided)', { type: 'object', properties: { token: { type: 'string' }, sourceId: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, groups: { type: 'array', items: { type: 'string' } } }, required: ['token', 'sourceId'] });
            addTool('delete_source', 'Delete source', { type: 'object', properties: { token: { type: 'string' }, sourceId: { type: 'string' } }, required: ['token', 'sourceId'] });

            // GROUPS
            addTool('list_groups', 'List groups', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });
            addTool('store_group', 'Create group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string' } }, required: ['token', 'groupName'] });
            addTool('delete_group', 'Delete group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string' } }, required: ['token', 'groupName'] });

            // USERS (v1.5)
            addTool('store_user', 'Create user', { type: 'object', properties: { token: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, activateFtp: { type: 'boolean' }, ftpPassword: { type: 'string' } }, required: ['token', 'name', 'email', 'password'] });
            addTool('edit_user', 'Update user profile ', { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' }, activateFtp: { type: 'boolean' } }, required: ['token', 'email'] });
            addTool('delete_user', 'Delete user account', { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' } }, required: ['token', 'email'] });
            addTool('reactivate_user', 'Reactivate user', { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' } }, required: ['token', 'email'] });

            // SCENARIOS (v1.5 Full Build)
            const scenarioBase = {
                name: { type: 'string', minLength: 3, maxLength: 40 },
                description: { type: 'string', minLength: 3, maxLength: 128 },
                icon: { type: 'string' },
                active: { type: 'boolean' },
                creativity: { type: 'integer', minimum: 1, maximum: 4 },
                k: { type: 'integer', minimum: 1, maximum: 20 },
                similarity_threshold: { type: 'number', minimum: 0.0, maximum: 0.9999 },
                context_retriever_type: { type: 'string', enum: ['vector_store', 'document_store', 'none'] },
                system_pre_prompt: { type: 'string' },
                user_pre_prompt: { type: 'string' },
                user_post_prompt: { type: 'string' },
                use_sparse: { type: 'boolean' },
                use_dense: { type: 'boolean' },
                use_reranking: { type: 'boolean' },
                use_history: { type: 'boolean', description: 'Strict: true only with retriever "none"' }
            };
            addTool('list_scenarios', 'Get scenarios', { type: 'object', properties: { token: { type: 'string' }, page: { type: 'integer' } }, required: ['token'] });
            addTool('create_scenario', 'Create custom scenario', { type: 'object', properties: { token: { type: 'string' }, ...scenarioBase }, required: ['token', 'name', 'description'] });
            addTool('edit_scenario', 'Update scenario ', { type: 'object', properties: { token: { type: 'string' }, scenarioId: { type: 'string' }, ...scenarioBase }, required: ['token', 'scenarioId'] });
            addTool('delete_scenario', 'Delete custom scenario', { type: 'object', properties: { token: { type: 'string' }, scenarioId: { type: 'string' } }, required: ['token', 'scenarioId'] });

            return { tools };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const auth = args.token ? { Authorization: `Bearer ${args.token}` } : {};
            const payload = { ...args }; delete payload.token;

            try {
                switch (name) {
                    case 'chat':
                        const chatRes = await this.axiosInstance.post('/chats', { question: args.question, language: args.language, usePublic: args.usePublic ?? false, groups: args.groups || [] }, { headers: auth });
                        return { content: [{ type: 'text', text: JSON.stringify(chatRes.data.data, null, 2) }] };
                    
                    case 'create_source':
                        const srcRes = await this.axiosInstance.post('/sources', payload, { headers: auth });
                        return { content: [{ type: 'text', text: `DocID: ${srcRes.data.data.documentId}` }] };

                    case 'list_sources':
                        const lSrcRes = await this.axiosInstance.post('/sources/groups', { groupName: args.groupName }, { headers: auth });
                        return { content: [{ type: 'text', text: JSON.stringify(lSrcRes.data, null, 2) }] };

                    case 'edit_scenario':
                    case 'create_scenario':
                        // Strict Validation according to v1.5 manual
                        if (args.use_history === true && args.context_retriever_type && args.context_retriever_type !== 'none') {
                            throw new Error("STRICT VALIDATION: use_history: true is ONLY allowed when context_retriever_type is 'none'");
                        }
                        const sUrl = name === 'edit_scenario' ? `/scenarios/${args.scenarioId}` : '/scenarios';
                        const sMethod = name === 'edit_scenario' ? 'patch' : 'post';
                        if (payload.scenarioId) delete payload.scenarioId;
                        const sRes = await this.axiosInstance[sMethod](sUrl, payload, { headers: auth });
                        return { content: [{ type: 'text', text: JSON.stringify(sRes.data.data, null, 2) }] };

                    case 'login': {
                        const pwd = isPwEncEnabled ? decrypt(args.password) : args.password;
                        const loginRes = await this.axiosInstance.post('/login', { email: args.email, password: pwd });
                        return { content: [{ type: 'text', text: `Token: ${loginRes.data.data.token}` }] };
                    }

                    default:
                        const map = {
                            'logout': { m: 'delete', u: '/logout' },
                            'continue_chat': { m: 'patch', u: `/chats/${args.chatId}`, d: { question: args.question } },
                            'get_chat_info': { m: 'get', u: `/chats/${args.chatId}` },
                            'delete_chat': { m: 'delete', u: `/chats/${args.chatId}` },
                            'delete_all_chats': { m: 'delete', u: '/chats/flush' },
                            'get_source': { m: 'get', u: `/sources/${args.sourceId}` },
                            'edit_source': { m: 'patch', u: `/sources/${args.sourceId}`, d: { name: args.name, content: args.content, groups: args.groups } },
                            'delete_source': { m: 'delete', u: `/sources/${args.sourceId}` },
                            'list_groups': { m: 'get', u: '/groups' },
                            'store_group': { m: 'post', u: '/groups', d: { groupName: args.groupName } },
                            'delete_group': { m: 'delete', u: '/groups', d: { groupName: args.groupName } },
                            'store_user': { m: 'post', u: '/users', d: payload },
                            'edit_user': { m: 'patch', u: '/users', d: payload },
                            'delete_user': { m: 'delete', u: '/users', d: { email: args.email } },
                            'reactivate_user': { m: 'post', u: '/users/reactivate', d: { email: args.email } },
                            'list_scenarios': { m: 'get', u: '/scenarios', p: { page: args.page } },
                            'delete_scenario': { m: 'delete', u: `/scenarios/${args.scenarioId}` }
                        };
                        const c = map[name];
                        if (c) {
                            const res = await this.axiosInstance[c.m](c.u, c.m === 'get' || c.m === 'delete' ? { params: c.p, data: c.d, headers: auth } : c.d, { headers: auth });
                            return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] };
                        }
                        throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} unknown`);
                }
            } catch (error) {
                const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
                return { content: [{ type: 'text', text: `API Error: ${msg}` }], isError: true };
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error(chalk.green("Fujitsu PGPT v1.5 MCP Server FULLY active."));
    }
}

const server = new FujitsuPGPTServer();
server.run().catch(e => console.error(chalk.red("Crash:"), e));
figlet.text('PGPT API v1.5 Full', { font: 'Slant' }, (err, data) => { if (!err) console.error(chalk.blue(data)); });