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
    ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';    
import net from 'net';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import moment from 'moment'; // Optional: Entfernen, wenn nicht benötigt
import { prefixMessages, messages } from './pgpt-messages.js';
import { logEvent, setAllowWrittenLogfile, LOG_FILE_PATH } from './logger.js'; 
import figlet from 'figlet';
import chalk from 'chalk';
import { promisify } from 'util';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIoServer } from 'socket.io';
import chokidar from 'chokidar';
import stripAnsi from 'strip-ansi';
import tls from 'tls';


// Promisifizieren von figlet.text für die Verwendung mit async/await
const figletAsync = promisify(figlet.text);

dotenv.config({ path: './pgpt.env' }); // Geben Sie explizit den Pfad zur Datei an

// JSON-Datei laden
// `__dirname`-Ersatz für ES-Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON-Dateipfad relativ zum Skript
const envFilePath = path.resolve(__dirname, '../pgpt.env.json');
let envConfig;

try {
    envConfig = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
} catch (error) {
    logEvent('system', 'conf', 'Env Load Err', error.message, 'error');
    process.exit(1);
}

// Helper-Funktionen
function getEnvVar(key, nestedPath = null, fallback = null) {
    // Prüfen, ob ein verschachtelter Pfad angegeben ist
    if (nestedPath) {
        const value = nestedPath.reduce((acc, part) => acc && acc[part], envConfig);
        if (value === undefined || value === null) {
            if (fallback !== null) return fallback;
            logEvent(
                'system',
                'conf',
                'Missing Config',
                `Missing .json configuration variable: ${key}`,
                'error'
            );
            process.exit(1);
        }
        return value;
    }
    // Direkter Zugriff
    if (envConfig[key] === undefined || envConfig[key] === null) {
        if (fallback !== null) return fallback;
        logEvent(
            'system',
            'conf',
            'Missing Config',
            `Missing .json configuration variable: ${key}`,
            'error'
        );
        process.exit(1);
    }
    return envConfig[key];
}

// Nachrichten basierend auf Sprache
let lang = getEnvVar('LANGUAGE', ['Server_Config', 'LANGUAGE'], 'en').toLowerCase();
if (!(lang in messages)) {
    logEvent('system', 'conf', 'Lang Warning', `Language "${lang}" is not supported. Fallback in English.`, 'warn');
    lang = 'en';
}

const t = messages[lang];
const l = prefixMessages[lang];

/**
 * Funktion zum Anzeigen des Startheaders
 */
function displayStartHeader() {
    // Generiere ASCII-Art
    figlet.text('Fujitsu PGPT MCP-Server', {
        font: 'Slant', // Schriftart, kann angepasst werden
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
    }, function(err, data) {
        if (err) {
            logEvent('system', 'CLI', l.prefix_Env_Load_Err, t.errorCreatingAsciiArt, 'error');
            console.dir(err);
            return;
        }
        // Farbige Ausgabe mit Chalk
        console.log(
            chalk.green.bold(data) + '\n' +
            chalk.blue(`${t.mcpVersion} 2.1.0\n`) +
            chalk.yellow(`${t.mcpPort} ${Port}\n`) +
            chalk.cyan(`${t.mcpStartTime} ${new Date().toLocaleString()}\n`) +
            chalk.magenta(`${t.mcpLicense} MIT`)
        );
    });
}

const privateApiUrl         = getEnvVar('PRIVATE_GPT_API_URL', ['PGPT_Url', 'PRIVATE_GPT_API_URL']);
const requestedLang         = getEnvVar('LANGUAGE', ['Server_Config', 'LANGUAGE'], 'en').toLowerCase();
const apiUrl                = getEnvVar('API_URL', ['PGPT_Url', 'API_URL']);
const Port                  = getEnvVar('PORT', ['Server_Config', 'PORT'], '5000');
const restrictedGroups      = getEnvVar('RESTRICTED_GROUPS', ['Restrictions', 'RESTRICTED_GROUPS'], 'false').toString();
const OpenAICompAPI         = getEnvVar('ENABLE_OPEN_AI_COMP_API', ['Restrictions', 'ENABLE_OPEN_AI_COMP_API'], 'false').toString();
const sslValidate           = getEnvVar('SSL_VALIDATE', ['Server_Config', 'SSL_VALIDATE'], 'false').toString();
const enableTLS             = getEnvVar('ENABLE_TLS', ['Server_Config', 'ENABLE_TLS'], 'false').toLowerCase() === 'true';
const PwEncryption          = getEnvVar('PW_ENCRYPTION', ['Server_Config', 'PW_ENCRYPTION'], 'false') === 'true';
const AllowKeygen           = getEnvVar('ALLOW_KEYGEN', ['Server_Config', 'ALLOW_KEYGEN'], 'false') === 'true';
const allowWrittenLogfile   = getEnvVar('WRITTEN_LOGFILE', ['Logging', 'WRITTEN_LOGFILE'], 'false').toString();
const LogIps                = getEnvVar('LOG_IPs', ['Logging', 'LOG_IPs'], 'false').toString();
const anonymousMode         = getEnvVar('ANONYMOUS_MODE', ['Logging', 'ANONYMOUS_MODE'], 'false').toString();

// Funktion zur Pfad-Expansion
function expandPath(filePath) {
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

// Load the public key
const publicKeyPath     = expandPath(getEnvVar('PUBLIC_KEY',    ['Server_Config', 'PUBLIC_KEY']));
const privateKeyPath    = expandPath(getEnvVar('PRIVATE_KEY',   ['Server_Config', 'PRIVATE_KEY']));

const sslKeyPath        = expandPath(getEnvVar('SSL_KEY_PATH',  ['Server_Config', 'SSL_KEY_PATH'])); 
const sslCertPath       = expandPath(getEnvVar('SSL_CERT_PATH', ['Server_Config', 'SSL_CERT_PATH'])); 

let publicKey;
let privateKey;

try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    logEvent('system', 'conf', l.prefix_Public_API_URL, publicKey, 'info'); // Möglicherweise hier ein anderer Prefix benötigt
    logEvent('system', 'conf', l.prefix_Private_API_URL, privateKey, 'info'); // Möglicherweise hier ein anderer Prefix benötigt
} catch (error) {
    logEvent('system', 'conf', l.prefix_File_Path, error.path, 'error');
    logEvent('system', 'conf', l.prefix_Env_Load_Err, error.message, 'error');
    process.exit(1); // Abbrechen, falls Schlüssel nicht geladen werden können
}

if (PwEncryption) {
    logEvent('system', 'conf', l.prefix_PW_Encryption, t.passwordEncEnabled, 'info');
} else {
    logEvent('system', 'conf', l.prefix_PW_Encryption, t.passwordEncDisabled, 'info');
}

function validateUrl(url, t) {
    if (!url.startsWith('https://')) {
        logEvent('system', 'conf', l.prefix_URL_Warning, t.apiUrlWarning, 'warn');
        url = url.replace(/^http:\/\//, 'https://');
    }
    url = url.replace(/([^:]\/)\/+/g, '$1'); // Doppelte Schrägstriche nach "://" entfernen
    if (!url.endsWith('/api/v1')) {
        logEvent('system', 'conf', l.prefix_URL_Warning_V1, t.apiUrlWarningV1, 'warn');
        url = `${url.replace(/\/$/, '')}/api/v1`;
    }
    try {
        new URL(url);
    } catch {
        logEvent('system', 'conf', l.prefix_URL_Invalid, `${t.apiUrlInvalid} ${url}`, 'error');
        process.exit(1);
    }
    return url;
}

function validatePort(port, t) {
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
        logEvent('system', 'conf', l.prefix_Port_Invalid, t.portInvalid, 'error');
        process.exit(1);
    }
    return portNumber;
}

function validateBoolean(varName, value, t, useProxy = false) {
    if (useProxy && (varName === 'HEADER_ENCRYPTED')) {
        if (value !== 'true' && value !== 'false') {
            logEvent('system', 'conf', l.prefix_Validation_Err,
                t.validationError.replace('${var}', varName).replace('${value}', value), 'error');
            process.exit(1);
        }
        return value === 'true';
    }
    // Allgemeine Validierung
    if (value !== 'true' && value !== 'false') {
        logEvent('system', 'conf', l.prefix_Validation_Err,
            t.validationError.replace('${var}', varName).replace('${value}', value), 'error');
        process.exit(1);
    }
    return value === 'true';
}

/**
 * Decrypt a cryptographic string using the private key.
 * @param {string} encryptedData - The encrypted string in Base64 format.
 * @returns {string} - The decrypted password.
 */
function decryptPassword(encryptedData) {
    try {
        const decryptedPassword = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_PADDING, // Ensure consistent padding
            },
            Buffer.from(encryptedData, 'base64')
        ).toString('utf8');

        return decryptedPassword;
    } catch (error) {
        logEvent('system', 'conf', l.prefix_PW_Encryption, error.message, 'error'); // Möglicherweise hier ein anderer Prefix benötigt
        throw new Error(t.decryptPwdError);
    }
}

// Funktion für Verschlüsselung
function encryptWithPublicKey(data) {
    try {
        return crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_PADDING, // Explicitly set padding
            },
            Buffer.from(data)
        ).toString('base64');
    } catch (err) {
        logEvent('system', 'conf', l.prefix_PW_Encryption, err.message, 'error'); // Möglicherweise hier ein anderer Prefix benötigt
        throw new Error(t.encryptPwdError);
    }
}

/**
 * Encrypt a given password and return the encrypted key.
 * @param {string} password - The password to be encrypted.
 * @returns {string} - The encrypted password as a Base64 string.
 */
function getEncryptedKey(password) {
    try {
        return encryptWithPublicKey(password);
    } catch (err) {
        // Die Fehlerbehandlung wurde bereits in encryptWithPublicKey durchgeführt
        throw err;
    }
}

const enableLogin           = getEnvVar('ENABLE_LOGIN', ['Functions', 'ENABLE_LOGIN'], false);
const enableLogout          = getEnvVar('ENABLE_LOGOUT', ['Functions', 'ENABLE_LOGOUT'], false);
const enableChat            = getEnvVar('ENABLE_CHAT', ['Functions', 'ENABLE_CHAT'], false);
const enableContinueChat    = getEnvVar('ENABLE_CONTINUE_CHAT', ['Functions', 'ENABLE_CONTINUE_CHAT'], false);
const enableGetChatInfo     = getEnvVar('ENABLE_GET_CHAT_INFO', ['Functions', 'ENABLE_GET_CHAT_INFO'], false);
const enableDeleteAllChats  = getEnvVar('ENABLE_DELETE_ALL_CHATS', ['Functions', 'ENABLE_DELETE_ALL_CHATS'], false);
const enableDeleteChat      = getEnvVar('ENABLE_DELETE_CHAT', ['Functions', 'ENABLE_DELETE_CHAT'], false);
const enableListGroups      = getEnvVar('ENABLE_LIST_GROUPS', ['Functions', 'ENABLE_LIST_GROUPS'], false);
const enableStoreGroup      = getEnvVar('ENABLE_STORE_GROUP', ['Functions', 'ENABLE_STORE_GROUP'], false);
const enableDeleteGroup     = getEnvVar('ENABLE_DELETE_GROUP', ['Functions', 'ENABLE_DELETE_GROUP'], false);
const enableCreateSource    = getEnvVar('ENABLE_CREATE_SOURCE', ['Functions', 'ENABLE_CREATE_SOURCE'], false);
const enableEditSource      = getEnvVar('ENABLE_EDIT_SOURCE', ['Functions', 'ENABLE_EDIT_SOURCE'], false);
const enableDeleteSource    = getEnvVar('ENABLE_DELETE_SOURCE', ['Functions', 'ENABLE_DELETE_SOURCE'], false);
const enableGetSource       = getEnvVar('ENABLE_GET_SOURCE', ['Functions', 'ENABLE_GET_SOURCE'], false);
const enableListSources     = getEnvVar('ENABLE_LIST_SOURCES', ['Functions', 'ENABLE_LIST_SOURCES'], false);
const enableStoreUser       = getEnvVar('ENABLE_STORE_USER', ['Functions', 'ENABLE_STORE_USER'], false);
const enableEditUser        = getEnvVar('ENABLE_EDIT_USER', ['Functions', 'ENABLE_EDIT_USER'], false);
const enableDeleteUser      = getEnvVar('ENABLE_DELETE_USER', ['Functions', 'ENABLE_DELETE_USER'], false);
const enableReactivateUser  = getEnvVar('ENABLE_REACTIVATE_USER', ['Functions', 'ENABLE_REACTIVATE_USER'], false);



// Loggen der Server-Konfiguration
logEvent('system', 'conf', l.prefix_Server_Config, JSON.stringify(envConfig, null, 2), 'info');
logEvent('system', 'conf', l.prefix_Private_API_URL, privateApiUrl, 'info');
logEvent('system', 'conf', l.prefix_Public_API_URL, apiUrl, 'info');
logEvent('system', 'conf', l.prefix_Port, Port, 'info');
logEvent('system', 'conf', l.prefix_Language, requestedLang, 'info');
logEvent('system', 'conf', l.prefix_SSL_Validation, sslValidate, 'info');
logEvent('system', 'conf', l.prefix_EnableTLS, enableTLS, 'info');
logEvent('system', 'conf', l.prefix_sslKeyPath, sslKeyPath, 'info');
logEvent('system', 'conf', l.prefix_sslCertPath, sslCertPath, 'info');
logEvent('system', 'conf', l.prefix_PW_Encryption, PwEncryption ? t.encryptionEnabled : t.encryptionDisabled, 'info');
logEvent('system', 'conf', l.prefix_Allow_Keygen, AllowKeygen ? t.keygenEnabled : t.keygenDisabled, 'info');
logEvent('system', 'conf', l.prefix_Private_API_URL, privateKeyPath, 'info'); // Möglicherweise hier ein anderer Prefix benötigt
logEvent('system', 'conf', l.prefix_Public_API_URL, publicKeyPath, 'info'); // Möglicherweise hier ein anderer Prefix benötigt
logEvent('system', 'conf', l.prefix_Restricted_Groups, restrictedGroups, 'info');
logEvent('system', 'conf', l.prefix_openaicompAPI, OpenAICompAPI, 'info');
logEvent('system', 'conf', l.prefix_WRITTEN_LOGFILE, allowWrittenLogfile, 'info');
logEvent('system', 'conf', l.prefix_LOG_IPs, LogIps, 'info');
logEvent('system', 'conf', l.prefix_ANONYMOUS_MODE, anonymousMode, 'info');

// Loggen der deaktivierten Funktionen
const allFunctions = [
  { name: 'Login',              enabled: enableLogin },
  { name: 'Logout',             enabled: enableLogout },
  { name: 'Chat',               enabled: enableChat },
  { name: 'Continue Chat',      enabled: enableContinueChat },
  { name: 'Get Chat Info',      enabled: enableGetChatInfo },
  { name: 'Delete All Chats',   enabled: enableDeleteAllChats },
  { name: 'Delete Chat',        enabled: enableDeleteChat },
  { name: 'List Groups',        enabled: enableListGroups },
  { name: 'Store Group',        enabled: enableStoreGroup },
  { name: 'Delete Group',       enabled: enableDeleteGroup },
  { name: 'Create Source',      enabled: enableCreateSource },
  { name: 'Edit Source',        enabled: enableEditSource },
  { name: 'Delete Source',      enabled: enableDeleteSource },
  { name: 'Get Source',         enabled: enableGetSource },
  { name: 'List Sources',       enabled: enableListSources },
  { name: 'Store User',         enabled: enableStoreUser },
  { name: 'Edit User',          enabled: enableEditUser },
  { name: 'Delete User',        enabled: enableDeleteUser },
  { name: 'Reactivate User',    enabled: enableReactivateUser },
  // { name: 'Open AI compatible API Chat', enabled: enableChat },
  // { name: 'Continue Chat', enabled: enableContinueChat },
];

// Filtern, um nur deaktivierte (false) zu bekommen
const disabledFunctions = allFunctions.filter(f => !f.enabled);

// Loggen der deaktivierten Funktionen
if (disabledFunctions.length === 0) {
    logEvent(
      'system',
      'conf',
      l.prefix_All_Funcs,
      t.allFunctionsEnabled,
      'info'
    );
} else {
    logEvent('system', 'conf', l.prefix_Deact_Funcs, t.deactivatedFunctions, 'warn');
    disabledFunctions.forEach(func => {
        logEvent('system', 'conf', func.name, t.functionDisabled, 'warn');
    });
}

logEvent('system', 'conf', l.prefix_Validation_Err, t.apiUrlValidated.replace('${url}', apiUrl), 'info');

// Debugging für RESTRICTED_GROUPS
logEvent(
    'system',
    'conf',
    l.prefix_Restricted_Groups,
    t.accessRestrictedGroups.replace('${val}', envConfig.Restrictions?.RESTRICTED_GROUPS.toString()),
    'info'
);

// Zugriff und Validierung von RESTRICTED_GROUPS
const isRestrictedGroupsEnabled = validateBoolean(
    'RESTRICTED_GROUPS',
    restrictedGroups,
    t
);

logEvent('system', 'conf', l.prefix_Restricted_Groups, t.restrictedGroupsSuccess.replace('${status}', isRestrictedGroupsEnabled.toString()), 'info');

// Zugriff und Validierung von WRITTEN_LOGFILE
const isWrittenLogfileEnabled = validateBoolean(
    'WRITTEN_LOGFILE',
    allowWrittenLogfile,
    t
);
logEvent('system', 'conf', l.prefix_WRITTEN_LOGFILE, t.AllowLoggingSuccess.replace('${status}', isWrittenLogfileEnabled.toString()), 'info');
setAllowWrittenLogfile(isWrittenLogfileEnabled);

// Zugriff und Validierung von LOG_IPs
const isLogIpsEnabled = validateBoolean(
    'LOG_IPs',
    LogIps,
    t
);
logEvent('system', 'conf', l.prefix_LOG_IPs, t.LogIpsSuccess.replace('${status}', isLogIpsEnabled.toString()), 'info');

// Zugriff und Validierung von ANONYMOUS_MODE
const isanonymousModeEnabled = validateBoolean(
    'ANONYMOUS_MODE',
    anonymousMode,
    t
);
logEvent('system', 'conf', l.prefix_ANONYMOUS_MODE, t.anonymousModeSuccess.replace('${status}', isanonymousModeEnabled.toString()), 'info');

function baseLogOptions() {
    return {
        AllowLoggingEnabled: isWrittenLogfileEnabled,
        LogIps: isLogIpsEnabled,
        anonymousMode: isanonymousModeEnabled,
    };
}

// SSL-Validierung
const isSSLValidationEnabled = validateBoolean(
    'SSL_VALIDATE',
    getEnvVar('SSL_VALIDATE', ['Server_Config', 'SSL_VALIDATE'], 'false').toString(),
    t
);

const sslSymbol = isSSLValidationEnabled ? '✔️' : '⚠️';
logEvent('system', 'conf', l.prefix_SSL_Validation,
    t.sslValidationSet
        .replace('${symbol}', sslSymbol)
        .replace('${value}', String(isSSLValidationEnabled)),
    'info'
);

// Port validieren
const validatedPort = validatePort(Port, t);
logEvent('system', 'conf', l.prefix_Port_Validated, t.portValidated.replace('${port}', validatedPort), 'info');

// Einlesen der Proxy_Config-Parameter
const useProxy = validateBoolean(
    'USE_PROXY',
    getEnvVar('USE_PROXY', ['Proxy_Config', 'USE_PROXY'], 'false').toString(),
    t
);

const authHeaderEncrypted = useProxy ? validateBoolean(
    'HEADER_ENCRYPTED',
    getEnvVar('HEADER_ENCRYPTED', ['Proxy_Config', 'HEADER_ENCRYPTED'], 'false').toString(),
    t,
    useProxy
) : false;

const AccessHeader = useProxy ? getEnvVar('ACCESS_HEADER', ['Proxy_Config', 'ACCESS_HEADER'], null) : null;

// Verarbeiten des Proxy-Passworts
let ProxyAccessHeader;
if (authHeaderEncrypted) {
    try {
        ProxyAccessHeader = decryptPassword(AccessHeader);
    } catch (error) {
        logEvent('system', 'conf', l.prefix_API_Request_Error, error.message, 'error'); // Möglicherweise hier ein anderer Prefix benötigt
        process.exit(1);
    }
} else {
    ProxyAccessHeader = AccessHeader;
}

// Falls in der HAProxy-Konfiguration ein X-Custom-Header verlangt wird:
const customHeaderValue = ProxyAccessHeader;

// Optional: Überprüfen, ob alle erforderlichen Proxy-Daten vorhanden sind
if (useProxy && authHeaderEncrypted) {
    if (!ProxyAccessHeader) {
        logEvent('system', 'conf', l.prefix_API_Request_Error, t.proxyAuthMissing, 'error'); // Möglicherweise hier ein anderer Prefix benötigt
        process.exit(1);
    }
}

// Ausgabe der Proxy-Konfiguration (mit maskiertem Passwort)
logEvent('system', 'conf', l.prefix_Proxy_Config, t.proxyUseProxy.replace('${val}', useProxy), 'info');

// Beispiel: Tool-Überprüfung
function isToolEnabled(toolName) {
    const envKey = `ENABLE_${toolName.toUpperCase()}`;
    if (!(envKey in envConfig.Functions)) {
        logEvent(
            'system', 'N/A', l.prefix_Tool_Warn, t.toolNotDefinedInConfig.replace('${toolName}', toolName), 'warn'
        );
        return false;
    }
    return envConfig.Functions[envKey] === true;
}

/* ################ Helper Functions ############################*/
// Helper-Funktion, um zu prüfen, ob ein Tool aktiviert ist, und eine Fehlermeldung zu generieren
function checkToolEnabled(toolName) {
    if (toolName === "keygen" && AllowKeygen) {
        return null;
    }

    if (toolName === "oai_comp_api") {
        if (OpenAICompAPI) {
            return null;
        } else {
            logEvent('system', 'N/A', l.prefix_Tool_Disabled, t.toolDisabledLog.replace('${toolName}', toolName), 'error');
        }
    }

    if (!OpenAICompAPI || !isToolEnabled(toolName)) {
        logEvent(
            'system', 
            'N/A', 
            l.prefix_Tool_Disabled, 
            t.toolDisabledLog.replace('${toolName}', toolName), 
            'error'
        );
        return {
            status: 'error',
            message: messages[lang].toolDisabledError.replace('${toolName}', toolName),
        };
    }

    return null; // Tool ist aktiviert
}

function validateToken(token) {
    if (!token) {
        if (!isanonymousModeEnabled) logEvent('system', 'N/A', l.prefix_API_Request_Error, t.missingTokenError, 'error'); // Möglicherweise hier ein anderer Prefix benötigt
        return {
            status: 'error',
            message: t.missingTokenError,
            statusCode: 401 // Optional für konsistenten HTTP-Status
        };
    }
    return null;
}

function getArguments(input) {
    if (input.arguments) {
        return input.arguments;
    } else if (input.params?.arguments) {
        return input.params.arguments;
    } else {
        if (!isanonymousModeEnabled) logEvent(
            'system', 'N/A', l.prefix_API_Request_Error, t.invalidArgumentsError.replace('${args}', JSON.stringify(input)), 'error' // Möglicherweise hier ein anderer Prefix benötigt
        );
        return {}; // Leeres Objekt als Fallback
    }
}

// Parameter zuordnen
const API_URL = apiUrl;
const PORT = Port;

// Server-Startkonfiguration ausgeben
const serverConfig = JSON.stringify({ API_URL, PORT }, null, 2); 
logEvent('system', 'N/A', l.prefix_Server_Config, t.serverStartedLog, 'info');
// mit Konfiguration: ${serverConfig}

// Funktion zum Erstellen der Authorization-Header für Basic Auth
function createBasicAuthHeader(username, password) {
    const authString = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${authString}`;
}


/* const t = {                             // Beispielhafte Sprachvariablen
  ConnectionEstablished: 'Verbindung hergestellt',
  dataReceivedMsg: 'Daten empfangen: ${data}',
  ResponseSuccessfullySent: 'Antwort erfolgreich gesendet',
  ConnectionClosed: 'Verbindung geschlossen',
  ServerStopped: 'Server gestoppt'
};
const l = {                             // Beispielhafte Log-Prefixes
  prefix_tcpServerError: 'TCP-Server Fehler',
  prefix_Shutdown: 'Herunterfahren'
};*/

export class TcpServerTransport {
    /**
     * Konstruktor
     * @param {number} port - Port, auf dem der Server lauschen soll.
     * @param {boolean} enableTLS - true, wenn SSL/TLS verwendet werden soll, ansonsten false.
     * @param {string} sslKeyPath - Pfad zur SSL-Schlüsseldatei (nur benötigt, wenn enableTLS true ist).
     * @param {string} sslCertPath - Pfad zur SSL-Zertifikatsdatei (nur benötigt, wenn enableTLS true ist).
    */
    constructor(port, enableTLS, sslKeyPath, sslCertPath) {
        this.port = port;
        this.server = null;
        this.clients = new Map(); // Map zur Speicherung der Clients
        this.enableTLS = enableTLS; // Flag, ob SSL/TLS verwendet werden soll
  
    
        if (this.enableTLS && (!fs.existsSync(sslKeyPath) || !fs.existsSync(sslCertPath))) {
            logEvent('system', 'TLS', l.prefix_sslError, t.NoTLSCertFound, 'error');
            process.exit(1);
        }
      // 
        // Falls SSL aktiviert ist, laden wir die TLS-Optionen (Schlüssel und Zertifikat)
        if (this.enableTLS) {
            this.tlsOptions = {
                key: fs.readFileSync(sslKeyPath),
                cert: fs.readFileSync(sslCertPath)
                // Falls CA benötigt wird, z. B.:
                // ca: fs.readFileSync(caPath),
                // requestCert: false, // oder true, wenn Clients sich per Zertifikat ausweisen sollen
            };
        }
    }
  
    /**
     * Startet den Server.
     * @param {Function} onMessage - Callback-Funktion, die auf eingehende Nachrichten reagiert.
     * @returns {Promise} - Wird erfüllt, wenn der Server erfolgreich gestartet wurde.
     */
    async start(onMessage) {
        return new Promise((resolve, reject) => {
            // Entscheide anhand des enableTLS-Flags, ob ein TLS/SSL-Server oder ein normaler TCP-Server gestartet wird.
            if (this.enableTLS) {
                this.server = tls.createServer(this.tlsOptions, (socket) => {
                    this.handleConnection(socket, onMessage);
                });
            } else {
                this.server = net.createServer((socket) => {
                    this.handleConnection(socket, onMessage);
                });
            }
  
            // Hinzufügen des 'connection'-Listeners (einmalig außerhalb des createServer-Callbacks)
            this.server.on('connection', (socket) => {
                if (!isanonymousModeEnabled) {
                    logEvent('server', socket.remotePort || 'unknown', 'Connection Established', t.ConnectionEstablished, 'info');
                }
                socket.setKeepAlive(true, 30000); // Keep-Alive für jede Verbindung
            });
      
            // Server starten
            this.server.listen(this.port, () => {
                const modus = this.enableTLS ? 'TLS/SSL' : 'Plain TCP';
                if (!isanonymousModeEnabled) {
                    logEvent('server', this.port, 'Server Start', `Server lauscht auf Port ${this.port} [${modus}]`, 'info');
                }
                resolve();
            });
      
            // Fehlerbehandlung auf Server-Ebene
            this.server.on('error', (err) => {
                if (!isanonymousModeEnabled) {
                    logEvent('server', this.port, l.prefix_tcpServerError, `Serverfehler: ${err.message || err}`, 'error');
                }
                reject(err);
            });
        });
    }
  
    /**
     * Behandelt eingehende Verbindungen.
     * @param {object} socket - Das Socket-Objekt der Verbindung.
     * @param {Function} onMessage - Callback, das auf empfangene Nachrichten reagiert.
     */
    handleConnection(socket, onMessage) {
        const clientIP = socket.remoteAddress || 'unknown';
        const clientPort = socket.remotePort || 'unknown';
        this.clients.set(socket, { ip: clientIP, port: clientPort });
  
        // Logging: Neue Verbindung
        if (isLogIpsEnabled) {
            if (!isanonymousModeEnabled) {
            logEvent(clientIP, clientPort, 'Connection New', t.ConnectionEstablished, 'info');
            }
        } else {
            if (!isanonymousModeEnabled) {
                logEvent('*****', '****', 'Connection New', t.ConnectionEstablished, 'info');
            }
        }
  
        socket.on('error', (err) => {
            const client = this.clients.get(socket);
            // ECONNRESET speziell behandeln
            if (err.code === 'ECONNRESET') {
                // Wenn gewünscht, nur auf „info“-Level loggen oder gar nicht
                if (!isanonymousModeEnabled) {
                    if (isLogIpsEnabled) {
                        logEvent(
                        client?.ip || 'unknown',
                        client?.port || 'unknown',
                        'Socket Warn',
                        t.ErrorConnReset,
                        'info' );
                    } else {
                        logEvent(
                        '*****',
                        '*****',
                        'Socket Warn',
                        t.ErrorConnReset,
                        'info' );
                    }
                }
                return;
            }
          
            // Andere Fehler normal als 'error' loggen
            if (!isanonymousModeEnabled) {
                if (isLogIpsEnabled) {
                    logEvent(
                    client?.ip || 'unknown',
                    client?.port || 'unknown',
                    'Socket Error',
                    `Socket-Error: ${err.message || err}`,
                    'error' );
                } else {
                    logEvent(
                    '*****',
                    '*****',
                    'Socket Error',
                    `Socket-Error: ${err.message || err}`,
                    'error' );
                };
            }
        });
        // Ereignis: Daten empfangen
        socket.on('data', async (data) => {
            const client = this.clients.get(socket);
            if (isLogIpsEnabled) {
                if (!isanonymousModeEnabled) {
                    logEvent(client.ip, client.port, 'Data Received', t.dataReceivedMsg.replace('${data}', data.toString()), 'info');
                }
            } else {
                if (!isanonymousModeEnabled) {
                    logEvent('*****', '****', 'Data Received', t.dataReceivedMsg.replace('${data}', data.toString()), 'info');
                    }   
                }
  
            try {
                const message = JSON.parse(data.toString());
                const response = await onMessage(message);
                const responseString = JSON.stringify(response) + '\n'; // Delimiter hinzufügen
                socket.write(responseString, () => {
                    socket.end(); // Verbindung schließen, wenn das Schreiben fertig ist
                });
      
                // Logging: Erfolgreiche Antwort
                if (isLogIpsEnabled) {
                    if (!isanonymousModeEnabled) {
                        logEvent(client.ip, client.port, 'Response Sent', t.ResponseSuccessfullySent, 'info');
                    }
                } else {
                    if (!isanonymousModeEnabled) {
                        logEvent('*****', '****', 'Response Sent', t.ResponseSuccessfullySent, 'info');
                    }
                }
            } catch (err) {
                if (isLogIpsEnabled) {
                    if (!isanonymousModeEnabled) {
                        logEvent(client.ip, client.port, 'Error Processing Message', `Fehler: ${err.message || err}`, 'error');
                    }
                } else {
                    if (!isanonymousModeEnabled) {
                        logEvent('*****', '****', 'Error Processing Message', `Fehler: ${err.message || err}`, 'error');
                    }
                }
                // Sende eine Fehlerantwort mit Delimiter
                const errorResponse = JSON.stringify({ error: 'Ungültiges Nachrichtenformat' }) + '\n';
                socket.write(errorResponse, () => {
                    socket.end(); // Verbindung schließen
                });
            }
        });
  
        // Ereignis: Verbindung geschlossen
        socket.on('close', () => {
            const client = this.clients.get(socket);
            if (isLogIpsEnabled) {
                if (!isanonymousModeEnabled) {
                    logEvent(client.ip, client.port, 'Connection Closed', t.ConnectionClosed, 'info');
                }
            } else {
                if (!isanonymousModeEnabled) {
                logEvent('*****', '****', 'Connection Closed', t.ConnectionClosed, 'info');
                }
            }
            this.clients.delete(socket); // Entferne den Client aus der Map
        });
  
        // Fehlerbehandlung für einzelne Sockets
        socket.on('error', (err) => {
            const client = this.clients.get(socket);
            if (!isanonymousModeEnabled) {
                logEvent(
                    client?.ip || 'unknown',
                    client?.port || 'unknown',
                    'Socket Error',
                    `Socket-Fehler: ${err.message || err}`,
                    'error'
                );
            }
        });
    }
  
    /**
     * Stoppt den Server und leert die Clientliste.
     */
    async stop() {
        if (this.server) {
            this.server.close(() => {
                if (!isanonymousModeEnabled) {
                    logEvent('server', this.port, l.prefix_Shutdown, t.ServerStopped, 'info');
                }
            this.clients.clear(); // Alle Clients entfernen
            });
        }
    }
}


class PrivateGPTServer {
    constructor() {
        this.server = new Server({
            name: 'pgpt-mcp-server',
            version: '2.8.0',
        }, {
            capabilities: {
                resources: {},
                tools: {},
            },
        });

        const axiosConfig = {
          baseURL: apiUrl,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: isSSLValidationEnabled
          })
        };

        // Conditionally Header setzen, wenn USE_PROXY = true
        if (useProxy) {
            // Nur wenn der Proxy in der envConfig aktiviert ist,
            // wird der spezielle Header gesetzt
            axiosConfig.headers['X-Custom-Header'] = customHeaderValue;
        } else {
            // Falls du sicherstellen willst, dass der Header *nicht* gesetzt wird:
            delete axiosConfig.headers['X-Custom-Header'];
        }

        // Axios-Instanz anlegen
        this.axiosInstance = axios.create(axiosConfig);
       
        // Interceptors für Logging von Requests und Responses
        this.axiosInstance.interceptors.request.use((config) => {
            const headers = { ...config.headers };
            if (headers.Authorization) {
                // Prüfen, ob es sich um Bearer oder Basic handelt
                if (headers.Authorization.startsWith('Bearer ')) {
                    // Bearer maskieren
                    headers.Authorization = 'Bearer ********';
                } else if (headers.Authorization.startsWith('Basic ')) {
                    // Basic maskieren
                    headers.Authorization = 'Basic ********';
                } 
            }
            if (!isanonymousModeEnabled) logEvent('axios', 'ReqHd', l.prefix_requestHeaders, `Headers: ${JSON.stringify(headers)}`, 'info');

            return config;
        }, (error) => {
            if (!isanonymousModeEnabled) logEvent('axios', 'ReqEr', l.prefix_apiRequestError, t.requestError.replace('${error}', error.message || error), 'error');
            return Promise.reject(error);
        });
        
        this.axiosInstance.interceptors.response.use((response) => {
            if (!isanonymousModeEnabled) {
                logEvent(
                    'axios',
                    'ResOK',
                    l.prefix_responseReceived,
                    t.responseReceived.replace('${status}', response?.status?.toString() || 'No Status'),
                    'info'
                );
            }
            return response;
        }, (error) => {
            const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            if (!isanonymousModeEnabled) logEvent('axios', 'ResEr', l.prefix_apiRequestError, t.responseError.replace('${error}', errorMsg), 'error');
            return Promise.reject(error);
        });

        this.setupResourceHandlers();
        this.setupToolHandlers();

        // Fehlerbehandlung
        this.server.onerror = (error) => {
            if (!isanonymousModeEnabled) logEvent(
                'server',
                'N/A',
                l.prefix_MCP_Error,
                t.mcpErrorPrefix.replace('${error}', error.message || JSON.stringify(error, null, 2)),
                'error'
            );
        };

        process.on('SIGINT', async () => {
            await this.server.close();
            if (!isanonymousModeEnabled) logEvent('process', 'N/A', l.prefix_Shutdown, t.serverShutdownLog, 'info');
            process.exit(0);
        });
    }
    async ensureAuthenticated(token) {
        if (this.axiosInstance.defaults.headers.common['Authorization']) {
            delete this.axiosInstance.defaults.headers.common['Authorization'];
        }
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    /**
     * Login-Funktion mit Logging
     * @param {string} email - Benutzer-E-Mail
     * @param {string} password - Benutzer-Passwort
     * @returns {string} - Authentifizierungs-Token
     */
    async login(email, password) {
        if (!isanonymousModeEnabled) logEvent(email, 'N/A', l.prefix_login, t.authStarted, 'info');
        try {
            const loginResponse = await this.axiosInstance.post('/login', {
                email,
                password
            });
            if (!isanonymousModeEnabled) logEvent(
                email,
                'N/A',
                l.prefix_loginSuccess,
                t.loginTokenReceived.replace('${token}', loginResponse.data.data.token),
                'info'
            );
            return loginResponse.data.data.token;
        } catch (error) {
            if (!isanonymousModeEnabled) logEvent(
                email,
                'N/A',
                l.prefix_loginError,
                t.loginErrorPrefix.replace('${error}', error.message || error),
                'error'
            );
            throw new Error(t.authFailed);
        }
    }


    /**
     * Authentifizierung sicherstellen mit Logging
     * @param {string} token - Authentifizierungs-Token
     */
    async ensureAuthenticated(token) {
        if (!token) {
            if (!isanonymousModeEnabled) logEvent('auth', 'check', l.prefix_apiRequestError, t.missingTokenError, 'error');
            throw new Error(t.missingTokenError);
        }

        if (!isanonymousModeEnabled) logEvent('auth', 'token', l.prefix_apiRequestError, t.settingToken, 'info');

        // Entferne den Basic Auth Header, falls vorhanden
        if (this.axiosInstance.defaults.headers.common['Authorization']) {
            delete this.axiosInstance.defaults.headers.common['Authorization'];
        }

        // Setze das Token als Authorization-Header
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        if (!isanonymousModeEnabled) logEvent('axios', 'Auth', l.prefix_loginSuccess, t.tokenSetSuccess, 'info');
    }


    /**
     * Gruppen validieren mit Logging
     * @param {Array} groups - Gruppenliste
     * @param {string} token - Authentifizierungs-Token
     * @returns {Object} - Validierungsergebnis
     */
    async validateGroups(groups, token, IP, Port) {
        try {
            if (!isanonymousModeEnabled) logEvent(
                IP,
                Port,
                l.prefix_Incoming_Message,
                t.checkingGroups.replace('${groups}', JSON.stringify(groups)),
                'info'
            );
            if (!token) {
                if (!isanonymousModeEnabled) logEvent(IP, Port, l.prefix_apiRequestError, t.missingTokenError, 'error');
                throw new Error(t.missingTokenGroups);
            }

            const response = await this.axiosInstance.get('/groups', {
                headers: { Authorization: `Bearer ${token}` }
            });

            const availableGroups = response.data?.data?.assignableGroups || [];
            if (!isanonymousModeEnabled) logEvent(IP, Port, 'Available Groups', t.availableGroups.replace('${availableGroups}', JSON.stringify(availableGroups)), 'info');
            const invalidGroups = groups.filter(group => !availableGroups.includes(group));
            if (invalidGroups.length > 0) {
                if (!isanonymousModeEnabled) logEvent(
                    'validateGroups',
                    'N/A',
                    l.prefix_validationErr,
                    t.invalidGroupsLog.replace('${groups}', JSON.stringify(invalidGroups)),
                    'error'
                );
                return { isValid: false, invalidGroups };
            }
            if (!isanonymousModeEnabled) logEvent(IP, Port, 'Validation OK', t.allGroupsValid, 'info');
            return { isValid: true };
        } catch (error) {
            const errorMessage = error.response?.data || error.message;
            if (!isanonymousModeEnabled) logEvent(
                'validateGroups',
                'N/A',
                l.prefix_Validation_Err,
                t.groupValidationErrorPrefix.replace('${error}', errorMessage),
                'error'
            );
            throw new Error(
                error.response?.data?.message || t.fetchGroupsErrorBackup
            );
        }
    }
    setupResourceHandlers() {
        // List available resources
        this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: []
        }));
        // List resource templates
        this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
            resourceTemplates: []
        }));
        // Read resource
        this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            if (!request.params?.uri) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    t.missingUriParameter
                );
            }
            throw new McpError(ErrorCode.InvalidRequest, `Invalid URI: ${request.params.uri}`);
        });
    }

    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
            {   /* 1.0 Login #####################################################################################*/
                name: 'login',
                description: 'User login to retrieve an API token',
                inputSchema: {
                    type: 'object',
                    properties: {
                        email: {
                            type: 'string',
                            description: 'User email address for login'
                        },
                        password: {
                            type: 'string',
                            description: 'User password for login'
                        }
                    },
                    required: ['email', 'password']
                }
            },
            {   /* 1.1 Logout ####################################################################################*/
                name: 'logout',
                description: 'Invalidate the API token',
                inputSchema: { type: 'object', properties: {} },
            },
            {   /* 2.0 Chat ######################################################################################*/
                name: 'chat',
                description: 'Start or continue a chat with PrivateGPT with optional RAG capabilities',
                inputSchema: {
                    type: 'object',
                    properties: {
                        question: { type: 'string', description: 'The question or prompt to send' },
                        usePublic: { type: 'boolean', description: 'Use public knowledge base', default: false },
                        groups: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Group names for RAG (exclusive with usePublic)',
                        },
                        language: { type: 'string', description: 'Language code (e.g., "en")', default: 'en' },
                    },
                    required: ['question'],
                },
            },
            {   /* 2.1 Continue Chat #############################################################################*/
                name: 'continue_chat',
                description: 'Continue an existing chat',
                inputSchema: {
                    type: 'object',
                    properties: {
                        chatId: { type: 'string', description: 'ID of the existing chat to continue' },
                        question: { type: 'string', description: 'The next question or message in the chat' },
                    },
                    required: ['chatId', 'question'],
                },
            },
            {   /* 2.2 Get Chat Info #############################################################################*/
                name: 'get_chat_info',
                description: 'Retrieve details about an existing chat using its ID',
                inputSchema: {
                    type: 'object',
                    properties: {
                        chatId: { type: 'string', description: 'ID of the chat to retrieve details for' },
                        token: { type: 'string', description: 'Authorization token for API access' },
                    },
                    required: ['chatId', 'token'],
                },
            },
            {   /* 3.0 Create Source #############################################################################*/
                name: 'create_source',
                description: 'Create a new source with automatic markdown formatting',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Name of the source' },
                        content: { type: 'string', description: 'Markdown-formatted content' },
                        groups: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Optional groups to assign the source to',
                        },
                    },
                    required: ['name', 'content'],
                },
            },
            {   /* 3.1 Get Source ################################################################################*/
                name: 'get_source',
                description: 'Retrieve information about a specific source',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sourceId: { type: 'string', description: 'ID of the source to retrieve' },
                    },
                    required: ['sourceId'],
                },
            },
            {   /* 3.2 List Sources ##############################################################################*/
                name: 'list_sources',
                description: 'List all sources in a specific group',
                inputSchema: {
                    type: 'object',
                    properties: {
                        groupName: { type: 'string', description: 'Group name to list sources from' },
                    },
                    required: ['groupName'],
                },
            },
            {   /* 3.3 Edit Source ###############################################################################*/
                name: 'edit_source',
                description: 'Edit an existing source',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sourceId: {
                            type: 'string',
                            description: 'ID of the source to edit'
                        },
                        token: {
                            type: 'string',
                            description: 'Authorization token for API access'
                        },
                        title: {
                            type: 'string',
                            description: 'New title for the source (optional)'
                        },
                        content: {
                            type: 'string',
                            description: 'New markdown-formatted content for the source (optional)'
                        },
                        groups: {
                            type: 'array',
                            items: {
                                type: 'string'
                            },
                            description: 'Updated group(s) to assign to the source (optional)'
                        }
                    },
                    required: ['sourceId', 'token']
                }
            },
            {   /* 3.4 Delete Source #############################################################################*/
                name: 'delete_source',
                description: 'Delete a specific source',
                inputSchema: {
                    type: 'object',
                    properties: {
                        sourceId: { type: 'string', description: 'ID of the source to delete' },
                    },
                    required: ['sourceId'],
                },
            },
            {   /* 4.0 List Groups ###############################################################################*/
                name: 'list_groups',
                description: 'Retrieve personal and assignable groups',
                inputSchema: { type: 'object', properties: {} },
            },
            {   /* 4.1 Store Group ###############################################################################*/
                name: 'store_group',
                description: 'Create a new group',
                inputSchema: {
                    type: 'object',
                    properties: {
                        groupName: { type: 'string', description: 'Name of the new group' },
                        description: { type: 'string', description: 'Description of the new group' },
                    },
                    required: ['groupName'],
                },
            },
            {   /* 4.2 Delete Group ##############################################################################*/
                name: 'delete_group',
                description: 'Delete an existing group',
                inputSchema: {
                    type: 'object',
                    properties: {
                        groupName: { type: 'string', description: 'Name of the group to delete' },
                    },
                    required: ['groupName'],
                },
            },
            {   /* 5.0 Store User ################################################################################*/
                name: 'store_user',
                description: 'Create a new user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'Name of the user' },
                        email: { type: 'string', description: 'Email of the user' },
                        password: { type: 'string', description: 'Password for the user' },
                        language: { type: 'string', description: 'Preferred language (optional)', default: 'en' },
                        timezone: { type: 'string', description: 'Timezone (optional)', default: 'Europe/Berlin' },
                        roles: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Roles to assign (optional)'
                        },
                        groups: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Groups to assign (optional)'
                        },
                        usePublic: { type: 'boolean', description: 'Enable public knowledge (optional)', default: false }
                    },
                    required: ['name', 'email', 'password']
                },
            },
            {   /* 5.1 Edit User #################################################################################*/
                name: 'edit_user',
                description: 'Edit an existing user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', description: 'Email of the user to edit' },
                        name: { type: 'string', description: 'New name for the user (optional)' },
                        password: { type: 'string', description: 'New password for the user (optional)' },
                        language: { type: 'string', description: 'Preferred language (optional)' },
                        timezone: { type: 'string', description: 'Timezone (optional)' },
                        roles: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Updated roles (optional)'
                        },
                        groups: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Updated groups (optional)'
                        },
                        usePublic: { type: 'boolean', description: 'Enable public knowledge (optional)' }
                    },
                    required: ['email']
                }
            },
            {   /* 5.2 Delete User ###############################################################################*/
                name: 'delete_user',
                description: 'Delete an existing user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', description: 'Email of the user to delete' }
                    },
                    required: ['email']
                }
            },
			{   /* 6.0 pen AI compatible API Chat ######################################################################################*/
                name: 'oai_comp_api_chat',
                description: 'Start or continue a chat with PrivateGPT with optional RAG capabilities',
                inputSchema: {
                    type: 'object',
                    properties: {
                        question: { type: 'string', description: 'The question or prompt to send' },
                        usePublic: { type: 'boolean', description: 'Use public knowledge base', default: false },
                        groups: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Group names for RAG (exclusive with usePublic)',
                        },
                        language: { type: 'string', description: 'Language code (e.g., "en")', default: 'en' },
                    },
                    required: ['question'],
                },
            },
            {   /* 6.1 Open AI compatible API Continue Chat #############################################################################*/
                name: 'oai_comp_api_continue_chat',
                description: 'Continue an existing chat',
                inputSchema: {
                    type: 'object',
                    properties: {
                        chatId: { type: 'string', description: 'ID of the existing chat to continue' },
                        question: { type: 'string', description: 'The next question or message in the chat' },
                    },
                    required: ['chatId', 'question'],
                },
            }
        ],
    }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params?.name) {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    t.missingToolName
                );
            }
            try {
                //await this.ensureAuthenticated();
                if (!isanonymousModeEnabled) logEvent(
                    'system',
                    'N/A',
                    l.prefix_Handling_Tool_Request,
                    t.handlingToolRequest.replace('${tool}', request.params.name),
                    'info'
                );
                switch (request.params.name) {
                    /* 1.0 Login ######################################################################################*/
                    case 'login': {
                        const disabledResponse = checkToolEnabled('login');
                        if (disabledResponse) return disabledResponse;

                        const { email, password } = request.params.arguments; // Extrahiere email und password aus der Nachricht

                        if (!email || !password) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_loginError, t.loginMissingCredentialsAlternative, 'error');
                            return {
                                status: 'E10-R-1000',
                                message: t.loginEmailPasswordRequired
                            };
                        }

                        try {
                            // Aufruf des Login-Endpunkts der API
                            const loginResponse = await this.axiosInstance.post('/login', { email, password });

                            // Loggen des erfolgreichen Logins
                            if (!isanonymousModeEnabled) logEvent(
                                'server',
                                'swreg',
                                l.prefix_loginSuccess,
                                t.loginTokenReceived.replace('${token}', JSON.stringify(loginResponse.data)),
                                'info'
                            );
                            return { // Token zurückgeben
                                status: loginResponse.data?.status || 'I10-R-1001', // Dynamisch, falls der API-Status einheitlich ist
                                message: loginResponse.data?.message || '1.0 Login', // API-Nachricht verwenden oder Standardnachricht
                                token: loginResponse.data?.data?.token // Token aus API-Antwort
                            };
                        } catch (error) {
                            const errorMessage = error.response?.data?.message || error.message || t.unknownError;

                            // Loggen des Fehlers beim Login
                            if (!isanonymousModeEnabled) logEvent(
                                'server',
                                'swreg',
                                l.prefix_loginError,
                                t.loginError.replace('${error}', errorMessage),
                                'error'
                            );

                            return {
                                status: error.response?.status || 'E10-R-1001', // API-Fehlerstatus oder Standardfehlerstatus
                                message: errorMessage,
                            };
                        }
                    }
                   /* 1.1 Logout #####################################################################################*/
                    case 'logout': {
                        const disabledResponse = checkToolEnabled('logout');
                        if (disabledResponse) return disabledResponse;

                        const { token } = request.params; // Korrigiert von 'message' zu 'request.params'
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_logout, t.extractedToken.replace('${token}', token), 'info');

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        try {
                            // Setze den Bearer Token als Standard-Authorization-Header
                            await this.ensureAuthenticated(token);

                            // Console-Log für Header zu Debug-Zwecken
                            console.log('Logout Request Headers:', this.axiosInstance.defaults.headers.common);
                            const logoutResponse = await this.axiosInstance.delete('/logout', { headers: { Authorization: `Bearer ${token}` }})

                            // Loggen des erfolgreichen Logouts
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_logoutSuccess, t.logoutSuccess.replace('${data}', JSON.stringify(logoutResponse.data)), 'info');

                            return {
                                data: {}, // Optional: Zusätzliche Daten könnten hier eingefügt werden
                                message: 'success',
                                status: 200, // OK
                            };
                        } catch (error) {
                            const logoutErrorMessage = error.response?.data || error.message;
                            // Loggen des Fehlers beim Logout
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_logoutError, t.logoutError.replace('${error}', logoutErrorMessage), 'error');

                            return {
                                data: {},
                                message: error.response?.data?.message || t.logoutFailedTryAgain,
                                status: error.response?.status || 'E11-R-1100', // Internal Server Error oder spezifischer Statuscode
                            };
                        }
                    }
                    /* 2.0 Chat #######################################################################################*/
                    case 'chat': {
                        const disabledResponse = checkToolEnabled('chat');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chat, t.extractedToken.replace('${token}', token), 'info');

                        // Token prüfen und validieren
                        if (!token) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatError, t.noTokenError, 'error');
                            return { status: 'E20-R-2000', message: t.missingTokenError };
                        }
                        
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;
                        
                        // Argument-Validierung
                        if (!args || !args.question) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatError, t.missingArgumentsError.replace('${args}', JSON.stringify(args)), 'error');
                            return {
                                status: 'error',
                                message: t.missingArgumentsError.replace('${args}', JSON.stringify(args)),
                            };
                        }

                        const { question, usePublic, groups, language } = args;

                        // Konflikt zwischen `usePublic` und `groups` lösen
                        if (usePublic && groups && groups.length > 0) {
                            if (!isanonymousModeEnabled) logEvent('system', 'swreg', l.prefix_chatWarning, t.publicGroupsConflictWarning, 'warn');
                            args.usePublic = false;
                        }

                        try {
                            // Loggen der Chat-Anfrage
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatRequest, t.sendingChatRequest
                                .replace('${question}', question)
                                .replace('${usePublic}', usePublic)
                                .replace('${groups}', JSON.stringify(groups))
                                .replace('${language}', language), 'info');

                            const response = await this.axiosInstance.post(
                                '/chats',
                                {
                                    question,
                                    usePublic: usePublic || false,
                                    groups: Array.isArray(groups) ? groups : [groups],
                                    language: language || 'de',
                                },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );

                            const data = response.data?.data || {};
                            // Loggen der erfolgreichen Chat-Antwort
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatSuccess, t.chatResponseSuccess.replace('${data}', JSON.stringify(data)), 'info');

                            // Erfolgsantwort mit Status und Daten
                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Chat erfolgreich.',
                                content: {
                                    chatId: data.chatId,
                                    answer: data.answer,
                                    sources: data.sources || [],
                                },
                            };
                        } catch (error) {
                            const chatApiErrorMessage = error.message || error.response?.data;
                            // Loggen des Fehlers bei der Chat-API-Anfrage
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatApiError, t.chatApiError.replace('${error}', chatApiErrorMessage), 'error');

                            // Fehlerantwort mit Status und Nachricht
                            return {
                                status: error.response?.status || 'E20-R-2002',
                                message: error.response?.data?.message || t.chatApiErrorDefault,
                            };
                        }
                    }
                    /* 2.1 Continue Chat ##############################################################################*/
                    case 'continue_chat': {
                        const disabledResponse = checkToolEnabled('continue_chat');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;

                        if (!args || !args.chatId || !args.question) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chatError, t.missingChatParams, 'error');
                            return {
                              status: 'E21-R-2100',
                              message: t.missingChatParams
                            };
                        }

                        const { chatId, question } = args;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chat, t.conversationContinuation.replace('${chatId}', chatId), 'info');

                        try {
                            const continueChatResponse = await this.axiosInstance.patch(`/chats/${chatId}`, {
                                question: question,
                            });
                            // Loggen der erfolgreichen Fortsetzung der Konversation
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chatSuccess, t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)), 'info');
                            return {
                                content: {
                                    chatId:  continueChatResponse.data.data.chatId,
                                    answer:  continueChatResponse.data.data.answer,
                                    sources: continueChatResponse.data.sources || [],
                                    message: continueChatResponse.data.message,
                                    status:  continueChatResponse.data.status,
                                },
                            };
                        } catch (error) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chatError, t.apiRequestError.replace('${error}', error.message), 'error');
                            return {
                              status: error.response?.status || 'E21-R-2101',
                              message: error.response?.data?.message || t.continueConversationError,
                            };
                        }
                    }
                    /* 2.2 Get Chat Info ##############################################################################*/
                    case 'get_chat_info': {
                        const disabledResponse = checkToolEnabled('get_chat_info');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { chatId } = args;

                        if (!chatId) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_chat_infoError, t.missingChatId, 'error');
                            return { status: 'E22-R-2200', message: t.missingChatId };
                        }

                        try {
                            const response = await this.axiosInstance.get(`/chats/${chatId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });

                            const chatData = response.data?.data;

                            if (!chatData) {
                                if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_chat_infoError, t.noChatData, 'error');
                                return {
                                    status: 'E22-R-2201',
                                    message: t.noChatData,
                                };
                            }

                            // Loggen der abgerufenen Chat-Informationen
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_chat_infoSuccess, t.chatInfoRetrieved.replace('${chatData}', JSON.stringify(chatData)), 'info');

                            return {
                                data: {
                                    chatId: chatData.chatId,
                                    title: chatData.title || 'Unbenannter Chat',
                                    language: chatData.language || 'Unbekannt',
                                    groups: chatData.groups || [],
                                    messages: chatData.messages || []
                                },
                                message: response.data?.message || 'Erfolgreich abgerufen.'
                            };
                        } catch (error) {
                            const fetchChatErrorMessage = error.message || error.response?.data;
                            // Loggen des Fehlers beim Abrufen der Chat-Informationen
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_chat_infoError, t.fetchChatInfoError.replace('${error}', fetchChatErrorMessage), 'error');
                            return {
                                status: 'E22-R-2202',
                                message: error.response?.data?.message || 'Fehler beim Abrufen der Chat-Informationen.'
                            };
                        }
                    }                  
                    /* 2.3 Delete All Chats ##############################################################################*/
                    case 'delete_all_chats': {
                        const disabledResponse = checkToolEnabled('delete_all_chats');
                        if (disabledResponse) return disabledResponse;

                        const { token } = request.params;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        try {
                            const response = await this.axiosInstance.delete('/chats/flush', {
                                headers: { 
                                    Authorization: `Bearer ${token}`,
                                    Accept: 'application/json'
                                }
                            });

                            // Erfolg loggen
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_all_chatsSuccess, t.chatsDeleted, 'info');

                            return {
                                data: {},
                                message: response.data?.message || 'success',
                                status: response.status || 200
                            };
                        } catch (error) {
                            const deleteChatsErrorMessage = error.message || error.response?.data;
                            
                            // Fehler loggen
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_all_chatsError, t.deleteChatsError.replace('${error}', deleteChatsErrorMessage), 'error');

                            return {
                                status: error.response?.status || 'E23-R-2300',
                                message: error.response?.data?.message || 'Error deleting all chat history.'
                            };
                        }
                    }
                    /* 2.4 Delete Specific Chat ##############################################################################*/
                    case 'delete_chat': {
                        const disabledResponse = checkToolEnabled('delete_chat');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { chatId } = args;

                        if (!chatId) {
                            return { status: 'E24-R-2400', message: t.missingChatId };
                        }

                        try {
                            const response = await this.axiosInstance.delete(`/chats/${chatId}`, {
                                headers: { 
                                    Authorization: `Bearer ${token}`,
                                    Accept: 'application/json'
                                }
                            });

                            // Erfolg loggen
                            if (!isanonymousModeEnabled) {
                                logEvent('server', 'swreg', l.prefix_delete_chatSuccess, t.chatDeleted.replace('${chatId}', chatId), 'info');
                            }

                            return {
                                data: {},
                                message: response.data?.message || 'success',
                                status: response.status || 200
                            };
                        } catch (error) {
                            const deleteChatErrorMessage = error.message || error.response?.data;
                            
                            // Fehler loggen
                            if (!isanonymousModeEnabled) {
                                logEvent('server', 'swreg', l.prefix_delete_chatError, 
                                         t.deleteChatError.replace('${chatId}', chatId).replace('${error}', deleteChatErrorMessage), 'error');
                            }

                            return {
                                status: error.response?.status || 'E24-R-2401',
                                message: error.response?.data?.message || `Error deleting chat with ID ${chatId}.`
                            };
                        }
                    }
                    /* 3.0 Create Source ##############################################################################*/
                    case 'create_source': {
                        const disabledResponse = checkToolEnabled('create_source');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;
                        const token = request.params.token;

                        // Validierung: Erforderliche Parameter prüfen
                        if (!token) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceError, t.tokenMissing, 'error');
                            return { status: 'E30-R-3000', message: t.missingTokenError };
                        }

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;
                        
                        if (!args || !args.name || !args.content) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceError, t.missingNameAndContent, 'error');
                            return {
                              status: 'E30-R-3001',
                              message: t.missingNameAndContent
                            };
                        }

                        const { name, content, groups } = args;

                        try {
                            // Token im Header setzen
                            this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                            // Gruppenvalidierung vorab durchführen
                            if (groups && groups.length > 0) {
																if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceGroupCheck, t.checkingGroups.replace('${groups}', JSON.stringify(groups)),  'info');

                                const response = await this.axiosInstance.get('/groups');
                                const availableGroups = response.data?.data?.assignableGroups || [];

                                // Ungültige Gruppen ermitteln
                                const invalidGroups = groups.filter(group => !availableGroups.includes(group));
                                if (invalidGroups.length > 0) {
                                    if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceInvalidGroups, t.invalidGroups.replace('${groups}', invalidGroups.join(', ')), 'error');
                                    return {
                                        status: 'E30-R-3002',
                                        message: t.invalidGroups.replace('${groups}', invalidGroups.join(', ')),
                                    };
                                }
                            }

                            // API-Aufruf zur Erstellung der Quelle
                            const createSourceResponse = await this.axiosInstance.post(
                                '/sources',
                                { name, content, groups },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );

                            // Loggen der erfolgreichen Erstellung der Quelle
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceSuccess, t.createSourceSuccess.replace('${data}', JSON.stringify(createSourceResponse.data)), 'info');

                            // Erfolgsantwort
                            return {
                                status: createSourceResponse.data?.status || 'ok',
                                message: createSourceResponse.data?.message || 'Quelle erfolgreich erstellt.',
                                data: createSourceResponse.data?.data,
                            };
                        } catch (error) {
                            const createSourceError = error.response?.data || error.message;
                            // Loggen des Fehlers bei der Erstellung der Quelle
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceError, t.createSourceError.replace('${error}', createSourceError), 'error');

                            // Fehlerhafte Antwort
                            if (error.response) {
								if (!isanonymousModeEnabled) {
									logEvent(
										'server',
										'swreg',
										l.prefix_create_sourceResponseError,
										t.returnStatus.replace('${Status}', error.response.status) +
										`, Data: ${JSON.stringify(error.response.data)}`,
										'error'
									);
								}
                                return {
                                    status: 'E30-R-3003',
                                    message: 'Ein Fehler ist aufgetreten.',
                                    details: {
                                        status: error.response.status,
                                        headers: error.response.headers,
                                        data: error.response.data,
                                    },
                                };
                            } else if (error.request) {
                                if (!isanonymousModeEnabled) logEvent(
                                  'server',
                                  'swreg',
                                  l.prefix_create_sourceNoResponse,
                                  t.noServerResponse + ` ${JSON.stringify(error.request)}`,
                                  'error'
                                );

                                return {
                                    status: 'E30-R-3004',
                                    message: t.noServerResponse,
                                    details: { request: error.request },
                                };
                            } else {
                                if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_create_sourceUnknownError, t.create_sourceUnknownError.replace('${error}', error.message), 'error');
                                return {
                                    status: 'E30-R-3005',
                                    message: error.message || t.unknownError,
                                };
                            }
                        }
                    }
                    /* 3.1 Get Source #################################################################################*/
                    case 'get_source': {
                        const disabledResponse = checkToolEnabled('get_source');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_sourceRequest, t.makingGetSourceRequest.replace('${args}', JSON.stringify(args, null, 2)), 'info');

                        try {
                            const getSourceResponse = await this.axiosInstance.get(`/sources/${args.sourceId}`);
                            // Loggen der erhaltenen Quellenantwort
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_sourceSuccess, t.gotGetSourceResponse.replace('${data}', JSON.stringify(getSourceResponse.data, null, 2)), 'info');
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(getSourceResponse.data, null, 2)
                                    }
                                ]
                            };
                        } catch (error) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_get_sourceError, t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)), 'error');
                            return {
                                status: 'E31-R-3101',
                                message: t.apiErrorDetails
                                    .replace('${status}', error.response?.status || 'E31-R-3151')
                                    .replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)),
                            };
                        }
                    }
                    /* 3.2 List Sources ##############################################################################*/
                    case 'list_sources': {
                        const disabledResponse = checkToolEnabled('list_sources');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_sourcesRequest, t.makingListSourcesRequest.replace('${args}', JSON.stringify(args, null, 2)), 'info');

                        try {
                            const listSourcesResponse = await this.axiosInstance.post('/sources/groups', {
                                groupName: args.groupName
                            });
                            // Loggen der erhaltenen Quellenliste
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_sourcesSuccess, t.gotListSourcesResponse.replace('${data}', JSON.stringify(listSourcesResponse.data, null, 2)), 'info');
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(listSourcesResponse.data, null, 2)
                                    }
                                ]
                            };
                        } catch (error) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_sourcesError, t.apiRequestError.replace('${error}', error.message || JSON.stringify(error, null, 2)), 'error');
                            return {
                              status: 'E32-R-3210',
                              message: error.response?.data?.message || t.fetchSourcesError,
                            };
                        }
                    }
                    /* 3.3 Edit Source ################################################################################*/
    				case 'edit_source': {
    					const disabledResponse = checkToolEnabled('edit_source');
    					if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const { sourceId, title, content, groups } = args;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // Validierung: Erforderliche Parameter
                        if (!sourceId) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_sourceError, t.sourceIdRequiredEditSource, 'error');
                            return {
                                data: {},
                                message: t.missingParameterError.replace('${parameter}', 'sourceId'),
                                status: 'E33-R-3300', // Bad Request
                            };
                        }

                        // Loggen des Beginns der Quellenbearbeitung
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_source, t.editSourceLog.replace('${sourceId}', sourceId).replace('${title}', title || 'unverändert'), 'info');

                        try {
                            // Nur Felder senden, die tatsächlich aktualisiert werden sollen
                            const payload = {};
                            if (title) payload.title = title;
                            if (content) payload.content = content;
                            if (groups) payload.groups = groups;

                            const editSourceResponse = await this.axiosInstance.patch(
                                `/sources/${sourceId}`,
                                payload,
                                {
                                    headers: {
                                        Authorization: `Bearer ${token}` // Nutze den bereitgestellten Token
                                    },
                                }
                            );

                            // Loggen der erfolgreichen Quellenbearbeitung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_sourceSuccess, t.editSourceSuccess.replace('${data}', JSON.stringify(editSourceResponse.data, null, 2)), 'info');

                            // Erfolgreiche Antwort
                            return {
                                data: editSourceResponse.data?.data || {}, // Optionale Daten aus der API
                                message: editSourceResponse.data?.message || 'Quelle erfolgreich bearbeitet.',
                                status: editSourceResponse.status || 200, // OK
                            };
                        } catch (error) {
                            const editSourceError = error.message || JSON.stringify(error.response?.data);
                            // Loggen des Fehlers bei der Quellenbearbeitung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_sourceError, t.editSourceError.replace('${error}', editSourceError), 'error');

                            // Fehlerhafte Antwort
                            return {
                                data: {},
                                message: error.response?.data?.message || 'Bearbeiten der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                                status: error.response?.status || 'E33-R-3301', // Internal Server Error
                            };
                        }
                    }                   
                    /* 3.4 Delete Source ##############################################################################*/
                    case 'delete_source': {
                        const disabledResponse = checkToolEnabled('delete_source');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;

                        // Validierung: Token erforderlich
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { sourceId } = args;

                        // Validierung: sourceId erforderlich
                        if (!sourceId) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_sourceError, t.sourceIdRequiredDeleteSource, 'error');
                            return {
                                data: {},
                                message: t.missingParameterError.replace('${parameter}', 'sourceId'),
                                status: 'E34-R-3400', // Bad Request
                            };
                        }

                        try {
                            // API-Aufruf: Quelle löschen
                            const deleteResponse = await this.axiosInstance.delete(`/sources/${sourceId}`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });

                            // Loggen der erfolgreichen Quellenlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_sourceSuccess, t.deleteSourceSuccess.replace('${data}', JSON.stringify(deleteResponse.data, null, 2)), 'info');

                            // Erfolgreiche Antwort
                            return {
                                data: deleteResponse.data?.data || {}, // Optionale Daten aus der API
                                message: deleteResponse.data?.message || 'Quelle erfolgreich gelöscht.',
                                status: deleteResponse.status || 200, // OK
                            };
                        } catch (error) {
                            // Loggen des Fehlers bei der Quellenlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_sourceError, t.deleteSourceError.replace('${error}', error.message || JSON.stringify(error.response?.data)), 'error');
                            if (axios.isAxiosError(error)) {
                                const message = error.response?.data?.message || 'Fehler beim Löschen der Quelle.';
                                if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_apiRequestError, t.apiErrorDetails.replace('${status}', error.response?.status || 'E41-R-4100').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)), 'error');
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: `API-Fehler: ${message}`,
                                        },
                                    ],
                                    isError: true,
                                };
                            }
                            throw new McpError(
                                ErrorCode.InternalError,
                                t.deleteSourceInternalError
                            );
                        }
                    }
                    /* 4.0 List Groups ################################################################################*/
                    case 'list_groups': {
                        const disabledResponse = checkToolEnabled('list_groups');
                        if (disabledResponse) return disabledResponse;

                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_groupsRequest, t.makingListGroupsRequest, 'info');

                        try {
                            const listGroupsResponse = await this.axiosInstance.get('/groups');
                            // Loggen der erfolgreichen Gruppenliste
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_groupsSuccess, t.gotListGroupsResponse.replace('${data}', JSON.stringify(listGroupsResponse.data)), 'info');
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: JSON.stringify(listGroupsResponse.data, null, 2)
                                    }
                                ]
                            };
                        } catch (error) {
                            const fetchGroupsError = error.message || JSON.stringify(error.response?.data);
                            // Loggen des Fehlers beim Abrufen der Gruppen
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_list_groupsError, t.fetchGroupsError.replace('${error}', fetchGroupsError), 'error');
                            return {
                                status: 'E40-R-4051',
                                message: `${t.fetchGroupsErrorPrefix} ${error.response?.data?.message || t.unknownError}`,
                            };
                        }
                    }
                    /* 4.1 Store Group ################################################################################*/
                    case 'store_group': {
                        const disabledResponse = checkToolEnabled('store_group');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;

                        if (!args || !args.groupName) {
                            throw new McpError(
                              ErrorCode.InvalidRequest,
                              t.missingGroupParameterStore
                            );
                        }

                        // Loggen des Beginns der Gruppenspeicherung
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_groupRequest, t.storeGroupLog
                            .replace('${groupName}', args.groupName)
                            .replace('${description}', args.description || t.noDescriptionProvided), 'info');

                        try {
                            const storeGroupResponse = await this.axiosInstance.post('/groups', {
                                groupName: args.groupName,
                                description: args.description || ''
                            });
                            // Loggen der erfolgreichen Gruppenspeicherung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_groupSuccess, t.storeGroupSuccess.replace('${data}', JSON.stringify(storeGroupResponse.data, null, 2)), 'info');

                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Gruppe "${args.groupName}" erfolgreich erstellt mit ID: ${storeGroupResponse.data.id}`
                                    }
                                ]
                            };
                        } catch (error) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_groupError, t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)), 'error');
                            if (axios.isAxiosError(error)) {
                                const message = error.response?.data?.message ?? error.message;
                                if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_apiRequestError, t.apiErrorDetails.replace('${status}', error.response?.status || 'E41-R-4100').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)), 'error');
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: `API-Fehler: ${message}`
                                        }
                                    ],
                                    isError: true
                                };
                            }
                            throw error;
                        }
                    };
                    /* 4.2 Delete Group ###############################################################################*/
                    case 'delete_group': {
                        const disabledResponse = checkToolEnabled('delete_group');
                        if (disabledResponse) return disabledResponse;

                        const { groupName } = request.params.arguments; // Extrahiere die Gruppe
                        if (!groupName) {
                            throw new McpError(
                                ErrorCode.InvalidRequest,
                                t.missingGroupParameterDelete
                            );
                        }

                        // Loggen des Beginns der Gruppenlöschung
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_groupRequest, t.deleteGroupLog.replace('${groupName}', groupName), 'info');

                        try {
                            // API-Aufruf mit dem notwendigen JSON-Body
                            const deleteGroupResponse = await this.axiosInstance.delete('/groups', {
                                data: { groupName }, // JSON-Body für den DELETE-Request
                            });

                            // Loggen der erfolgreichen Gruppenlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_groupSuccess, t.deleteGroupSuccessLog.replace('${data}', JSON.stringify(deleteGroupResponse.data)), 'info');

                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Gruppe "${groupName}" wurde erfolgreich gelöscht.`,
                                    },
                                ],
                            };
                        } catch (error) {
                            // Loggen des Fehlers bei der Gruppenlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_groupError, t.apiRequestError.replace('${error}', error.message || JSON.stringify(error.response?.data)), 'error');
                            if (axios.isAxiosError(error)) {
                                const message = error.response?.data?.message || 'Fehler beim Löschen der Gruppe.';
                                if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_apiRequestError, t.apiErrorDetails.replace('${status}', error.response?.status || 'E41-R-4100').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)), 'error');
                                return {
                                    content: [
                                        {
                                            type: 'text',
                                            text: `API-Fehler: ${message}`,
                                        },
                                    ],
                                    isError: true,
                                };
                            }
                            throw new McpError(
                                ErrorCode.InternalError,
                                t.deleteGroupInternalError
                            );
                        }
                    }
                    /* 5.0 Store User ################################################################################*/
                    case 'store_user': {
                        const disabledResponse = checkToolEnabled('store_user');
                        if (disabledResponse) return disabledResponse;

                        // Token und Argumente aus request.params entnehmen
                        const { token, arguments: args } = request.params;

                        // Token validieren
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // Erforderliche Felder prüfen
                        if (!args || !args.name || !args.email || !args.password) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_userError, t.missingNameEmailPwd, 'error');
                            return {
                              status: 'E50-R-5000',
                              message: t.missingNameEmailPwd
                            };
                        }

                        try {
                            // Benutzer anlegen
                            const response = await this.axiosInstance.post(
                                '/users',
                                {
                                    name: args.name,
                                    email: args.email,
                                    password: args.password,
                                    language: args.language || 'en',
                                    timezone: args.timezone || 'Europe/Berlin',
                                    roles: args.roles || [],
                                    groups: args.groups || [],
                                    usePublic: args.usePublic || false
                                },
                                {
                                    headers: {
                                        Authorization: `Bearer ${token}`
                                    }
                                }
                            );

                            // Loggen der erfolgreichen Benutzererstellung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_userSuccess, t.createUserSuccess.replace('${data}', JSON.stringify(createUserResponse.data)), 'info');

                            // Erfolgreiche Antwort
                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich erstellt.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            // Loggen des Fehlers bei der Benutzererstellung
							
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_userError, t.createUserError.replace('${error}', error.response?.data || error.message), 'error');
                            return {
                                status: error.response?.status || 'E50-R-5001',
                                message: error.response?.data?.message || t.createUserError.replace('${error}', error.response?.data || error.message),
                            };
                        }
                    }
                    /* 5.1 Edit User #################################################################################*/
                    case 'edit_user': {
                        const disabledResponse = checkToolEnabled('edit_user');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // Mindestens die E-Mail muss angegeben sein, um den User zu identifizieren
                        if (!args || !args.email) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_userError, t.emailRequiredForEdit, 'error');
                            return {
                                status: 'E51-R-5100',
                                message: t.emailRequiredForEdit
                            };
                        }

                        try {
                            // Nur Felder senden, die tatsächlich aktualisiert werden sollen
                            const payload = {};
                            if (args.name) payload.name = args.name;
                            if (args.password) payload.password = args.password;
                            if (args.language) payload.language = args.language;
                            if (args.timezone) payload.timezone = args.timezone;
                            if (Array.isArray(args.roles)) payload.roles = args.roles;
                            if (Array.isArray(args.groups)) payload.groups = args.groups;
                            if (typeof args.usePublic === 'boolean') payload.usePublic = args.usePublic;

                            // E-Mail ist Pflicht, um den Benutzer auf dem Server zu finden
                            payload.email = args.email;

                            const response = await this.axiosInstance.patch(
                                '/users',
                                payload,
                                {
                                    headers: { Authorization: `Bearer ${token}` }
                                }
                            );

                            // Loggen der erfolgreichen Benutzerbearbeitung
							if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_store_userSuccess, t.editUserSuccess.replace('${data}', JSON.stringify(response.data)), 'info');
                       
                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || t.editUserSuccess.replace('${data}', JSON.stringify(response.data)),
                                data: response.data?.data
                            };
                        } catch (error) {
                            const editUserError = error.response?.data || error.message;
                            // Loggen des Fehlers bei der Benutzerbearbeitung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_edit_userError, t.editUserError.replace('${error}', editUserError), 'error');
                            return {
                                status: error.response?.status || 'E51-R-5101',
                                message: error.response?.data?.message || 'Fehler beim Bearbeiten des Benutzers.'
                            };
                        }
                    }
                    /* 5.2 Delete User ################################################################################*/
                    case 'delete_user': {
                        const disabledResponse = checkToolEnabled('delete_user');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // E-Mail ist nötig, um den Benutzer zu löschen
                        if (!args || !args.email) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_userError, t.emailRequiredForDelete, 'error');
                            return {
                                status: 'E52-R-5200',
                                message: t.emailRequiredForDelete
                            };
                        }

                        try {
                            // DELETE-Anfrage mit JSON-Body
                            const response = await this.axiosInstance.delete(
                                '/users',
                                {
                                    data: { email: args.email },
                                    headers: { Authorization: `Bearer ${token}` }
                                }
                            );

                            // Loggen der erfolgreichen Benutzerlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_userSuccess, t.deleteUserSuccess.replace('${data}', JSON.stringify(response.data, null, 2)), 'info');

                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich gelöscht.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            // Loggen des Fehlers bei der Benutzerlöschung
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_delete_userError, t.deleteUserError.replace('${error}', error.response?.data || error.message), 'error');
                            return {
                                status: error.response?.status || 'E52-R-5201',
                                message: error.response?.data?.message || 'Fehler beim Löschen des Benutzers.'
                            };
                        }
                    }
                    /* 5.3 Reactivate User ################################################################################*/
                    case 'reactivate_user': {
                        const disabledResponse = checkToolEnabled('reactivate_user');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // E-Mail ist erforderlich, um einen Benutzer zu reaktivieren
                        if (!args || !args.email) {
                            if (!isanonymousModeEnabled) {
                                logEvent('server', 'swreg', l.prefix_reactivate_userError, t.emailRequiredForReactivate, 'error');
                            }
                            return {
                                status: 'E53-R-5300',
                                message: t.emailRequiredForReactivate
                            };
                        }

                        try {
                            // POST-Anfrage mit JSON-Body für die Reaktivierung des Benutzers
                            const response = await this.axiosInstance.post(
                                '/api/v1/users/reactivate',
                                { email: args.email },
                                {
                                    headers: { 
                                        Authorization: `Bearer ${token}`,
                                        Accept: 'application/json'
                                    }
                                }
                            );

                            // Loggen der erfolgreichen Benutzerreaktivierung
                            if (!isanonymousModeEnabled) {
                                logEvent('server', 'swreg', l.prefix_reactivate_userSuccess, `Benutzer erfolgreich reaktiviert: ${JSON.stringify(response.data)}`, 'info');
                            }

                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich reaktiviert.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            // Loggen des Fehlers bei der Benutzerreaktivierung
                            if (!isanonymousModeEnabled) {
                                logEvent('server', 'swreg', l.prefix_reactivate_userError, t.reactivateUserError.replace('${error}', error.response?.data || error.message), 'error');
                            }
                            return {
                                status: error.response?.status || 'E53-R-5301',
                                message: error.response?.data?.message || 'Fehler bei der Reaktivierung des Benutzers.'
                            };
                        }
                    }
                   /* 6.0 OpenAPI Compatible API Chat #######################################################################################*/
                    case 'oai_comp_api_chat': {
                        const disabledResponse = checkToolEnabled('oai_comp_api');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chat, t.extractedToken.replace('${token}', token), 'info');

                        // Token prüfen und validieren
                        if (!token) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatError, t.noTokenError, 'error');
                            return { status: 'E60-R-6000', message: t.missingTokenError };
                        }
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;


                        // Argument-Validierung
                        if (!args || !args.question) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatError, t.missingArgumentsError.replace('${args}', JSON.stringify(args)), 'error');
                            return {
                                status: 'error',
                                message: t.missingArgumentsError.replace('${args}', JSON.stringify(args)),
                            };
                        }

                        const { question, usePublic, groups, language } = args;

                        // Konflikt zwischen `usePublic` und `groups` lösen
                        if (usePublic && groups && groups.length > 0) {
                            if (!isanonymousModeEnabled) logEvent('system', 'swreg', l.prefix_chatWarning, t.publicGroupsConflictWarning, 'warn');
                            args.usePublic = false;
                        }

                        try {
                            // Loggen der Chat-Anfrage
                            if (!isanonymousModeEnabled) logEvent('oaichat', 'swreg', l.prefix_chatRequest, t.sendingChatRequest
                                .replace('${question}', question)
                                .replace('${usePublic}', usePublic)
                                .replace('${groups}', JSON.stringify(groups))
                                .replace('${language}', language), 'info');

                            const response = await this.axiosInstance.post(
                                '/chats',
                                {
                                    question,
                                    usePublic: usePublic || false,
                                    groups: Array.isArray(groups) ? groups : [groups],
                                    language: language || 'de',
                                },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );

                            const data = response.data?.data || {};
                            // Loggen der erfolgreichen Chat-Antwort
                            if (!isanonymousModeEnabled) logEvent('server', 'oareg', l.prefix_chatSuccess, t.chatResponseSuccess.replace('${data}', JSON.stringify(data)), 'info');

                            // Erfolgsantwort mit Status und Daten
                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Chat erfolgreich.',
                                content: {
                                    chatId: data.chatId,
                                    answer: data.answer,
                                    sources: data.sources || [],
                                },
                            };
                        } catch (error) {
                            const chatApiErrorMessage = error.message || error.response?.data;
                            // Loggen des Fehlers bei der Chat-API-Anfrage
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_chatApiError, t.chatApiError.replace('${error}', chatApiErrorMessage), 'error');

                            // Fehlerantwort mit Status und Nachricht
                            return {
                                status: error.response?.status || 'E60-R-6002',
                                message: error.response?.data?.message || t.chatApiErrorDefault,
                            };
                        }
                    }
                    /* 6.1 Continue Chat ##############################################################################*/
                    case 'oai_comp_api_continue_chat': {
                        const disabledResponse = checkToolEnabled('oai_comp_api');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;

                        if (!args || !args.chatId || !args.question) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chatError, t.missingChatParams, 'error');
                            return {
                              status: 'E21-R-6100',
                              message: t.missingChatParams
                            };
                        }

                        const { chatId, question } = args;
                        if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chat, t.conversationContinuation.replace('${chatId}', chatId), 'info');

                        try {
                            const continueChatResponse = await this.axiosInstance.patch(`/chats/${chatId}`, {
                                question: question,
                            });
                            // Loggen der erfolgreichen Fortsetzung der Konversation
                            if (!isanonymousModeEnabled) logEvent('server', 'oareg', l.prefix_continue_chatSuccess, t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)), 'info');
                            return {
                                content: {
                                    chatId:  continueChatResponse.data.data.chatId,
                                    answer:  continueChatResponse.data.data.answer,
                                    sources: continueChatResponse.data.sources || [],
                                    message: continueChatResponse.data.message,
                                    status:  continueChatResponse.data.status,
                                },
                            };
                        } catch (error) {
                            if (!isanonymousModeEnabled) logEvent('server', 'swreg', l.prefix_continue_chatError, t.apiRequestError.replace('${error}', error.message), 'error');
                            return {
                              status: error.response?.status || 'E61-R-6101',
                              message: error.response?.data?.message || t.continueConversationError,
                            };
                        }
                    }
                    default:
                        // Loggen unbekannter Befehle
                        if (!isanonymousModeEnabled) logEvent(
                            'system',
                            'swreg',
                            l.prefix_unknownCommand,
                            t.unknownCommandError.replace('${cmd}', request.params.name),
                            'warn'
                        );
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            t.unknownTool.replace('${toolName}', request.params.name)
                        );
                    }
            }
            catch (error) {
                if (!isanonymousModeEnabled) logEvent('system', 'swreg', l.prefix_Unhandled_Error, t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)), 'error');
                if (axios.isAxiosError(error)) {
                    const message = error.response?.data?.message ?? error.message;
                    if (!isanonymousModeEnabled) logEvent('system', 'swreg', l.prefix_apiRequestError, t.apiErrorDetails.replace('${status}', error.response?.status || 'Unknown').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)), 'error');
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

 /* ##################################################################################################
   # MESSAGE HANDLER
   ##################################################################################################*/
async run() {
    const isPortInUse = (port) => new Promise((resolve, reject) => {
        const tester = net.createServer()
            .once('error', (err) => (err.code === 'EADDRINUSE' ? resolve(true) : reject(err)))
            .once('listening', () => tester.once('close', () => resolve(false)).close())
            .listen(port);
    });

    const PORT = Port;
    if (await isPortInUse(PORT)) {
        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_Port_Check, t.portInUse.replace('${PORT}', PORT), 'error');
        throw new Error(t.portInUse.replace('${PORT}', PORT));
    }

    const transport = new TcpServerTransport(PORT, enableTLS, sslKeyPath, sslCertPath);
    await transport.start(async (message) => {
        try {
            // if (!isanonymousModeEnabled) logEvent('client', 'swmsg', 'Incoming Message', `Nachricht empfangen: ${JSON.stringify(message)}`, 'info');
			if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_Incoming_Message, t.incomingMessage.replace('${MESSAGE}', JSON.stringify(message)), 'info');

            // Token-Validierung nur durchführen, wenn es nicht der "login"-Befehl ist
            // if (message.command !== 'login') {
            //     const tokenValidation = validateToken(message.token);
            //     if (tokenValidation) return tokenValidation;
            // }

            if (!message || typeof message !== 'object') {
                throw new McpError(
                    ErrorCode.InvalidRequest,
                    t.invalidOrEmptyRequest
                );
            }

            // Verarbeite verschiedene Anfragen dynamisch
            if (!message.command) {
                throw new McpError(
                  ErrorCode.InvalidRequest,
                  t.missingCommandParameter
                );
            }

            switch (message.command) {
                /* 1.0 Login ######################################################################################*/
				// clientIP, clientPort, functionName, status, level = 'info')				
                case 'login': {
                    const disabledResponse = checkToolEnabled('login');
                    if (disabledResponse) return disabledResponse;

                    // Extrahiere die Argumente aus der Nachricht
                    const args = getArguments(message);
                    const { email, password: Pwd } = args;

                    // Überprüfe, ob die E-Mail und das Passwort vorhanden sind
                    if (!email || !Pwd) {
                        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_loginError, t.loginEmailPasswordRequired, 'error');
                        return {
                            status: 'E10-M-1050',
                            message: t.loginEmailPasswordRequired,
                        };
                    }

                    let password;

                    // Passwort entschlüsseln, falls erforderlich
                    if (typeof PwEncryption !== 'undefined' && PwEncryption) {
                        password = decryptPassword(Pwd);
                    } else {
                        password = Pwd;
                    }

                    try {
                        // Login-API aufrufen
                        const loginResponse = await this.axiosInstance.post('/login', { email, password });

                        // Loggen des erfolgreichen Logins
                        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_loginSuccess, t.loginSuccess.replace('${data}', JSON.stringify(loginResponse.data)), 'info');

                        // Entfernen des Basic Auth Headers und Setzen des Bearer Tokens
                        delete this.axiosInstance.defaults.headers.common['Authorization'];
                        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${loginResponse.data.data.token}`;

                        // Token zurückgeben
                        return {
                            status: loginResponse.data?.status || 'ok', // Dynamisch, falls der API-Status einheitlich ist
                            message: loginResponse.data?.message || 'Login erfolgreich.', // API-Nachricht verwenden oder Standardnachricht
                            token: loginResponse.data?.data?.token, // Token aus API-Antwort
                        };
                    } catch (error) {
                        const errorMessage = error.response?.data || error.message;
                        // Loggen des Fehlers beim Login
                        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_loginError, t.loginError.replace('${error}', errorMessage), 'error');

                        return {
                            status: error.response?.status || 'E10-M-1051', // API-Fehlerstatus oder Standardfehlerstatus,
                            message: error.response?.data || error.message || 'no error message'
                        };
                    }
                }
                /* 1.1 Logout #####################################################################################*/
                case 'logout': {
                    const disabledResponse = checkToolEnabled('logout');
                    if (disabledResponse) return disabledResponse;

                    const { token } = message;
                    
                    try {
                        const logoutResponse = await this.axiosInstance.delete('/logout', {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        });


                        // Loggen des erfolgreichen Logouts
                        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_logoutSuccess, t.logoutSuccess.replace('${data}', JSON.stringify(logoutResponse.data)), 'info');

                        return {
                            data: {}, // Optional: Zusätzliche Daten könnten hier eingefügt werden
                            status: logoutResponse.data?.status || 'no status', // Dynamisch, falls der API-Status einheitlich ist
                            message: logoutResponse.data?.message || 'no message', // API-Nachricht verwenden oder Standardnachricht
                        };
                    } catch (error) {
                        const logoutErrorMessage = error.response?.data || error.message;
                        // Loggen des Fehlers beim Logout
                        if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_logoutError, t.logoutError.replace('${error}', logoutErrorMessage), 'error');

                        return {
                            data: {},
                            message: error.response?.data || error.message || t.noErrorMessage,
                            status: error.response?.status || 'E11-R-1150', // Internal Server Error oder spezifischer Statuscode
                        };
                    }
                }
                /* 2.0 Chat #######################################################################################*/
                case 'chat': {
                    const disabledResponse = checkToolEnabled('chat');
                    if (disabledResponse) return disabledResponse;

                    const { token, arguments: args } = message;
                    if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chat, t.extractedToken.replace('${token}', token), 'info');

                    // Token prüfen und validieren
                    if (!token) {
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatError, t.noTokenError, 'error');
                        return { status: 'E20-M-2000', message: t.missingTokenError };
                    }

                    // Argument-Validierung
                    if (!args || !args.question) {
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatError, t.missingArgumentsError.replace('${args}', JSON.stringify(args)), 'error');
                        return {
                            status: 'error',
                            message: t.missingArgumentsError.replace('${args}', JSON.stringify(args)),
                        };
                    }

                    const { question, usePublic, groups, language } = args;

                    // Konflikt zwischen `usePublic` und `groups` lösen
                    if (usePublic && groups && groups.length > 0) {
                        if (!isanonymousModeEnabled) logEvent('system', 'swmsg', l.prefix_chatWarning, t.publicGroupsConflictWarning, 'warn');
                        args.usePublic = false;
                    }

                    try {
                        // Loggen der Chat-Anfrage
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatRequest, t.sendingChatRequest
                            .replace('${question}', question)
                            .replace('${usePublic}', usePublic)
                            .replace('${groups}', JSON.stringify(groups))
                            .replace('${language}', language), 'info');

                        const response = await this.axiosInstance.post(
                            '/chats',
                            {
                                question,
                                usePublic: usePublic || false,
                                groups: Array.isArray(groups) ? groups : [groups],
                                language: language || 'de',
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );

                        const data = response.data?.data || {};
                        // Loggen der erfolgreichen Chat-Antwort
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatSuccess, t.chatResponseSuccess.replace('${data}', JSON.stringify(data)), 'info');

                        // Erfolgsantwort mit Status und Daten
                        return {
                            status: response.data?.status || 'ok',
                            message: response.data?.message || 'Chat erfolgreich.',
                            content: {
                                chatId: data.chatId,
                                answer: data.answer,
                                sources: data.sources || [],
                            },
                        };
                    } catch (error) {
                        const chatApiErrorMessage = error.message || error.response?.data;
                        // Loggen des Fehlers bei der Chat-API-Anfrage
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatApiError, t.chatApiError.replace('${error}', chatApiErrorMessage), 'error');

                        // Fehlerantwort mit Status und Nachricht
                        return {
                            status: error.response?.status || 'E20-R-2002',
                            message: error.response?.data?.message || t.chatApiErrorDefault,
                        };
                    }
                }			
				/* 2.1 Continue Chat ##############################################################################*/
				case 'continue_chat': {
					const disabledResponse = checkToolEnabled('continue_chat');
					if (disabledResponse) return disabledResponse;

					const token = message.token; // Token direkt extrahieren
					const args = message.arguments || {}; // Sichere Extraktion der Argumente
					const { chatId, question } = args;

					if (!args || !args.chatId || !args.question) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_continue_chat, t.missingChatParams, 'error');
						return { status: 'E21-M-2150', message: t.missingChatParams };
					}

					try {
						const continueChatResponse = await this.axiosInstance.patch(
							`/chats/${chatId}`,
							{ question },
							{ headers: { Authorization: `Bearer ${token}` } }
						);

						// Loggen der erfolgreichen Continue-Chat-Antwort
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_continue_chatSuccess, t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)), 'info');

						return {
							content: {
								chatId: continueChatResponse.data.data.chatId,
								answer: continueChatResponse.data.data.answer,
								sources: continueChatResponse.data.sources || [],
								message: continueChatResponse.data.message,
								status: continueChatResponse.data.status,
							},
						};
					} catch (error) {
						// Loggen des Fehlers bei der Continue-Chat-API-Anfrage
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_apiRequestError, t.apiRequestError.replace('${error}', error.message), 'error');
						return {
							status: 'E21-M-2151',
							message: error.response?.data?.message || error.message || t.noErrorMessage,
						};
					}
				}
				/* 2.2 Get Chat Info ##############################################################################*/
				case 'get_chat_info': {
					const disabledResponse = checkToolEnabled('get_chat_info');
					if (disabledResponse) return disabledResponse;

					const { token } = message; // Token direkt aus `message` extrahieren
					const args = message.arguments || {}; // Argumente aus `message` extrahieren
					const { chatId } = args; // chatId aus den Argumenten extrahieren

					if (!chatId) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_chat_info, t.missingChatId, 'error');
						return { status: 'E22-M-2250', message: t.missingChatId };
					}

					try {
						const response = await this.axiosInstance.get(`/chats/${chatId}`, {
							headers: { Authorization: `Bearer ${token}` }
						});

						const chatData = response.data?.data;

						if (!chatData) {
							if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_chat_infoError, t.noChatData, 'error');
							return {
								status: 'E22-M-2251',
								message: t.noChatData,
							};
						}

						// Formatiertes Ergebnis zurückgeben 
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_chat_infoSuccess, t.ChatInfoRetrieved.replace('${chatData}', JSON.stringify(chatData)), 'info');

						return {
							data: {
								chatId: chatData.chatId,
								title: chatData.title || 'Unbenannter Chat',
								language: chatData.language || 'Unbekannt',
								groups: chatData.groups || [],
								messages: chatData.messages || []
							},
							message: response.data?.message || 'Erfolgreich abgerufen.'
						};
					} catch (error) {
						const fetchChatErrorMessage = error.message || error.response?.data;
						// Loggen des Fehlers beim Abrufen der Chat-Informationen
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_chat_infoError, t.fetchChatInfoError.replace('${error}', fetchChatErrorMessage), 'error');
						return {
							status: 'E22-M-2252',
							message: error.response?.data?.message || t.unknownError,
						};
					}
				}
                /* 2.3 Delete All Chats ##############################################################################*/
                case 'delete_all_chats': {
                    const disabledResponse = checkToolEnabled('delete_all_chats');
                    if (disabledResponse) return disabledResponse;

                    const token = message?.token;

                    if (!token) {
                        return { status: 'E23-M-2301', message: t.missingAuthToken };
                    }

                    const tokenValidation = validateToken(token);
                    if (tokenValidation) return tokenValidation;

                    try {
                        const response = await this.axiosInstance.delete('/chats/flush', {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json'
                            }
                        });

                        // Erfolg loggen
                        if (!isanonymousModeEnabled) {
                            logEvent('server', 'swmsg', l.prefix_delete_all_chatsSuccess, t.deleteChatsSuccess, 'info');
                        }

                        return {
                            data: {},
                            message: response.data?.message || 'success',
                            status: response.status || 200
                        };
                    } catch (error) {
                        const deleteChatsErrorMessage = error.message || error.response?.data;
                        
                        // Fehler loggen
                        if (!isanonymousModeEnabled) {
                            logEvent('server', 'swmsg', l.prefix_delete_all_chatsError, 
                                     t.deleteChatsError.replace('${error}', deleteChatsErrorMessage), 'error');
                        }

                        return {
                            status: error.response?.status || 'E23-M-2300',
                            message: error.response?.data?.message || 'Error deleting all chat history.'
                        };
                    }
                }
                /* 2.4 Delete Specific Chat ##############################################################################*/
                case 'delete_chat': {
                    const disabledResponse = checkToolEnabled('delete_chat');
                    if (disabledResponse) return disabledResponse;
                    
                    const { token } = message; // Token direkt aus `message` extrahieren
                    const tokenValidation = validateToken(token);
                    if (tokenValidation) return tokenValidation;
                    
					const args = message.arguments || {}; // Argumente aus `message` extrahieren
					const { chatId } = args; // chatId aus den Argumenten extrahieren

                    if (!chatId) {
                        return { status: 'E24-M-2400', message: t.missingChatId };
                    }

                    try {
                        const response = await this.axiosInstance.delete(`/chats/${chatId}`, {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json'
                            }
                        });

                        // Erfolg loggen
                        if (!isanonymousModeEnabled) {
                            logEvent('server', 'swmsg', l.prefix_delete_chatSuccess, t.chatDeleted.replace('${chatId}', chatId), 'info');
                        }

                        return {
                            data: {},
                            message: response.data?.message || 'success',
                            status: response.status || 200
                        };
                    } catch (error) {
                        const deleteChatErrorMessage = error.message || error.response?.data;
                        
                        // Fehler loggen
                        if (!isanonymousModeEnabled) {
                            logEvent('server', 'swmsg', l.prefix_delete_chatError, 
                                     t.deleteChatError.replace('${chatId}', chatId).replace('${error}', deleteChatErrorMessage), 'error');
                        }

                        return {
                            status: error.response?.status || 'E24-M-2401',
                            message: error.response?.data?.message || `Error deleting chat with ID ${chatId}.`
                        };
                    }
                }
				/* 3.0 Create Source ##############################################################################*/
				case 'create_source': {
					const disabledResponse = checkToolEnabled('create_source');
					if (disabledResponse) return disabledResponse;

					const args = getArguments(message);
					const token = message.token;

					// Validierung: Erforderliche Parameter prüfen
					if (!token) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_create_source, t.missingTokenError, 'error');
						return { status: 'E30-M-3050', message: t.missingTokenError };
					}
					if (!args || !args.name || !args.content) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_create_source, t.missingNameAndContent, 'error');
						return { status: 'E30-M-3051', message: t.missingParametersError.replace('${parameters}', 'name und content') };
					}

					const { name, content, groups } = args;

					try {
						// Gruppenvalidierung vorab durchführen
						if (groups && groups.length > 0) {
							const groupValidation = await this.validateGroups(groups, token, 'client', 'swmsg');
							if (!groupValidation.isValid) {
								if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_create_sourceInvalidGroups, t.InvalidGroups.replace('${GROUPS}', groupValidation.invalidGroups.join(', ')), 'error');
								return {
									status: 'E30-M-3052',
									message: t.invalidGroupsError.replace('${invalidGroups}', groupValidation.invalidGroups.join(', '))
								};
							}
						}

						// API-Aufruf zur Erstellung der Quelle
						const createSourceResponse = await this.axiosInstance.post(
							'/sources',
							{ name, content, groups },
							{ headers: { Authorization: `Bearer ${token}` } }
						);

						// Loggen der erfolgreichen Erstellung der Quelle
						if (!isanonymousModeEnabled) {
							logEvent(
								'client',
								'message',
								l.prefix_create_sourceSuccess,
								t.createSourceSuccess.replace('${data}', JSON.stringify(createSourceResponse.data)),
								'info'
							);
						}

						// Erfolgsantwort
						return {
							status: createSourceResponse.data?.status || 'ok',
							message: createSourceResponse.data?.message || 'Quelle erfolgreich erstellt.',
							data: createSourceResponse.data?.data,
						};
					} catch (error) {
						const createSourceError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Erstellung der Quelle
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_create_sourceError, t.createSourceError.replace('${error}', createSourceError), 'error');

						// Fehlerhafte Antwort
						if (error.response) {
							return {
								status: 'E30-M-3053',
								message: error.response?.data?.message || error.message || t.noErrorMessage,
								details: {
									status: error.response.status,
									headers: error.response.headers,
									data: error.response.data,
								},
							};
						} else if (error.request) {
							return {
								status: 'E30-M-3054',
								message: t.noServerResponse,
								details: { request: error.request },
							};
						} else {
							return {
								status: 'E30-M-3055',
								message: error.message || t.unknownError,
							};
						}
					}
				}
				/* 3.1 Get Source #################################################################################*/
				case 'get_source': {
					const disabledResponse = checkToolEnabled('get_source');
					if (disabledResponse) return disabledResponse;
					const { token, arguments: args } = message; // Extrahiere den Token und die Argumente
					const { sourceId } = args; // Extrahiere sourceId aus den Argumenten

					if (!sourceId) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_source, t.sourceIdRequiredRetrieveSource, 'error');
						return { status: 'E31-M-3150', message: t.sourceIdRequiredRetrieveSource };
					}

					// Loggen des Beginns der Quellenanfrage
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_source, t.makingGetSourceRequest.replace('${sourceId}', sourceId), 'info');

					try {
						const sourceResponse = await this.axiosInstance.get(`/sources/${sourceId}`, {
							headers: {
								Authorization: `Bearer ${token}`, // Nutze den vom Client bereitgestellten Token
							},
						});

						// Loggen der erhaltenen Quellenantwort
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_sourceSuccess, t.gotGetSourceResponse.replace('${data}', JSON.stringify(sourceResponse.data, null, 2)), 'info');

						return {
							content: sourceResponse.data,
						};
					} catch (error) {
						// Loggen des Fehlers bei der Quellenanfrage
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_get_sourceError, t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error.response?.data, null, 2)), 'error');
						return {
							status: 'E31-M-3151',
							message: t.apiErrorDetails
								.replace('${status}', error.response?.status || 'E31-M-3151')
								.replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)),
						};
					}
				}
				/* 3.2 List Sources ###############################################################################*/
				case 'list_sources': {
					const disabledResponse = checkToolEnabled('list_sources');
					if (disabledResponse) return disabledResponse;
					const { token, attributes } = message; // Extrahiere den Token und die Attribute

					if (!attributes || !attributes.groupName) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_sources, t.groupNameRequired, 'error');
						return { status: 'E32-M-3250', message: t.groupNameRequired };
					}

					const groupName = attributes.groupName; // Extrahiere den groupName aus attributes

					// Loggen des Beginns der Quellenliste-Anfrage
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_sources, t.fetchingSources.replace('${groupName}', groupName), 'info');

					try {
						// Führe die API-Anfrage aus, um die Quellen für die Gruppe zu erhalten
						const sourceResponse = await this.axiosInstance.post(
							'/sources/groups',
							{ groupName },
							{
								headers: {
									Authorization: `Bearer ${token}`, // Nutze den vom Client bereitgestellten Token
								},
							}
						);

						// Loggen der erhaltenen Quellenliste
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_sourcesSuccess, t.sourcesRetrieved.replace('${data}', JSON.stringify(sourceResponse.data, null, 2)), 'info');

						return {
							content: sourceResponse.data, // Sende die Antwort zurück
						};
					} catch (error) {
						// Loggen des Fehlers bei der Quellenliste-Anfrage
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_sourcesError, t.groupValidationError.replace('${error}', error.message || JSON.stringify(error.response?.data)), 'error');
						return {
							status: 'E32-M-3251',
							message: error.response?.data?.message || error.message || t.noErrorMessage,
						};
					}
				}
				/* 3.3 Edit Source ################################################################################*/
				case 'edit_source': {
					const disabledResponse = checkToolEnabled('edit_source');
					if (disabledResponse) return disabledResponse;

					const { token, arguments: args } = message;
					const { sourceId, title, content, groups } = args;

					// Validierung: Erforderliche Parameter
					if (!sourceId) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_source, t.sourceIdRequiredEditSource, 'error');
						return {
							status: 'E33-M-3350',
							message: t.missingParameterError.replace('${parameter}', 'sourceId'),
						};
					}

					// Loggen des Beginns der Quellenbearbeitung
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_source, t.editSourceLog.replace('${sourceId}', sourceId).replace('${title}', title || 'unverändert'), 'info');

					try {
						// Nur Felder senden, die tatsächlich aktualisiert werden sollen
						const payload = {};
						if (title) payload.title = title;
						if (content) payload.content = content;
						if (groups) payload.groups = groups;

						const editSourceResponse = await this.axiosInstance.patch(
							`/sources/${sourceId}`,
							payload,
							{
								headers: {
									Authorization: `Bearer ${token}` // Nutze den bereitgestellten Token
								},
							}
						);

						// Loggen der erfolgreichen Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_sourceSuccess, t.editSourceSuccess.replace('${data}', JSON.stringify(editSourceResponse.data, null, 2)), 'info');

						// Erfolgreiche Antwort
						return {
							status: editSourceResponse.data?.status || 'ok',
							message: editSourceResponse.data?.message || 'Quelle erfolgreich bearbeitet.',
							data: editSourceResponse.data?.data
						};
					} catch (error) {
						const editSourceError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_sourceError, t.editSourceError.replace('${error}', editSourceError), 'error');

						// Fehlerhafte Antwort
						return {
							data: {},
							message: error.response?.data?.message || 'Bearbeiten der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
							status: error.response?.status || 'E33-M-3351', // Internal Server Error
						};
					}
				}
				/* 3.4 Delete Source ##############################################################################*/
				case 'delete_source': {
					const disabledResponse = checkToolEnabled('delete_source');
					if (disabledResponse) return disabledResponse;
					const { token, arguments: args } = message;
					const { sourceId } = args;

					if (!sourceId) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_source, t.sourceIdRequiredDeleteSource, 'error');
						return { status: 'E34-M-3450', message: t.groupNameRequired.replace('${param}', 'sourceId') };
					}

					// Loggen des Beginns der Quellenlöschung
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_source, t.deletesourceLog.replace('${SourceName}', sourceId), 'info');

					try {
						const deleteResponse = await this.axiosInstance.delete(`/sources/${sourceId}`, {
							headers: { Authorization: `Bearer ${token}` },
						});

						// Loggen der erfolgreichen Quellenlöschung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_sourceSuccess, t.deleteUserSuccess.replace('${data}', JSON.stringify(deleteResponse.data, null, 2)), 'info');

						return {
							content: deleteResponse.data,
						};
					} catch (error) {
						const deleteSourceError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_sourceError, t.deleteSourceError.replace('${error}', deleteSourceError), 'error');

						return {
							data: {},
							message: error.response?.data?.message || 'Löschen der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
							status: error.response?.status || 'E34-M-3451', // Internal Server Error
						};
					}
				}				
				/* 4.0 List Groups ################################################################################*/
				case 'list_groups': {
					const disabledResponse = checkToolEnabled('list_groups');
					if (disabledResponse) return disabledResponse;

					const { token } = message; // Token direkt extrahieren

					try {
						await this.ensureAuthenticated(token);

						const response = await this.axiosInstance.get('/groups');
						let assignableGroups = response.data?.data?.assignableGroups || [];
						const personalGroups = response.data?.data?.personalGroups || [];
						const messageText = response.data?.message || 'no_message'; // Fallback für Nachricht
						const status = response.data?.status || 'E40-M-4050'; // Fallback für Status

						if (isRestrictedGroupsEnabled) {
							// Loggen der Einschränkung bei RESTRICTED_GROUPS
							if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_groupsWarning, t.restrictedGroupsWarning, 'warn');
							assignableGroups = ["NO ACCESS ALLOWED BY THE MCP-SERVER CONFIG"]; // Alle assignableGroups entfernen
						}

						// Loggen der erfolgreichen Gruppenliste
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_groupsSuccess, t.listGroupsSuccess.replace('${GROUPS}', JSON.stringify(response.data)), 'info');
						// )`Gruppenliste abgerufen: ${JSON.stringify(response.data)}`, 'info');

						return {
							data: {
								personalGroups,
								assignableGroups,
								message: messageText,
								status,
							},
						};
					} catch (error) {
						const fetchGroupsError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers beim Abrufen der Gruppen
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_list_groupsError, t.fetchGroupsError.replace('${error}', fetchGroupsError), 'error');

						// Detaillierte Fehlerbehandlung
						if (axios.isAxiosError(error)) {
							const status = error.response?.status;
							const serverMessage = error.response?.data?.message || error.message || 'no error message';
							return {
								status: 'E40-M-4051',
								message: `${t.fetchGroupsErrorPrefix}: ${serverMessage} (Status: ${status})`,
								// message: t.fetchGroupsErrorPrefix: ${serverMessage} (Status: ${status}),
							};
						}

						return {
							status: 'E40-M-4052',
							message: t.unknownErrorOccured,
						};
					}
				}
				/* 4.1 Store Group ################################################################################*/
				case 'store_group': {
					const disabledResponse = checkToolEnabled('store_group');
					if (disabledResponse) return disabledResponse;

					const { groupName, description } = message.arguments; // Extrahiere die Argumente
					const clientToken = message.token; // Token aus der Anfrage

					if (!groupName || !description) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_group, t.missingGroupNameAndDesc, 'error');
						return { 
						  status: 'E41-M-4150', 
						  message: t.missingGroupNameAndDesc 
						};
					}

					if (!clientToken) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_group, t.missingTokenError, 'error');
						return { status: 'E41-M-4151', message: t.missingTokenError };
					}

					try {
						// API-Aufruf mit dem vom Client bereitgestellten Token
						const createGroupResponse = await this.axiosInstance.post(
							'/groups',
							{ groupName, description },
							{
								headers: {
									Authorization: `Bearer ${clientToken}` // Nutze nur den Client-Token
								}
							}
						);

						// Loggen der erfolgreichen Gruppenerstellung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_groupSuccess, t.createGroupSuccess.replace('${data}', JSON.stringify(createGroupResponse.data)), 'info');

						return {
							content: createGroupResponse.data,
						};
					} catch (error) {
						const apiError = error.response?.data?.message || error.message || t.noErrorMessage;

						if (!isanonymousModeEnabled) {
							logEvent('client', 'swmsg', l.prefix_store_groupError, t.apiRequestError.replace('${error}', apiError), 'error');
						}

						return {
							status: 'E41-M-4152',
							message: error.response?.data?.message || error.message || t.noErrorMessage,
						};
					}
				}
				/* 4.2 Delete Group ###################################################################################*/
				case 'delete_group': {
					const disabledResponse = checkToolEnabled('delete_group');
					if (disabledResponse) return disabledResponse;

					const { token, arguments: args } = message; // Extrahiere Token und Argumente
					const { groupName } = args;

					if (!groupName) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_group, t.missingGroupNameParam, 'error');
						return { 
						  status: 'E42-M-4250', 
						  message: t.missingGroupNameParam 
						};
					}

					// Loggen des Beginns der Gruppenlöschung
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_group, t.deleteGroupLog.replace('${groupName}', groupName), 'info');

					try {
						// API-Aufruf mit dem Token des Clients
						const deleteGroupResponse = await this.axiosInstance.delete('/groups', {
							data: { groupName }, // JSON-Body für DELETE-Request
							headers: {
								Authorization: `Bearer ${token}` // Nutze den vom Client bereitgestellten Token
							},
						});

						// Loggen der erfolgreichen Gruppenlöschung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_groupSuccess, t.deleteGroupSuccessLog.replace('${data}', JSON.stringify(deleteGroupResponse.data)), 'info');

						return {
							data: deleteGroupResponse.data?.data || {},
							message: deleteGroupResponse.data?.message || 'success',
							status: deleteGroupResponse.status || 200,
						};
					} catch (error) {
						const deleteSourceError = error.response?.data || error.message;
						// Loggen des Fehlers bei der Gruppenlöschung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_groupError, t.deleteSourceError.replace('${error}', deleteSourceError), 'error');

						return {
							status: 'E42-M-4251',
							message: error.response?.data?.message || error.message || t.noErrorMessage,
						};
					}
				}
				/* 5.0 Store User #################################################################################*/
				case 'store_user': {
					const disabledResponse = checkToolEnabled('store_user');
					if (disabledResponse) return disabledResponse;
					const { token, arguments: args } = message;

					// Validierung der erforderlichen Parameter
					if (!args || !args.name || !args.email || !args.password) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_user, t.missingNameEmailPwd, 'error');
						return { status: 'E50-M-5050', message: t.missingNameEmailPwd };
					}

					const Pwd = args.password;

					// Überprüfe, ob das Passwort vorhanden ist
					if (!Pwd) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_user, t.passwordIsRequired, 'error');
						return {
							status: 'E10-M-1050',
							message: t.passwordIsRequired
						};
					}

					let password;

					// Passwort entschlüsseln, falls erforderlich
					if (typeof PwEncryption !== 'undefined' && PwEncryption) {
						password = decryptPassword(Pwd);
					} else {
						password = Pwd;
					}

					try {
						// Payload für die API-Anfrage
						const payload = {
							name: args.name,
							email: args.email,
							language: args.language || 'en',
							timezone: args.timezone || 'Europe/Berlin',
							password: password,
							usePublic: args.usePublic || false,
							groups: args.groups || [],
							roles: args.roles || [],
							activateFtp: args.activateFtp || false,
							ftpPassword: args.ftpPassword || '',
						};

						// Loggen des Payloads vor der API-Anfrage
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_user, t.createUserLog.replace('${payload}', JSON.stringify(payload)), 'info');

						// API-Aufruf
						const createUserResponse = await this.axiosInstance.post('/users', payload, {
							headers: {
								Authorization: `Bearer ${token}`
							}
						});

						// Loggen der erfolgreichen Benutzererstellung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_userSuccess, t.createUserSuccess.replace('${data}', JSON.stringify(createUserResponse.data)), 'info');

						return {
							content: createUserResponse.data,
						};
					} catch (error) {
						const createUserError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_store_userError, t.createUserError.replace('${error}', createUserError), 'error');
						// Fehlerhafte Antwort
						return {
							data: {},
							message: error.response?.data?.message || 'Fehler beim Anlegen des Benutzers.',
							status: error.response?.status || 'E50-M-5051', // Internal Server Error
						};
					}
				}
				/* 5.1 Edit User ##################################################################################*/
				case 'edit_user': {
					const disabledResponse = checkToolEnabled('edit_user');
					if (disabledResponse) return disabledResponse;

					const { token, arguments: args } = message;
					const tokenValidation = validateToken(token);
					if (tokenValidation) return tokenValidation;

					// Mindestens die E-Mail muss angegeben sein, um den User zu identifizieren
					if (!args || !args.email) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_user, t.emailRequiredForEdit, 'error');
						return {
							status: 'E51-M-5100',
							message: t.emailRequiredForEdit
						};
					}
					let password = null;

					if (args.password) {
						const Pwd = args.password;
						if (!Pwd) {
							if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_user, t.passwordIsRequired, 'error');
							return {
								status: 'E51-M-1050',
								message: t.passwordIsRequired,
							};
						}
						if (typeof PwEncryption !== 'undefined' && PwEncryption) {
							password = decryptPassword(Pwd);
						} else {
							password = Pwd;
						}
					}

					try {
						// Nur Felder senden, die tatsächlich aktualisiert werden sollen
						const payload = {};
						if (args.name) payload.name = args.name;
						if (args.password) payload.password = password;
						if (args.language) payload.language = args.language;
						if (args.timezone) payload.timezone = args.timezone;
						if (Array.isArray(args.roles)) payload.roles = args.roles;
						if (Array.isArray(args.groups)) payload.groups = args.groups;
						if (typeof args.usePublic === 'boolean') payload.usePublic = args.usePublic;

						// E-Mail ist Pflicht, um den Benutzer auf dem Server zu finden
						payload.email = args.email;
						const response = await this.axiosInstance.patch(
							'/users',
							payload,
							{
								headers: { Authorization: `Bearer ${token}` }
							}
						);

						// Loggen der erfolgreichen Benutzerbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_userSuccess, t.editUserSuccess.replace('${data}', JSON.stringify(response.data)), 'info');

						return {
							status: response.data?.status || 'ok',
							message: response.data?.message || 'Benutzer erfolgreich bearbeitet.',
							data: response.data?.data
						};
					} catch (error) {
						const editUserError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_edit_userError, t.editUserError.replace('${error}', editUserError), 'error');
						// Fehlerhafte Antwort
						return {
							data: {},
							message: error.response?.data?.message || t.editUserError.replace('${error}', editUserError),
							status: error.response?.status || 'E51-M-5151', // Internal Server Error
						};
					}
				}
				/* 5.2 Delete User ################################################################################*/
				case 'delete_user': {
					const disabledResponse = checkToolEnabled('delete_user');
					if (disabledResponse) return disabledResponse;
					const { token, arguments: args } = message;

					const { email } = args;

					if (!email) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_user, t.emailRequiredForDelete, 'error');
						return { status: 'E52-M-5250', message: t.emailRequiredForDelete };
					}

					// Loggen des Beginns der Benutzerlöschung
					if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_user, t.deleteUserLog.replace('${UserName}', email), 'info');

					try {
						const response = await this.axiosInstance.delete(
							'/users',
							{
								data: { email },
								headers: { Authorization: `Bearer ${token}` },
							}
						);

						// Loggen der erfolgreichen Benutzerlöschung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_userSuccess, t.deleteUserSuccess.replace('${data}', JSON.stringify(response.data, null, 2)), 'info');

						return {
							content: response.data,
						};
					} catch (error) {
						const deleteUserError = error.message || JSON.stringify(error.response?.data);
						// Loggen des Fehlers bei der Quellenbearbeitung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_delete_userError, t.deleteUserError.replace('${error}', deleteUserError), 'error');
						// Fehlerhafte Antwort
						return {
							data: {},
							message: error.response?.data?.message || 'Löschen des Users fehlgeschlagen. Bitte versuchen Sie es später erneut.',
							status: error.response?.status || 'E52-M-5251', // Internal Server Error
						};
					}
				}
                /* 5.3 Reactivate User ################################################################################*/
                case 'reactivate_user': {
                    const disabledResponse = checkToolEnabled('reactivate_user');
                    if (disabledResponse) return disabledResponse;
                    const { token, arguments: args } = message;

                    const { email } = args;

                    if (!email) {
                        if (!isanonymousModeEnabled) {
                            logEvent('client', 'swmsg', l.prefix_reactivate_user, t.emailRequiredForReactivate, 'error');
                        }
                        return { status: 'E53-M-5300', message: t.emailRequiredForReactivate };
                    }

                    // Loggen des Beginns der Benutzerreaktivierung
                    if (!isanonymousModeEnabled) {
                        logEvent('client', 'swmsg', l.prefix_reactivate_user, t.reactivateUserLog.replace('${UserName}', email), 'info');
                    }

                    try {
                        const response = await this.axiosInstance.post(
                            '/api/v1/users/reactivate',
                            { email },
                            {
                                headers: { 
                                    Authorization: `Bearer ${token}`,
                                    Accept: 'application/json'
                                }
                            }
                        );

                        // Loggen der erfolgreichen Benutzerreaktivierung
                        if (!isanonymousModeEnabled) {
                            logEvent('client', 'swmsg', l.prefix_reactivate_userSuccess, 
                                     t.reactivateUserSuccess.replace('${data}', JSON.stringify(response.data, null, 2)), 'info');
                        }

                        return {
                            content: response.data,
                        };
                    } catch (error) {
                        const reactivateUserError = error.message || JSON.stringify(error.response?.data);
                        // Loggen des Fehlers bei der Benutzerreaktivierung
                        if (!isanonymousModeEnabled) {
                            logEvent('client', 'swmsg', l.prefix_reactivate_userError, 
                                     t.reactivateUserError.replace('${error}', reactivateUserError), 'error');
                        }
                        // Fehlerhafte Antwort
                        return {
                            data: {},
                            message: error.response?.data?.message || 'Reaktivierung des Benutzers fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                            status: error.response?.status || 'E53-M-5301', // Internal Server Error
                        };
                    }
                }
				/* 6.0 Open AI compatible API Chat #######################################################################################*/
                case 'oai_comp_api_chat': {
                    const disabledResponse = checkToolEnabled('oai_comp_api');
                    if (disabledResponse) return disabledResponse;

                    const { token, arguments: args } = message;
                    if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chat, t.extractedToken.replace('${token}', token), 'info');

                    // Token prüfen und validieren
                    if (!token) {
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatError, t.noTokenError, 'error');
                        return { status: 'E60-M-6000', message: t.missingTokenError };
                    }

                    // Argument-Validierung
                    if (!args || !args.question) {
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatError, t.missingArgumentsError.replace('${args}', JSON.stringify(args)), 'error');
                        return {
                            status: 'error',
                            message: t.missingArgumentsError.replace('${args}', JSON.stringify(args)),
                        };
                    }

                    const { question, usePublic, groups, language } = args;

					// Konflikt zwischen `usePublic` und `groups` lösen
					if (usePublic && groups && groups.length > 0) {
						if (!isanonymousModeEnabled) logEvent('system', 'swmsg', l.prefix_chatWarning, t.publicGroupsConflictWarning, 'warn');
						args.usePublic = false;
					}

					try {
						// Loggen der Chat-Anfrage
						if (!isanonymousModeEnabled) logEvent('server', 'oamsg', l.prefix_chatRequest, t.sendingChatRequest
							.replace('${question}', question)
							.replace('${usePublic}', usePublic)
							.replace('${groups}', JSON.stringify(groups))
							.replace('${language}', language), 'info');

                        const response = await this.axiosInstance.post(
                            '/chats',
                            {
                                question,
                                usePublic: usePublic || false,
                                groups: Array.isArray(groups) ? groups : [groups],
                                language: language || 'de',
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );

                        const data = response.data?.data || {};
                        // Loggen der erfolgreichen Chat-Antwort
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatSuccess, t.chatResponseSuccess.replace('${data}', JSON.stringify(data)), 'info');

                        // Erfolgsantwort mit Status und Daten
                        return {
                            status: response.data?.status || 'ok',
                            message: response.data?.message || 'Chat erfolgreich.',
                            content: {
                                chatId: data.chatId,
                                answer: data.answer,
                                sources: data.sources || [],
                            },
                        };
                    } catch (error) {
                        const chatApiErrorMessage = error.message || error.response?.data;
                        // Loggen des Fehlers bei der Chat-API-Anfrage
                        if (!isanonymousModeEnabled) logEvent('server', 'swmsg', l.prefix_chatApiError, t.chatApiError.replace('${error}', chatApiErrorMessage), 'error');

                        // Fehlerantwort mit Status und Nachricht
                        return {
                            status: error.response?.status || 'E60-M-6002',
                            message: error.response?.data?.message || t.chatApiErrorDefault,
                        };
                    }
                }			
				/* 6.1 Open AI compatible API Continue Chat ##############################################################################*/
				case 'oai_comp_api_continue_chat': {
					const disabledResponse = checkToolEnabled('oai_comp_api');
					if (disabledResponse) return disabledResponse;

					const token = message.token; // Token direkt extrahieren
					const args = message.arguments || {}; // Sichere Extraktion der Argumente
					const { chatId, question } = args;

					if (!args || !args.chatId || !args.question) {
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_continue_chat, t.missingChatParams, 'error');
						return { status: 'E61-M-6150', message: t.missingChatParams };
					}

					try {
						const continueChatResponse = await this.axiosInstance.patch(
							`/chats/${chatId}`,
							{ question },
							{ headers: { Authorization: `Bearer ${token}` } }
						);

						// Loggen der erfolgreichen Continue-Chat-Antwort
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_continue_chatSuccess, t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)), 'info');

						return {
							content: {
								chatId: continueChatResponse.data.data.chatId,
								answer: continueChatResponse.data.data.answer,
								sources: continueChatResponse.data.sources || [],
								message: continueChatResponse.data.message,
								status: continueChatResponse.data.status,
							},
						};
					} catch (error) {
						// Loggen des Fehlers bei der Continue-Chat-API-Anfrage
						if (!isanonymousModeEnabled) logEvent('client', 'oamsg', l.prefix_apiRequestError, t.apiRequestError.replace('${error}', error.message), 'error');
						return {
							status: 'E61-M-6151',
							message: error.response?.data?.message || error.message || t.noErrorMessage,
						};
					}
				}
				/* 9.0 Generate Key ###############################################################################*/
				case 'keygen': {
					const disabledResponse = checkToolEnabled('keygen');
					if (disabledResponse) return disabledResponse;

					const { password } = message.arguments;

					try {
						// Passwort verschlüsseln
						const encryptedPassword = getEncryptedKey(password);

						// Loggen der erfolgreichen Key-Generierung
						if (!isanonymousModeEnabled) logEvent('client', 'swmsg', l.prefix_keygen, t.keygenSuccess, 'info');

						// Schlüssel zurückgeben
						return {
							data: {
								key: encryptedPassword
							},
							status: 'ok',
							message: t.KeygenRequired,
						};
					} catch (error) {
						// Loggen des Fehlers bei der Key-Generierung
						if (!isanonymousModeEnabled) logEvent(
							'client', 'message', l.prefix_keygenError,
							t.keygenErrorPrefix + ' ' + error.message,
							'error'
						);
						return {
							data: {},
							message: error.message || 'Keygen fehlgeschlagen.',
							status: 'E90-M-1150',
						};
					}
				}
				default: {
					// Loggen unbekannter Befehle
					if (!isanonymousModeEnabled) logEvent(
						'system', 'message', l.prefix_unknownCommand,
						t.unknownCommandError.replace('${cmd}', message.command),
						'warn'
					)
					return { status: 'E99-M-9950', message: t.unknownCommandError.replace('${cmd}', message.command) };
				}
            }
		} catch (err) {
			// Loggen des Fehlers im Haupt-Handler
			console.log('Error object:', err);
			console.log('Error message:', err?.message);
			if (!isanonymousModeEnabled) logEvent('system', 'message', l.prefix_tcpServerError, `${t.tcpServerError} ${err.message || JSON.stringify(err, null, 2)}`, 'error');
			return { status: 'E52-M-5252', message: err.message || t.internalServerError };
			}
		});
	}
}	
const server = new PrivateGPTServer();

// Log-Viewer Webserver konfigurieren
const app = express();
const httpServer = createHttpServer(app);
const io = new SocketIoServer(httpServer);


// const LOG_FILE_PATH = path.join(__dirname, '../logs/server.log'); // Pfad zu Ihrer Logdatei

// Statische Dateien bereitstellen (optional, falls eine HTML-Oberfläche benötigt wird)
app.use(express.static(path.join(__dirname, 'public')));
io.on('connection', (socket) => {
    if (isWrittenLogfileEnabled) {
        logEvent(
            'server',
            'websocket',
            l.prefix_clientConnected,
            messages[lang].clientConnected,
            'info'
        );
        sendLogContent(socket);
    } else {
        // Optional: Informieren Sie den Client, dass das Logfile nicht aktiviert ist
        socket.emit('logUpdate', messages[lang].socketEmitLogNotActivated);
    }

    socket.on('disconnect', () => {
        if (isWrittenLogfileEnabled) {
            logEvent(
                'server',
                'websocket',
                l.prefix_clientDisconnected,
                messages[lang].clientDisconnected,
                'info'
            );
        }
    });
});

// Funktion, um den Loginhalt an einen Client zu senden
const sendLogContent = async (socket) => {
    try {
        // Überprüfen, ob die Log-Datei existiert
        await fs.promises.access(LOG_FILE_PATH, fs.constants.F_OK);
        let data = await fs.promises.readFile(LOG_FILE_PATH, 'utf8');
        data = stripAnsi(data); // nutzt jetzt den Import
        socket.emit('logUpdate', data);
    } catch (err) {
        if (!isanonymousModeEnabled) logEvent(
            'server',
            'filesystem',
            l.prefix_logReadError,
            messages[lang].logReadError.replace('${error}', err.message),
            'error'
        );
        socket.emit('logUpdate', messages[lang].socketEmitLogReadError);
    }
};

// Überwachung der Logdatei auf Änderungen, nur wenn Schreiben aktiviert ist
if (isWrittenLogfileEnabled) {
    chokidar.watch(LOG_FILE_PATH).on('change', async () => {
        try {
            const data = await fs.promises.readFile(LOG_FILE_PATH, 'utf8');
            io.sockets.emit('logUpdate', data);
        } catch (err) {
            if (!isanonymousModeEnabled) logEvent(
                'server',
                'filesystem',
                l.prefix_logChangeError,
                messages[lang].logChangeError.replace('${error}', err.message),
                'error'
            );
        }
    });
}

// Überwachung der Logdatei auf Änderungen
/*chokidar.watch(LOG_FILE_PATH).on('change', async () => {
    try {
        const data = await fs.promises.readFile(LOG_FILE_PATH, 'utf8');
        io.sockets.emit('logUpdate', data);
    } catch (err) {
        if (!isanonymousModeEnabled) logEvent(
            'server',
            'filesystem',
            l.prefix_logChangeError,
            messages[lang].logChangeError.replace('${error}', err.message),
            'error'
        );
    }
});*/

// Log-Viewer HTTP-Server starten
const WEB_PORT = 3000;
httpServer.listen(WEB_PORT, () => {
    if (!isanonymousModeEnabled) logEvent(
        'server',
        'web',
        l.prefix_logViewerRunning,
        messages[lang].logViewerRunning.replace('${port}', WEB_PORT),
        'info'
    );
});

// Server läuft
server.run().catch(error => {
    if (!isanonymousModeEnabled) logEvent(
        'server',
        'N/A',
        l.prefix_serverError,
        messages[lang].serverError.replace('${error}', error.message),
        'error'
    );
});

// Anzeige des Start-Headers
displayStartHeader();