#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* --- 1. CONFIGURATION & CRYPTO --- */
dotenv.config({ path: './pgpt.env' });
const envFilePath = path.resolve(__dirname, '../pgpt.env.json');
let config = {};

// Load configuration
try {
    const rawConfig = fs.readFileSync(envFilePath, 'utf-8');
    config = JSON.parse(rawConfig);
    console.log(chalk.cyan(`[CONFIG] Loaded from: ${envFilePath}`));
} catch (e) {
    console.warn(chalk.yellow("[CONFIG] Warning: pgpt.env.json not found or invalid. Using defaults."));
}

// Helper function: Resolve paths (supports ~ for Home directory)
function expandPath(p) {
    if (!p) return null;
    if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
    return path.isAbsolute(p) ? p : path.resolve(__dirname, '..', p);
}

// Helper function: Read value from config
const getCfg = (p, fb) => p.split('.').reduce((a, k) => a && a[k], config) ?? fb;

// Load private key for decryption
const pkPath = getCfg('Server_Config.PRIVATE_KEY');
const fullPkPath = expandPath(pkPath);
let privateKey;
try { 
    if(fullPkPath) privateKey = fs.readFileSync(fullPkPath, 'utf8'); 
} catch(e) { 
    console.warn(chalk.red("[CRYPTO] Private Key could not be loaded.")); 
}

function decrypt(data) {
    if (!data || !privateKey) return data;
    try { 
        return crypto.privateDecrypt({ 
            key: privateKey, 
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING 
        }, Buffer.from(data, 'base64')).toString('utf8'); 
    } catch (e) { return data; }
}

/* --- 2. THE SERVER CLASS --- */
class FujitsuFinalServer {
    constructor() {
        this.server = new Server({ name: 'pgpt-v15-final', version: '15.0.0' }, { capabilities: { tools: {} } });
        this.app = express();
        
        // Stores the last SSE connection for Auto-Fix during tunnel disconnections
        this.latestTransport = null;

        // CORS & Logging
        this.app.use(cors({ origin: true, credentials: true }));
        this.app.use((req, res, next) => {
            if(req.url !== '/health') console.log(chalk.yellow(`[NET] ${req.method} ${req.url}`));
            next();
        });

        this.transports = new Map();
        this.setupAxios();
        this.setupHandlers();
        this.setupRoutes();
    }

    setupAxios() {
        const raw = getCfg('Proxy_Config.ACCESS_HEADER');
        const head = getCfg('Proxy_Config.USE_PROXY') === 'true' && raw ? (getCfg('Proxy_Config.HEADER_ENCRYPTED') === 'true' ? decrypt(raw) : raw) : null;
        
        // URL from config (Priority: API_URL > PRIVATE_GPT_API_URL)
        const apiUrl = getCfg('PGPT_Url.API_URL') || getCfg('PGPT_Url.PRIVATE_GPT_API_URL') || 'http://localhost:8001';
        
        this.api = axios.create({
            baseURL: apiUrl,
            timeout: 120000,
            headers: { 'Content-Type': 'application/json', ...(head ? { 'X-Custom-Header': head } : {}) },
            httpsAgent: new https.Agent({ rejectUnauthorized: getCfg('Server_Config.SSL_VALIDATE') === 'true' })
        });
        console.log(chalk.blue(`[API] Connected to BaseURL: ${apiUrl}`));
    }

    // Checks if tool is enabled in config. Fallback: True if entry is missing.
    isFn(n) {
        const key = `ENABLE_${n.toUpperCase()}`;
        const val = config.Functions?.[key];
        return val === undefined ? true : val === true;
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [];
            const add = (n, d, s) => { if (this.isFn(n)) tools.push({ name: n, description: d, inputSchema: s }); };

            // === TOOL DEFINITIONS ===

            // 1. Auth
            add('login', 'User Login via Email/Password', { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] });
            add('logout', 'Logout User', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });

            // 2. Chat
            const chatP = { token: { type: 'string' }, question: { type: 'string' }, language: { type: 'string', default: 'en' }, usePublic: { type: 'boolean' }, groups: { type: 'array', items: { type: 'string' } } };
            add('chat', 'Start a new Chat', { type: 'object', properties: chatP, required: ['token', 'question'] });
            add('continue_chat', 'Continue existing Chat', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' }, question: { type: 'string' } }, required: ['token', 'chatId', 'question'] });
            add('get_chat_info', 'Get Info about Chat', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' } }, required: ['token', 'chatId'] });
            add('delete_chat', 'Delete a Chat', { type: 'object', properties: { token: { type: 'string' }, chatId: { type: 'string' } }, required: ['token', 'chatId'] });
            add('delete_all_chats', 'Delete ALL Chats', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });

            // 3. Sources (RAG)
            const srcP = { token: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' }, groups: { type: 'array', items: { type: 'string' }, description: 'Required in v1.5. Use [] for public.' } };
            add('create_source', 'Upload/Create Source', { type: 'object', properties: srcP, required: ['token', 'name', 'content', 'groups'] });
            add('edit_source', 'Edit Source', { type: 'object', properties: { ...srcP, sourceId: { type: 'string' } }, required: ['token', 'sourceId'] });
            add('get_source', 'Get Source Details', { type: 'object', properties: { token: { type: 'string' }, sourceId: { type: 'string' } }, required: ['token', 'sourceId'] });
            add('list_sources', 'List Sources in Group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string' } }, required: ['token', 'groupName'] });
            add('delete_source', 'Delete Source', { type: 'object', properties: { token: { type: 'string' }, sourceId: { type: 'string' } }, required: ['token', 'sourceId'] });

            // 4. Groups
            add('list_groups', 'List all Groups', { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] });
            add('store_group', 'Create a new Group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string' } }, required: ['token', 'groupName'] });
            add('delete_group', 'Delete a Group', { type: 'object', properties: { token: { type: 'string' }, groupName: { type: 'string' } }, required: ['token', 'groupName'] });

            // 5. Users
            const usrP = { token: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' }, activateFtp: { type: 'boolean' }, ftpPassword: { type: 'string' } };
            add('store_user', 'Create User', { type: 'object', properties: usrP, required: ['token', 'email', 'name', 'password'] });
            add('edit_user', 'Edit User', { type: 'object', properties: { ...usrP, password: { type: 'string' } }, required: ['token', 'email'] });
            add('delete_user', 'Delete User', { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' } }, required: ['token', 'email'] });
            add('reactivate_user', 'Reactivate User', { type: 'object', properties: { token: { type: 'string' }, email: { type: 'string' } }, required: ['token', 'email'] });

            // 6. Scenarios (EXACT v1.5 API Definition) [cite: 552, 692, 694]
            const sceP = {
                token: { type: 'string' },
                // Strings
                name: { type: 'string', minLength: 3, maxLength: 40, description: "Unique name (3-40 chars)" },
                description: { type: 'string', minLength: 3, maxLength: 128, description: "Description (3-128 chars)" },
                icon: { type: 'string', description: "Icon identifier", default: "ph-shapes" },
                
                // Prompts (Explicitly added as per user request and PDF pg. 34)
                system_pre_prompt: { type: 'string', description: "System-level prompt prefix", default: "" },
                user_pre_prompt: { type: 'string', description: "User prompt prefix", default: "" },
                user_post_prompt: { type: 'string', description: "User prompt suffix", default: "" },

                // Settings
                active: { type: 'boolean', default: false },
                creativity: { type: 'integer', minimum: 1, maximum: 4, default: 1, description: "1=Concise, 4=Elaborate" },
                k: { type: 'integer', minimum: 1, maximum: 20, default: 5, description: "Document chunks to retrieve" },
                similarity_threshold: { type: 'number', minimum: 0.0, maximum: 0.9999, default: 0.0 },
                
                // Retrieval Strategy
                context_retriever_type: { 
                    type: 'string', 
                    enum: ['vector_store', 'document_store', 'none'], 
                    default: 'none',
                    description: "Type of context retrieval" 
                },
                
                // Booleans
                use_sparse: { type: 'boolean', default: true, description: "Keyword-based search" },
                use_dense: { type: 'boolean', default: true, description: "Semantic search" },
                use_reranking: { type: 'boolean', default: true, description: "Result reranking" },
                use_history: { 
                    type: 'boolean', 
                    default: false, 
                    description: "STRICT: Only allowed if context_retriever_type is 'none' " 
                }
            };

            add('list_scenarios', 'List Scenarios', { type: 'object', properties: { token: { type: 'string' }, page: { type: 'integer' } }, required: ['token'] });
            add('create_scenario', 'Create Scenario', { type: 'object', properties: sceP, required: ['token', 'name', 'description'] });
            
            // Edit Scenario needs scenarioId
            const editSceP = { ...sceP };
            editSceP.scenarioId = { type: 'string' };
            // Remove name/description from REQUIRED in edit mode, as they are optional patches
            add('edit_scenario', 'Edit Scenario', { type: 'object', properties: editSceP, required: ['token', 'scenarioId'] });
            
            add('delete_scenario', 'Delete Scenario', { type: 'object', properties: { token: { type: 'string' }, scenarioId: { type: 'string' } }, required: ['token', 'scenarioId'] });

            return { tools };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
            console.log(chalk.blue(`[TOOL] ${req.params.name}`));
            const { name, arguments: args } = req.params;
            const auth = args.token ? { Authorization: `Bearer ${args.token}` } : {};
            const pl = { ...args }; delete pl.token;

            try {
                let res;
                // --- SPECIAL CASES ---
                if (name === 'login') {
                    const pwd = getCfg('Server_Config.PW_ENCRYPTION') === 'true' ? decrypt(args.password) : args.password;
                    res = await this.api.post('/login', { email: args.email, password: pwd });
                }
                else if (name === 'create_scenario' || name === 'edit_scenario') {
                    // Scenario Validation [cite: 682, 683]
                    // use_history is ONLY allowed when context_retriever_type is 'none'
                    
                    // Note: If updating, we might need to know the existing state, but the API enforces this rule.
                    // We perform a client-side check if both parameters are present in the request.
                    if (args.use_history === true && args.context_retriever_type && args.context_retriever_type !== 'none') {
                        throw new Error("STRICT VALIDATION: 'use_history': true is ONLY allowed when 'context_retriever_type' is 'none'.");
                    }
                    
                    const method = name.startsWith('edit') ? 'patch' : 'post';
                    const url = name.startsWith('edit') ? `/scenarios/${args.scenarioId}` : '/scenarios';
                    if(pl.scenarioId) delete pl.scenarioId;
                    
                    res = await this.api[method](url, pl, { headers: auth });
                }
                // --- MAPPING LOGIC FOR ALL OTHER TOOLS ---
                else {
                    const map = {
                        // Auth
                        'logout': { m: 'delete', u: '/logout' },
                        // Chat
                        'chat': { m: 'post', u: '/chats' },
                        'continue_chat': { m: 'patch', u: `/chats/${args.chatId}`, d: { question: args.question } },
                        'get_chat_info': { m: 'get', u: `/chats/${args.chatId}` },
                        'delete_chat': { m: 'delete', u: `/chats/${args.chatId}` },
                        'delete_all_chats': { m: 'delete', u: '/chats/flush' },
                        // Sources
                        'create_source': { m: 'post', u: '/sources' },
                        'edit_source': { m: 'patch', u: `/sources/${args.sourceId}` },
                        'get_source': { m: 'get', u: `/sources/${args.sourceId}` },
                        'list_sources': { m: 'post', u: '/sources/groups', d: { groupName: args.groupName } },
                        'delete_source': { m: 'delete', u: `/sources/${args.sourceId}` },
                        // Groups
                        'list_groups': { m: 'get', u: '/groups' },
                        'store_group': { m: 'post', u: '/groups', d: { groupName: args.groupName } },
                        'delete_group': { m: 'delete', u: '/groups', d: { groupName: args.groupName } },
                        // Users
                        'store_user': { m: 'post', u: '/users' },
                        'edit_user': { m: 'patch', u: '/users' },
                        'delete_user': { m: 'delete', u: '/users', d: { email: args.email } },
                        'reactivate_user': { m: 'post', u: '/users/reactivate', d: { email: args.email } },
                        // Scenarios (List/Delete)
                        'list_scenarios': { m: 'get', u: '/scenarios', p: { page: args.page } },
                        'delete_scenario': { m: 'delete', u: `/scenarios/${args.scenarioId}` }
                    };

                    const c = map[name];
                    if (c) {
                        const payload = c.d || pl;
                        const config = { headers: auth, params: c.p };
                        // Axios DELETE special case: data must be in config
                        if (c.m === 'delete') config.data = payload;

                        if (c.m === 'get' || c.m === 'delete') {
                            res = await this.api[c.m](c.u, config);
                        } else {
                            res = await this.api[c.m](c.u, payload, { headers: auth });
                        }
                    } else {
                        throw new Error(`Tool implementation missing for: ${name}`);
                    }
                }
                
                return { content: [{ type: 'text', text: JSON.stringify(res.data.data || res.data, null, 2) }] };
            } catch (e) {
                const apiMsg = e.response?.data?.message || JSON.stringify(e.response?.data) || e.message;
                return { content: [{ type: 'text', text: `API Error: ${apiMsg}` }], isError: true };
            }
        });
    }

    setupRoutes() {
        this.app.get('/health', (req, res) => res.send("V14 ONLINE"));

        // 1. SSE HANDSHAKE (GET)
        const handleSSE = async (req, res) => {
            console.log(chalk.green(`[SSE] Handshake Client: ${req.ip}`));
            
            // IMPORTANT: Correct headers & no timeout for streaming
            req.socket.setTimeout(0);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Nginx Fix

            const transport = new SSEServerTransport('/messages', res);
            this.latestTransport = transport; // Save for Auto-Fix
            this.transports.set(res, transport);

            try {
                await this.server.connect(transport);
            } catch (e) { console.error("SSE Connection Error:", e); }

            req.on('close', () => {
                console.log(chalk.red(`[SSE] Connection closed`));
                this.transports.delete(res);
                // Only delete if it was the same transport instance
                if (this.latestTransport === transport) this.latestTransport = null;
            });
        };

        this.app.get('/sse', handleSSE);
        this.app.get('/', handleSSE);

        // 2. MESSAGES (POST)
        const handleMsg = async (req, res) => {
            let sId = req.query.sessionId;
            let t;

            // Session recovery strategy
            if (sId) {
                t = [...this.transports.values()].find(tr => tr.sessionId === sId);
            } else if (this.latestTransport) {
                t = this.latestTransport; // Fallback
            }

            if (t) {
                try {
                    // Pass the stream directly to the MCP SDK
                    await t.handlePostMessage(req, res);
                } catch (e) { 
                    console.error(chalk.red(`[MSG ERROR] ${e.message}`)); 
                    if(!res.headersSent) res.status(500).send(e.message);
                }
            } else {
                console.log(chalk.red("[MSG] Session not found"));
                res.status(404).send("Session not found");
            }
        };

        this.app.post('/messages', handleMsg);
        this.app.post('/sse', handleMsg);
        this.app.post('/', handleMsg);
    }

    run() {
        // Read port from config (Fallback 5000)
        const PORT = getCfg('Server_Config.PORT', 5000);
        const USE_TLS = getCfg('Server_Config.ENABLE_TLS') === 'true';

        const startMsg = () => {
            console.log(chalk.bgGreen.black(` SERVER v15.0 FULL STARTING `));
            console.log(chalk.white(`Mode: ${USE_TLS ? 'HTTPS' : 'HTTP'}`));
            console.log(chalk.white(`Port: ${PORT}`));
            console.log(chalk.white(`PID:  ${process.pid}`));
        };

        if (USE_TLS) {
            try {
                const kPath = expandPath(getCfg('Server_Config.SSL_KEY_PATH'));
                const cPath = expandPath(getCfg('Server_Config.SSL_CERT_PATH'));
                
                if (fs.existsSync(kPath) && fs.existsSync(cPath)) {
                    const options = { key: fs.readFileSync(kPath), cert: fs.readFileSync(cPath) };
                    https.createServer(options, this.app).listen(PORT, '0.0.0.0', startMsg);
                } else {
                    throw new Error(`Certificates not found: ${kPath}`);
                }
            } catch (e) {
                console.error(chalk.bgRed(` TLS ERROR: ${e.message} `));
                console.log(chalk.yellow("Starting HTTP server instead..."));
                this.app.listen(PORT, '0.0.0.0', startMsg);
            }
        } else {
            this.app.listen(PORT, '0.0.0.0', startMsg);
        }
    }
}

new FujitsuFinalServer().run();