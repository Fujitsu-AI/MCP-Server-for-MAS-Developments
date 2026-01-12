#!/usr/bin/env node
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import crypto from "crypto";
import chalk from "chalk";
import axios from "axios";
import { fileURLToPath } from "url";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ----------------------------- ENV + CONFIG ----------------------------- */

// Try local then parent
const envJsonLocal = path.resolve(__dirname, "pgpt.env.json");
const envJsonParent = path.resolve(__dirname, "../pgpt.env.json");
const envFilePath = fs.existsSync(envJsonLocal) ? envJsonLocal : envJsonParent;

// Load dotenv sibling if present (pgpt.env)
try {
  dotenv.config({ path: envFilePath.replace(".json", "") });
} catch {}

// Load JSON config
let config = {};
try {
  if (fs.existsSync(envFilePath)) {
    config = JSON.parse(fs.readFileSync(envFilePath, "utf8"));
    console.log(chalk.cyan(`[CONFIG] Loaded from: ${envFilePath}`));
  } else {
    console.warn(chalk.yellow(`[CONFIG] Warning: Config not found at ${envFilePath}. Using defaults/env vars.`));
  }
} catch (e) {
  console.warn(chalk.yellow(`[CONFIG] Warning: Config invalid at ${envFilePath}. Using defaults/env vars. (${e?.message || e})`));
}

function expandPath(p) {
  if (!p) return null;
  const clean = String(p);
  if (clean.startsWith("~")) return path.join(os.homedir(), clean.slice(1));
  return path.isAbsolute(clean) ? clean : path.resolve(__dirname, "..", clean);
}

const getCfg = (p, fallback = null) => {
  try {
    return p.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), config) ?? fallback;
  } catch {
    return fallback;
  }
};

/* ----------------------------- CRYPTOGRAPHY ----------------------------- */

const privateKeyPath = expandPath(getCfg("Server_Config.PRIVATE_KEY"));
let privateKey;
try {
  if (privateKeyPath && fs.existsSync(privateKeyPath)) privateKey = fs.readFileSync(privateKeyPath, "utf8");
} catch {
  console.warn(chalk.yellow("Warning: SSH Key defined but not loaded."));
}

function decrypt(data) {
  if (!data || !privateKey) return data;
  try {
    return crypto
      .privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        Buffer.from(String(data), "base64"),
      )
      .toString("utf8");
  } catch {
    try {
      return crypto
        .privateDecrypt(
          { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(String(data), "base64"),
        )
        .toString("utf8");
    } catch {
      return data;
    }
  }
}

/* ------------------------------ MCP HELPERS ----------------------------- */

function getSessionId(req) {
  return (
    req.header("MCP-Session-Id") ||
    req.header("mcp-session-id") ||
    req.header("Mcp-Session-Id") ||
    req.header("X-Mcp-Session-Id") ||
    req.header("x-mcp-session-id") ||
    ""
  );
}

function protoMethods(obj) {
  try {
    return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter((n) => n !== "constructor");
  } catch {
    return [];
  }
}

async function dispatchTransport(transport, req, res) {
  if (typeof transport.handleRequest === "function") return transport.handleRequest(req, res);

  if (req.method === "GET") {
    if (typeof transport.handleGetRequest === "function") return transport.handleGetRequest(req, res);
    if (typeof transport.handleGetConnection === "function") return transport.handleGetConnection(req, res);
  }

  if (req.method === "POST") {
    if (typeof transport.handlePostMessage === "function") return transport.handlePostMessage(req, res);
    if (typeof transport.handlePost === "function") return transport.handlePost(req, res);
  }

  if (req.method === "DELETE") {
    if (typeof transport.close === "function") {
      await transport.close();
      return res.status(200).send("Closed");
    }
  }

  const methods = protoMethods(transport);
  console.error("[MCP] Transport API mismatch. Methods:", methods);
  return res.status(500).send(`Transport API mismatch. Methods: ${methods.join(", ")}`);
}

/* ------------------------------ SERVER CLASS ---------------------------- */

class FujitsuMcpServer {
  constructor() {
    this.server = new McpServer({ name: "pgpt-v15-final", version: "15.0.0" });
    this.app = express();

    this.streamableTransports = new Map(); // sessionId -> StreamableHTTPServerTransport
    this.legacySseTransports = new Map(); // sessionId -> SSEServerTransport
    this._loggedStreamableMethods = false;

    this.axiosInstance = this.setupAxios();

    this.setupMiddleware();
    this.setupToolsFromOldServer();
    this.setupRoutes();
  }

  /* ------------------------------ AXIOS SETUP ------------------------------ */

  setupAxios() {
    const useProxy = String(getCfg("Proxy_Config.USE_PROXY", "false")) === "true";
    const rawHeader = getCfg("Proxy_Config.ACCESS_HEADER");
    const headerEncrypted = String(getCfg("Proxy_Config.HEADER_ENCRYPTED", "false")) === "true";
    const isSSLValidate = String(getCfg("Server_Config.SSL_VALIDATE", "true")) === "true";

    let customHeader = null;
    if (useProxy && rawHeader) customHeader = headerEncrypted ? decrypt(rawHeader) : rawHeader;

    const apiUrl = getCfg("PGPT_Url.API_URL") || getCfg("PGPT_Url.PRIVATE_GPT_API_URL") || process.env.API_URL || "http://localhost:8001";

    const inst = axios.create({
      baseURL: apiUrl,
      timeout: 120000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(customHeader ? { "X-Custom-Header": customHeader } : {}),
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: isSSLValidate }),
    });

    console.log(chalk.blue(`[API] Connected to BaseURL: ${apiUrl}`));
    console.log(chalk.gray(`[API] Outbound TLS validation: ${isSSLValidate ? "ON" : "OFF"}`));
    return inst;
  }

  isAllowed(name) {
    const val = config.Functions && config.Functions[`ENABLE_${String(name).toUpperCase()}`];
    return val === undefined ? true : val === true;
  }

  /* ------------------------------ MIDDLEWARE ------------------------------ */

  setupMiddleware() {
    this.app.use(
      cors({
        origin: true,
        credentials: true,
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "MCP-Session-Id",
          "Mcp-Session-Id",
          "X-Mcp-Session-Id",
          "MCP-Protocol-Version",
          "Accept",
        ],
        exposedHeaders: ["MCP-Session-Id", "Mcp-Session-Id", "X-Mcp-Session-Id"],
      }),
    );

    // Basic hardening headers (no new deps)
    this.app.use((req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
      if (req.path === "/mcp" || req.path === "/sse") res.setHeader("Cache-Control", "no-store");
      next();
    });

    // Logging
    this.app.use((req, res, next) => {
      if (req.url !== "/health") console.log(chalk.yellow(`[NET] ${req.method} ${req.url}`));
      next();
    });

    // IMPORTANT: no JSON parser for /mcp or /messages (SDK transports need raw stream)
    const jsonParser = express.json({ limit: "10mb" });
    this.app.use((req, res, next) => {
      if (req.path === "/mcp" || req.path === "/messages") return next();
      return jsonParser(req, res, next);
    });
  }

  /* ------------------------------ BACKEND CALL ---------------------------- */

  async callBackend({ method, url, token, data, params }) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.axiosInstance.request({
      method,
      url,
      headers,
      data,
      params,
    });
  }

  toTextPayload(obj, limit = 20000) {
    if (obj === undefined || obj === null) return "";
    if (typeof obj === "string") return obj.slice(0, limit);
    try {
      return JSON.stringify(obj, null, 2).slice(0, limit);
    } catch {
      return String(obj).slice(0, limit);
    }
  }

  ok(text) {
    return { content: [{ type: "text", text: String(text) }] };
  }

  okJson(obj) {
    return { content: [{ type: "text", text: this.toTextPayload(obj) }] };
  }

  err(text) {
    return { content: [{ type: "text", text: String(text) }], isError: true };
  }

  /* ------------------------------ TOOLS (PORT) ---------------------------- */

  setupToolsFromOldServer() {
    // Shared schemas (ported from old list)
    const zToken = z.string();
    const zGroups = z.array(z.string()).default([]);
    const zLanguage = z.string().default("en");

    const scenarioBase = {
      name: z.string().min(3).max(40).optional(),
      description: z.string().min(3).max(128).optional(),
      icon: z.string().optional(),
      active: z.boolean().optional(),
      creativity: z.number().int().min(1).max(4).optional(),
      k: z.number().int().min(1).max(20).optional(),
      similarity_threshold: z.number().min(0.0).max(0.9999).optional(),
      context_retriever_type: z.enum(["vector_store", "document_store", "none"]).optional(),
      system_pre_prompt: z.string().optional(),
      user_pre_prompt: z.string().optional(),
      user_post_prompt: z.string().optional(),
      use_sparse: z.boolean().optional(),
      use_dense: z.boolean().optional(),
      use_reranking: z.boolean().optional(),
      use_history: z.boolean().optional(), // strict validation in handler
    };

    // Helper: register tool only if enabled
    const tool = (name, schema, handler) => {
      if (!this.isAllowed(name)) return;
      this.server.tool(name, schema, handler);
    };

    /* --- AUTH & SYSTEM --- */

    tool(
      "login",
      { email: z.string().email(), password: z.string() },
      async ({ email, password }) => {
        const isPwEncEnabled = String(getCfg("Server_Config.PW_ENCRYPTION", "false")) === "true";
        const pwd = isPwEncEnabled ? decrypt(password) : password;

        try {
          const r = await this.callBackend({ method: "post", url: "/login", token: null, data: { email, password: pwd } });
          // old server returned token string
          const token = r.data?.data?.token ?? r.data?.token ?? this.toTextPayload(r.data);
          return this.ok(String(token));
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "logout",
      { token: zToken },
      async ({ token }) => {
        try {
          const r = await this.callBackend({ method: "delete", url: "/logout", token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    /* --- CHATS (v1.5) --- */

    tool(
      "chat",
      {
        token: zToken,
        question: z.string(),
        language: zLanguage,
        usePublic: z.boolean().default(false),
        groups: zGroups,
      },
      async ({ token, question, language, usePublic, groups }) => {
        try {
          const r = await this.callBackend({
            method: "post",
            url: "/chats",
            token,
            data: { question, language, usePublic: usePublic ?? false, groups: groups || [] },
          });
          // old server: r.data.data
          return this.okJson(r.data?.data ?? r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "continue_chat",
      { token: zToken, chatId: z.string(), question: z.string() },
      async ({ token, chatId, question }) => {
        try {
          const r = await this.callBackend({ method: "patch", url: `/chats/${chatId}`, token, data: { question } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "get_chat_info",
      { token: zToken, chatId: z.string() },
      async ({ token, chatId }) => {
        try {
          const r = await this.callBackend({ method: "get", url: `/chats/${chatId}`, token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_chat",
      { token: zToken, chatId: z.string() },
      async ({ token, chatId }) => {
        try {
          const r = await this.callBackend({ method: "delete", url: `/chats/${chatId}`, token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_all_chats",
      { token: zToken },
      async ({ token }) => {
        try {
          const r = await this.callBackend({ method: "delete", url: "/chats/flush", token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    /* --- SOURCES (v1.5: groups mandatory) --- */

    tool(
      "create_source",
      {
        token: zToken,
        name: z.string(),
        content: z.string(),
        groups: z.array(z.string()), // required
      },
      async ({ token, name, content, groups }) => {
        try {
          const r = await this.callBackend({ method: "post", url: "/sources", token, data: { name, content, groups } });
          const docId = r.data?.data?.documentId || "OK";
          return this.ok(`Source Created. ID: ${docId}`);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "list_sources",
      { token: zToken, groupName: z.string() },
      async ({ token, groupName }) => {
        try {
          const r = await this.callBackend({ method: "post", url: "/sources/groups", token, data: { groupName } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "get_source",
      { token: zToken, sourceId: z.string() },
      async ({ token, sourceId }) => {
        try {
          const r = await this.callBackend({ method: "get", url: `/sources/${sourceId}`, token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "edit_source",
      {
        token: zToken,
        sourceId: z.string(),
        name: z.string().optional(),
        content: z.string().optional(),
        groups: z.array(z.string()).optional(),
      },
      async ({ token, sourceId, name, content, groups }) => {
        try {
          const r = await this.callBackend({
            method: "patch",
            url: `/sources/${sourceId}`,
            token,
            data: { name, content, groups },
          });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_source",
      { token: zToken, sourceId: z.string() },
      async ({ token, sourceId }) => {
        try {
          const r = await this.callBackend({ method: "delete", url: `/sources/${sourceId}`, token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    /* --- GROUPS --- */

    tool(
      "list_groups",
      { token: zToken },
      async ({ token }) => {
        try {
          const r = await this.callBackend({ method: "get", url: "/groups", token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "store_group",
      { token: zToken, groupName: z.string() },
      async ({ token, groupName }) => {
        try {
          const r = await this.callBackend({ method: "post", url: "/groups", token, data: { groupName } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_group",
      { token: zToken, groupName: z.string() },
      async ({ token, groupName }) => {
        try {
          // old server used DELETE /groups with body
          const r = await this.callBackend({ method: "delete", url: "/groups", token, data: { groupName } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    /* --- USERS (v1.5) --- */

    tool(
      "store_user",
      {
        token: zToken,
        name: z.string(),
        email: z.string().email(),
        password: z.string(),
        activateFtp: z.boolean().optional(),
        ftpPassword: z.string().optional(),
      },
      async ({ token, ...payload }) => {
        try {
          const r = await this.callBackend({ method: "post", url: "/users", token, data: payload });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "edit_user",
      {
        token: zToken,
        email: z.string().email(),
        name: z.string().optional(),
        password: z.string().optional(),
        activateFtp: z.boolean().optional(),
      },
      async ({ token, ...payload }) => {
        try {
          const r = await this.callBackend({ method: "patch", url: "/users", token, data: payload });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_user",
      { token: zToken, email: z.string().email() },
      async ({ token, email }) => {
        try {
          // old server used DELETE /users with body {email}
          const r = await this.callBackend({ method: "delete", url: "/users", token, data: { email } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "reactivate_user",
      { token: zToken, email: z.string().email() },
      async ({ token, email }) => {
        try {
          const r = await this.callBackend({ method: "post", url: "/users/reactivate", token, data: { email } });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    /* --- SCENARIOS (v1.5 full) --- */

    tool(
      "list_scenarios",
      { token: zToken, page: z.number().int().optional() },
      async ({ token, page }) => {
        try {
          const r = await this.callBackend({ method: "get", url: "/scenarios", token, params: page !== undefined ? { page } : undefined });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "create_scenario",
      {
        token: zToken,
        // required in old list: name, description
        name: z.string().min(3).max(40),
        description: z.string().min(3).max(128),
        icon: scenarioBase.icon,
        active: scenarioBase.active,
        creativity: scenarioBase.creativity,
        k: scenarioBase.k,
        similarity_threshold: scenarioBase.similarity_threshold,
        context_retriever_type: scenarioBase.context_retriever_type,
        system_pre_prompt: scenarioBase.system_pre_prompt,
        user_pre_prompt: scenarioBase.user_pre_prompt,
        user_post_prompt: scenarioBase.user_post_prompt,
        use_sparse: scenarioBase.use_sparse,
        use_dense: scenarioBase.use_dense,
        use_reranking: scenarioBase.use_reranking,
        use_history: scenarioBase.use_history,
      },
      async ({ token, ...payload }) => {
        try {
          if (payload.use_history === true && payload.context_retriever_type && payload.context_retriever_type !== "none") {
            return this.err("STRICT VALIDATION: use_history: true is ONLY allowed when context_retriever_type is 'none'");
          }
          const r = await this.callBackend({ method: "post", url: "/scenarios", token, data: payload });
          return this.okJson(r.data?.data ?? r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "edit_scenario",
      {
        token: zToken,
        scenarioId: z.string(),
        // optional fields for edit, same base
        ...scenarioBase,
      },
      async ({ token, scenarioId, ...payload }) => {
        try {
          if (payload.use_history === true && payload.context_retriever_type && payload.context_retriever_type !== "none") {
            return this.err("STRICT VALIDATION: use_history: true is ONLY allowed when context_retriever_type is 'none'");
          }
          const r = await this.callBackend({ method: "patch", url: `/scenarios/${scenarioId}`, token, data: payload });
          return this.okJson(r.data?.data ?? r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );

    tool(
      "delete_scenario",
      { token: zToken, scenarioId: z.string() },
      async ({ token, scenarioId }) => {
        try {
          const r = await this.callBackend({ method: "delete", url: `/scenarios/${scenarioId}`, token });
          return this.okJson(r.data);
        } catch (e) {
          const msg = e?.response?.data ? this.toTextPayload(e.response.data) : e?.message || e;
          return this.err(`API Error: ${msg}`);
        }
      },
    );
  }

  /* ------------------------------ ROUTES --------------------------------- */

  setupRoutes() {
    this.app.get("/health", (req, res) => res.status(200).send("OK"));
    this.app.options(["/mcp", "/sse", "/messages"], (req, res) => res.sendStatus(204));

    /* ----------------------- LEGACY SSE TRANSPORT ----------------------- */

    this.app.get("/sse", async (req, res) => {
      req.socket.setTimeout(0);
      res.setHeader("X-Accel-Buffering", "no");

      const transport = new SSEServerTransport("/messages", res);
      this.legacySseTransports.set(transport.sessionId, transport);

      res.on("close", () => {
        if (this.legacySseTransports.get(transport.sessionId) === transport) this.legacySseTransports.delete(transport.sessionId);
        console.log(chalk.gray(`[SSE] Legacy SSE closed: ${transport.sessionId}`));
      });

      console.log(chalk.blue(`[SSE] Legacy SSE connected: ${transport.sessionId}`));
      await this.server.connect(transport);
    });

    this.app.post("/messages", async (req, res) => {
      const sessionId = String(req.query.sessionId || "");
      const transport = this.legacySseTransports.get(sessionId);
      if (!transport) return res.status(404).send("Session not found");
      return dispatchTransport(transport, req, res);
    });

    /* --------------------- STREAMABLE HTTP TRANSPORT -------------------- */

    this.app.all("/mcp", async (req, res) => {
      const sid = getSessionId(req);

      // Graceful DELETE
      if (req.method === "DELETE") {
        const t = sid ? this.streamableTransports.get(sid) : null;

        res.status(200).send("Closed");

        if (t) {
          setImmediate(async () => {
            try {
              if (typeof t.close === "function") await t.close();
            } catch (e) {
              console.log(chalk.gray(`[MCP] Close ignored: ${e?.name || ""} ${e?.message || e}`));
            } finally {
              if (sid && this.streamableTransports.get(sid) === t) this.streamableTransports.delete(sid);
              console.log(chalk.red(`[MCP] Session closed: ${sid}`));
            }
          });
        }
        return;
      }

      // Existing session
      if (sid && this.streamableTransports.has(sid)) {
        return dispatchTransport(this.streamableTransports.get(sid), req, res);
      }

      // New session (POST initialize without session header is valid)
      const transport = new StreamableHTTPServerTransport(req, res);

      if (!this._loggedStreamableMethods) {
        this._loggedStreamableMethods = true;
        console.log(chalk.gray(`[MCP] Streamable transport methods: ${protoMethods(transport).join(", ")}`));
      }

      await this.server.connect(transport);
      await dispatchTransport(transport, req, res);

      if (transport.sessionId) {
        this.streamableTransports.set(transport.sessionId, transport);
        console.log(chalk.green(`[MCP] Session active: ${transport.sessionId}`));
      }

      res.on("close", () => {
        if (transport.sessionId && this.streamableTransports.get(transport.sessionId) === transport) {
          this.streamableTransports.delete(transport.sessionId);
          console.log(chalk.gray(`[MCP] Cleaned up on res.close: ${transport.sessionId}`));
        }
      });
    });
  }

  /* ------------------------------ TLS / LISTEN --------------------------- */

  run() {
    const PORT = Number(getCfg("Server_Config.PORT", process.env.PORT || 5000));
    const HOST = String(getCfg("Server_Config.HOST", process.env.HOST || "0.0.0.0"));
    const USE_TLS = String(getCfg("Server_Config.ENABLE_TLS", "false")) === "true";

    const startMsg = () => {
      console.log(chalk.bgGreen.black(` SERVER v15 FINAL STARTING `));
      console.log(chalk.white(`Mode: ${USE_TLS ? "HTTPS" : "HTTP"}`));
      console.log(chalk.white(`Bind: ${HOST}:${PORT}`));
      console.log(chalk.white(`PID:  ${process.pid}`));
    };

    if (USE_TLS) {
      try {
        const keyPath = expandPath(getCfg("Server_Config.SSL_KEY_PATH"));
        const certPath = expandPath(getCfg("Server_Config.SSL_CERT_PATH"));
        const caPath = expandPath(getCfg("Server_Config.SSL_CA_PATH"));
        const requireClientCert = String(getCfg("Server_Config.REQUIRE_CLIENT_CERT", "false")) === "true";

        if (!keyPath || !certPath) throw new Error("SSL_KEY_PATH and SSL_CERT_PATH must be configured for TLS.");
        if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) throw new Error(`Certificates not found: key=${keyPath} cert=${certPath}`);

        const options = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
          ...(caPath && fs.existsSync(caPath) ? { ca: fs.readFileSync(caPath) } : {}),
          requestCert: requireClientCert,
          rejectUnauthorized: requireClientCert,
        };

        https.createServer(options, this.app).listen(PORT, HOST, startMsg);
      } catch (e) {
        console.error(chalk.bgRed(` TLS ERROR: ${e?.message || e} `));
        console.log(chalk.yellow("Starting HTTP server instead..."));
        this.app.listen(PORT, HOST, startMsg);
      }
    } else {
      this.app.listen(PORT, HOST, startMsg);
    }
  }
}

new FujitsuMcpServer().run();
