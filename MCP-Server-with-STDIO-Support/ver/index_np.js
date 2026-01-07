#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';
import net from 'net';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';


dotenv.config({ path: './pgpt.env' }); // Geben Sie explizit den Pfad zur Datei an

const templates = {
    success: '✔️ ${action}: ${details}',
    error: '❌ ${action} Fehler: ${details}',
    warning: '⚠️ ${action}: ${details}',
    configStart: '🚀 ${action}: ${details}', 
    info: '📤 ${action}...',
};

const messages = {
    de: {
        apiErrorDetails:            templates.error.replace('${action}', 'API-Fehler').replace('${details}', 'Status: ${status}, Daten: ${data}'),
        apiUrlInvalid:              templates.error.replace('${action}', 'Ungültige API_URL').replace('${details}', ''),
        apiUrlValidated:            templates.success.replace('${action}', 'API_URL erfolgreich validiert').replace('${details}', '${url}'),
        apiUrlWarning:              templates.warning.replace('${action}', 'Warnung').replace('${details}', 'API_URL beginnt nicht mit "https://". Die URL wird angepasst.'),
        apiUrlWarningV1:            templates.warning.replace('${action}', 'Warnung').replace('${details}', 'API_URL endet nicht mit "/api/v1". Die URL wird angepasst.'),
        availableGroups:            templates.success.replace('${action}', 'Verfügbare Gruppen').replace('${details}', '${data}'),
        errorHandlingRequest:       templates.error.replace('${action}', 'Fehler bei der Verarbeitung der Anfrage').replace('${details}', '${error}'),
        fetchingSources:            templates.info.replace('${action}', 'Abrufen von Quellen für Gruppe: ${groupName}'),
        groupFetchError:            templates.error.replace('${action}', 'Fehler beim Abrufen der Gruppen').replace('${details}', 'Bitte versuchen Sie es später erneut.'),
        groupNameRequired: 'Gruppenname erforderlich für diese Anfrage.',
        gotGetSourceResponse:       templates.success.replace('${action}', 'Antwort auf get_source erhalten').replace('${details}', '${data}'),
        gotListGroupsResponse:      templates.success.replace('${action}', 'Antwort auf list_groups erhalten').replace('${details}', '${response}'),
        gotListSourcesResponse:     templates.success.replace('${action}', 'Antwort auf list_sources erhalten').replace('${details}', '${data}'),
        handlingToolRequest:        templates.info.replace('${action}', 'Verarbeite Tool-Anfrage: ${name}'),
        headers: 'Header: ${headers}',
        incomingMessage: '📥 Eingehende Nachricht:',
        internalServerError: 'Interner Serverfehler',
        invalidGroups:              templates.error.replace('${action}', 'Ungültige Gruppen').replace('${details}', '${groups}'),
        loginResponse:              templates.success.replace('${action}', 'Login-Antwort').replace('${details}', ''),
        makingGetSourceRequest:     templates.info.replace('${action}', 'Erstellen einer get_source-Anfrage').replace('${details}', '${args}'),
        makingListGroupsRequest:    templates.info.replace('${action}', 'Erstellen einer list_groups-Anfrage'),
        makingListSourcesRequest:   templates.info.replace('${action}', 'Erstellen einer list_sources-Anfrage').replace('${details}', '${args}'),
        mcpError:                   templates.error.replace('${action}', '[MCP Fehler]').replace('${details}', '${error}'),
        method: 'Methode: ${method}',
        payload: 'Daten: ${payload}',
        portInUse:                  templates.error.replace('${action}', 'Port Fehler').replace('${details}', 'Port ${PORT} ist bereits in Verwendung.'),
        portInvalid:                templates.error.replace('${action}', 'Port Fehler').replace('${details}', 'PORT muss eine Zahl zwischen 1 und 65535 sein.'),
        portValidated:              templates.success.replace('${action}', 'PORT erfolgreich validiert').replace('${details}', '${port}'),
        requestError:               templates.error.replace('${action}', 'Anfragefehler').replace('${details}', '${error}'),
        requestSent:                templates.info.replace('${action}', 'Anfrage gesendet'),
        responseError:              templates.error.replace('${action}', 'Fehler bei der Antwort').replace('${details}', '${error}'),
        responseReceived:           templates.success.replace('${action}', 'Antwort erhalten').replace('${details}', '${response}'),
        serverError:                templates.error.replace('${action}', 'Server-Fehler').replace('${details}', '${error}'),
        sendingChatRequest:         templates.info.replace('${action}', 'Senden einer Chat-Anfrage an die API'),
        sourcesRetrieved:           templates.success.replace('${action}', 'Quellen erhalten').replace('${details}', '${data}'),
        tcpServerError:             templates.error.replace('${action}', 'TCP Server Fehler').replace('${details}', '${error}'),
        restrictedGroupsError:      templates.error.replace('${action}', 'Ungültige RESTRICTED_GROUPS-Konfiguration').replace('${details}', "muss 'true' oder 'false' sein. Aktueller Wert: ${value}"),
        restrictedGroupsSuccess:    templates.success.replace('${action}', 'RESTRICTED_GROUPS').replace('${details}', 'ist aktiviert: ${status}'),
        toolDisabledError: templates.error.replace('${action}', 'Tool deaktiviert').replace('${details}', 'Die Funktion "${toolName}" ist auf dem Server deaktiviert.'),
        sslValidationSet:           '${symbol} SSL-Validierung ist eingestellt auf: ${value}',
        startingServerWithConfig:   templates.configStart.replace('${action}', 'Starten des Servers').replace('${details}', 'mit folgender Konfiguration:\n${config}'),
        serverRunning: templates.info.replace('${action}', 'Server läuft').replace('${details}', 'auf Port ${port}'),
        connection: {
            new: '📥 Neue Verbindung akzeptiert von ${ip}:${port}',
            established: '🚀 Verbindung hergestellt',
            closed: '🔌 Verbindung geschlossen: ${ip}:${port}',
            dataReceived: '📥 Empfangene Daten von ${ip}:${port}: ${data}',
        },
        errors: {
            processMessage: '❌ Fehler bei der Verarbeitung der Nachricht: ${error}',
            invalidMessage: 'Ungültiges Nachrichtenformat',
            socketError: '❌ Socket-Fehler bei ${ip}:${port}: ${error}',
            serverError: '❌ Server-Fehler: ${error}',
        },
        server: {
            running: '📡 Server läuft auf Port ${port}',
            stopped: '🛑 Server wurde gestopped',
        },
        loginSuccess: '✔️ Login erfolgreich: ${data}',
        invalidArgumentsError: '❌ Fehler: Keine gültigen Argumente in der Eingabe gefunden: ${input}',
        missingArgumentsError: '❌ Fehlende Argumente: ${args}',
        noTokenError: '❌ Kein Token bereitgestellt.',
        publicGroupsConflictWarning: '⚠️ Konflikt: usePublic wurde auf false gesetzt, da Gruppen angegeben sind.',
        sendingChatRequest: '📤 Sende Chat-Anfrage: Frage: "${question}", Öffentlich: ${usePublic}, Gruppen: ${groups}, Sprache: ${language}',
        checkingGroups: '📤 Überprüfen der Gruppen: ${groups}',
        invalidGroupsError: '❌ Ungültige Gruppen gefunden: ${invalidGroups}',
        availableGroups: '✔️ Verfügbare Gruppen: ${availableGroups}',
        groupValidationError: '❌ Fehler bei der Gruppenvalidierung: ${error}',
         loginError: '❌ Fehler beim Login: ${error}',
        logoutSuccess: '✔️ Logout erfolgreich: ${data}',
        logoutError: '❌ Fehler beim Logout: ${error}',
        chatResponseSuccess: '✔️ Chat-Antwort erfolgreich erhalten: ${data}',
        chatApiError: '❌ Fehler bei der Chat-API-Anfrage: ${error}',
        conversationContinuation: '✔️ Fortsetzung der Konversation mit ID: ${chatId}',
        conversationSuccess: '✔️ Konversation erfolgreich fortgesetzt: ${data}',
        apiRequestError: '❌ Fehler bei der API-Anfrage: ${error}',
        noChatData: 'Keine Daten für den angegebenen Chat gefunden.',
        fetchChatInfoError: '❌ Fehler beim Abrufen der Chat-Informationen: ${error}',
        missingTokenError: 'Token fehlt. Bitte einloggen und erneut versuchen.',
        missingParametersError: 'Fehlende erforderliche Parameter: ${parameters}.',
        invalidGroupsError: 'Ungültige Gruppen: ${invalidGroups}',
        createSourceSuccess: '✔️ Quelle erfolgreich erstellt: ${data}',
        createSourceError: '❌ Fehler beim Erstellen der Quelle: ${error}',
        noServerResponse: 'Keine Antwort vom Server erhalten.',
        missingParameterError: 'Fehlender erforderlicher Parameter: ${parameter}.',
        editSourceSuccess: '✔️ Quelle erfolgreich bearbeitet: ${data}',
        editSourceError: '❌ Fehler beim Bearbeiten der Quelle: ${error}',
        deleteSourceError: '❌ Fehler beim Löschen der Quelle: ${error}',
        storeGroupLog: 'Speichere neue Gruppe mit Name: ${groupName} und Beschreibung: ${description}',
        storeGroupSuccess: 'Gruppe erfolgreich gespeichert: ${data}',
        storeGroupText: 'Gruppe "${groupName}" erfolgreich gespeichert mit ID: ${id}',
        deleteGroupLog: 'Lösche Gruppe mit Name: ${groupName}',
        deleteGroupSuccessLog: 'Gruppe erfolgreich gelöscht: ${data}',
        deleteGroupText: 'Gruppe "${groupName}" wurde erfolgreich gelöscht.',
        apiRequestError: 'Fehler bei der API-Anfrage: ${error}',
        createUserError: '❌ Fehler beim Erstellen des Benutzers: ${error}',
        editUserError: '❌ Fehler beim Bearbeiten des Benutzers: ${error}',
        deleteUserError: '❌ Fehler beim Löschen des Benutzers: ${error}',
        deleteUserSuccess: '✔️ Benutzer erfolgreich gelöscht: ${data}',
        editUserSuccess: '✔️ Benutzer erfolgreich bearbeitet: ${data}',
        createUserSuccess: '✔️ Benutzer erfolgreich erstellt: ${data}',
        createUserLog: '📤 Erstellen eines neuen Benutzers: ${payload}',
        createGroupSuccess: '✔️ Gruppe erfolgreich erstellt: ${data}',
        fetchGroupsError: '❌ Fehler beim Abrufen der Gruppen: ${error}',
        apiRequestError: '❌ Fehler bei der API-Anfrage: ${error}',
        restrictedGroupsWarning: '⚠️ RESTRICTED_GROUPS aktiviert. Verfügbare Gruppen werden eingeschränkt.',
        editSourceLog: 'Bearbeite Quelle mit ID: ${sourceId}, Titel: ${title}',
    },
    en: {
        editSourceLog: 'Editing source with ID: ${sourceId}, Title: ${title}',
        fetchGroupsError: '❌ Error fetching groups: ${error}',
        apiRequestError: '❌ Error during API request: ${error}',
        restrictedGroupsWarning: '⚠️ RESTRICTED_GROUPS enabled. Available groups are restricted.',
        deleteUserSuccess: '✔️ User successfully deleted: ${data}',
        editUserSuccess: '✔️ User successfully edited: ${data}',
        createUserSuccess: '✔️ User successfully created: ${data}',
        createUserLog: '📤 Creating a new user: ${payload}',
        createGroupSuccess: '✔️ Group successfully created: ${data}',
        deleteSourceError: '❌ Error deleting source: ${error}',
        storeGroupLog: 'Storing new group with name: ${groupName} and description: ${description}',
        storeGroupSuccess: 'Group stored successfully: ${data}',
        storeGroupText: 'Group "${groupName}" successfully stored with ID: ${id}',
        deleteGroupLog: 'Deleting group with name: ${groupName}',
        deleteGroupSuccessLog: 'Group successfully deleted: ${data}',
        deleteGroupText: 'Group "${groupName}" was successfully deleted.',
        apiRequestError: 'Error during API request: ${error}',
        createUserError: '❌ Error creating user: ${error}',
        editUserError: '❌ Error editing user: ${error}',
        deleteUserError: '❌ Error deleting user: ${error}',
        missingTokenError: 'Token is missing. Please log in and try again.',
        missingParametersError: 'Missing required parameters: ${parameters}.',
        invalidGroupsError: 'Invalid groups: ${invalidGroups}',
        createSourceSuccess: '✔️ Source successfully created: ${data}',
        createSourceError: '❌ Error creating the source: ${error}',
        noServerResponse: 'No response received from the server.',
        missingParameterError: 'Missing required parameter: ${parameter}.',
        editSourceSuccess: '✔️ Source successfully edited: ${data}',
        editSourceError: '❌ Error editing the source: ${error}',
        loginError: '❌ Error during login: ${error}',
        logoutSuccess: '✔️ Logout successful: ${data}',
        logoutError: '❌ Error during logout: ${error}',
        chatResponseSuccess: '✔️ Chat response successfully received: ${data}',
        chatApiError: '❌ Error during chat API request: ${error}',
        conversationContinuation: '✔️ Continuing conversation with ID: ${chatId}',
        conversationSuccess: '✔️ Conversation successfully continued: ${data}',
        apiRequestError: '❌ Error during API request: ${error}',
        noChatData: 'No data found for the specified chat.',
        fetchChatInfoError: '❌ Error fetching chat information: ${error}',
        checkingGroups: '📤 Checking groups: ${groups}',
        invalidGroupsError: '❌ Invalid groups found: ${invalidGroups}',
        availableGroups: '✔️ Available groups: ${availableGroups}',
        groupValidationError: '❌ Error during group validation: ${error}',
        missingArgumentsError: '❌ Missing arguments: ${args}',
        invalidArgumentsError: '❌ Error: No valid arguments found in the input: ${input}',
        loginSuccess: '✔️ Login successful: ${data}',
        sslValidationSet: '${symbol} SSL validation is set to: ${value}',
        serverRunning: templates.info.replace('${action}', 'Server is running').replace('${details}', 'on port ${port}'),
        toolDisabledError: templates.error.replace('${action}', 'Tool disabled').replace('${details}', 'The feature "${toolName}" is disabled on the server.'),
        restrictedGroupsError:      templates.error.replace('${action}', 'Invalid RESTRICTED_GROUPS configuration').replace('${details}', "must be 'true' or 'false'. Current value: ${value}"),
        restrictedGroupsSuccess:    templates.success.replace('${action}', 'RESTRICTED_GROUPS').replace('${details}', 'is enabled: ${status}'),
        apiErrorDetails:            templates.error.replace('${action}', 'API Error').replace('${details}', 'Status: ${status}, Data: ${data}'),
        apiUrlInvalid:              templates.error.replace('${action}', 'Invalid API_URL').replace('${details}', ''),
        apiUrlValidated:            templates.success.replace('${action}', 'API_URL successfully validated').replace('${details}', '${url}'),
        apiUrlWarning:              templates.warning.replace('${action}', 'Warning').replace('${details}', 'API_URL does not start with "https://". The URL will be adjusted.'),
        apiUrlWarningV1:            templates.warning.replace('${action}', 'Warning').replace('${details}', 'API_URL does not end with "/api/v1". The URL will be adjusted.'),
        availableGroups:            templates.success.replace('${action}', 'Available groups').replace('${details}', '${data}'),
        errorHandlingRequest:       templates.error.replace('${action}', 'Error handling request').replace('${details}', '${error}'),
        fetchingSources:            templates.info.replace('${action}', 'Fetching sources for group: ${groupName}'),
        groupFetchError:            templates.error.replace('${action}', 'Error fetching groups').replace('${details}', 'Please try again later.'),
        groupNameRequired: 'Group name is required for this request.',
        gotGetSourceResponse:       templates.success.replace('${action}', 'Got get_source response').replace('${details}', '${data}'),
        gotListGroupsResponse:      templates.success.replace('${action}', 'Got list_groups response').replace('${details}', '${response}'),
        gotListSourcesResponse:     templates.success.replace('${action}', 'Got list_sources response').replace('${details}', '${data}'),
        handlingToolRequest:        templates.info.replace('${action}', 'Handling tool request: ${name}'),
        headers: 'Headers: ${headers}',
        incomingMessage: '📥 Incoming message:',
        internalServerError: 'Internal server error',
        invalidGroups:              templates.error.replace('${action}', 'Invalid groups').replace('${details}', '${groups}'),
        loginResponse:              templates.success.replace('${action}', 'Login response').replace('${details}', ''),
        makingGetSourceRequest:     templates.info.replace('${action}', 'Making get_source request').replace('${details}', '${args}'),
        makingListGroupsRequest:    templates.info.replace('${action}', 'Making list_groups request'),
        makingListSourcesRequest:   templates.info.replace('${action}', 'Making list_sources request').replace('${details}', '${args}'),
        mcpError:                   templates.error.replace('${action}', '[MCP Error]').replace('${details}', '${error}'),
        method: 'Method: ${method}',
        payload: 'Payload: ${payload}',
        portInUse:                  templates.error.replace('${action}', 'Port Error').replace('${details}', 'Port ${PORT} is already in use.'),
        portInvalid:                templates.error.replace('${action}', 'Port Error').replace('${details}', 'PORT must be a number between 1 and 65535.'),
        portValidated:              templates.success.replace('${action}', 'PORT successfully validated').replace('${details}', '${port}'),
        requestError:               templates.error.replace('${action}', 'Request Error').replace('${details}', '${error}'),
        requestSent:                templates.info.replace('${action}', 'Request sent'),
        responseError:              templates.error.replace('${action}', 'Response error').replace('${details}', '${error}'),
        responseReceived:           templates.success.replace('${action}', 'Response received').replace('${details}', '${response}'),
        serverError:                templates.error.replace('${action}', 'Server Error').replace('${details}', '${error}'),
        sendingChatRequest:         templates.info.replace('${action}', 'Sending a chat request to the API'),
        sourcesRetrieved:           templates.success.replace('${action}', 'Sources retrieved').replace('${details}', '${data}'),
        startingServerWithConfig:   templates.warning.replace('${action}', 'Starting the server').replace('${details}', 'with the following configuration:'),
        tcpServerError:             templates.error.replace('${action}', 'TCP Server Error').replace('${details}', '${error}'),
        connection: {
            new: '📥 New connection accepted from ${ip}:${port}',
            established: '🚀 Connection established',
            closed: '🔌 Connection closed: ${ip}:${port}',
            dataReceived: '📥 Received data from ${ip}:${port}: ${data}',
        },
        errors: {
            processMessage: '❌ Error while processing the message: ${error}',
            invalidMessage: 'Invalid message format',
            socketError: '❌ Socket error for ${ip}:${port}: ${error}',
            serverError: '❌ Server error: ${error}',
        },
        server: {
            running: '📡 Server runs on port ${port}',
            stopped: '🛑 Server stopped',
        },
    }
};

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
    console.error(`❌ Error loading pgpt.env.json: ${error.message}`);
    process.exit(1);
}

// Helper-Funktionen
function getEnvVar(key, nestedPath = null, fallback = null) {
    // Prüfen, ob ein verschachtelter Pfad angegeben ist
    if (nestedPath) {
        const value = nestedPath.reduce((acc, part) => acc && acc[part], envConfig);
        if (!value) {
            if (fallback !== null) return fallback;
            console.error(`❌ Missing .json configuration variable: ${key}`);
            process.exit(1);
        }
        return value;
    }
    // Direkter Zugriff
    if (!envConfig[key]) {
        if (fallback !== null) return fallback;
        console.error(`❌ Missing .json configuration variable: ${key}`);
        process.exit(1);
    }
    return envConfig[key];
}

const privateApiUrl = getEnvVar('PRIVATE_GPT_API_URL', ['PGPT_Url', 'PRIVATE_GPT_API_URL']);
const requestedLang = getEnvVar('LANGUAGE', ['Server_Config', 'LANGUAGE'], 'en').toLowerCase();
const apiUrl = getEnvVar('API_URL', ['PGPT_Url', 'API_URL']);
const Port = getEnvVar('PORT', ['Server_Config', 'PORT'], '5000');
const restrictedGroups = getEnvVar('RESTRICTED_GROUPS', ['Restrictions', 'RESTRICTED_GROUPS'], 'false').toString();
const sslValidate = getEnvVar('SSL_VALIDATE', ['Server_Config', 'SSL_VALIDATE'], 'false').toString();
const PwEncryption = getEnvVar('PW_ENCRYPTION', ['Server_Config', 'PW_ENCRYPTION'], 'false') === 'true';
const AllowKeygen = getEnvVar('ALLOW_KEYGEN', ['Server_Config', 'ALLOW_KEYGEN'], 'false') === 'true';
const publicKeyPath = getEnvVar('PUBLIC_KEY', ['Server_Config', 'PUBLIC_KEY']);
const privateKeyPath = getEnvVar('PRIVATE_KEY', ['Server_Config', 'PRIVATE_KEY']);


// Load the public key
const publicKey = fs.readFileSync(getEnvVar('PUBLIC_KEY', ['Server_Config', 'PUBLIC_KEY']), 'utf8');

// Load the private key
const privateKey = fs.readFileSync(getEnvVar('PRIVATE_KEY', ['Server_Config', 'PRIVATE_KEY']), 'utf8');


if (PwEncryption) {
    console.log('Password encryption is enabled.');
} else {
    console.log('Password encryption is disabled.');
}

function validateUrl(url, t) {
    if (!url.startsWith('https://')) {
        console.warn(t.apiUrlWarning);
        url = url.replace(/^http:\/\//, 'https://');
    }
    url = url.replace(/([^:]\/)\/+/g, '$1'); // Doppelte Schrägstriche nach "://" entfernen
    if (!url.endsWith('/api/v1')) {
        console.warn(t.apiUrlWarningV1);
        url = `${url.replace(/\/$/, '')}/api/v1`;
    }
    try {
        new URL(url);
    } catch {
        console.error(t.apiUrlInvalid, url);
        process.exit(1);
    }
    return url;
}

function validatePort(port, t) {
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
        console.error(t.portInvalid);
        process.exit(1);
    }
    return portNumber;
}

function validateBoolean(varName, value, t) {
    if (value !== 'true' && value !== 'false') {
        console.error(
            t.restrictedGroupsError.replace('${value}', value)
        );
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
        console.error('Decryption error:', error.message);
        throw new Error('Failed to decrypt the password.');
    }
}


// Function for encryption
function encryptWithPublicKey(data) {
    return crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PADDING, // Explicitly set padding
        },
        Buffer.from(data)
    ).toString('base64');
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
        console.error('Encryption error:', err.message);
        throw new Error('Failed to encrypt the password.');
    }
}

const enableLogin = getEnvVar('ENABLE_LOGIN', ['Functions', 'ENABLE_LOGIN'], false);
const enableLogout = getEnvVar('ENABLE_LOGOUT', ['Functions', 'ENABLE_LOGOUT'], false);
const enableChat = getEnvVar('ENABLE_CHAT', ['Functions', 'ENABLE_CHAT'], false);
const enableContinueChat = getEnvVar('ENABLE_CONTINUE_CHAT', ['Functions', 'ENABLE_CONTINUE_CHAT'], false);
const enableGetChatInfo = getEnvVar('ENABLE_GET_CHAT_INFO', ['Functions', 'ENABLE_GET_CHAT_INFO'], false);
const enableListGroups = getEnvVar('ENABLE_LIST_GROUPS', ['Functions', 'ENABLE_LIST_GROUPS'], false);
const enableStoreGroup = getEnvVar('ENABLE_STORE_GROUP', ['Functions', 'ENABLE_STORE_GROUP'], false);
const enableDeleteGroup = getEnvVar('ENABLE_DELETE_GROUP', ['Functions', 'ENABLE_DELETE_GROUP'], false);
const enableCreateSource = getEnvVar('ENABLE_CREATE_SOURCE', ['Functions', 'ENABLE_CREATE_SOURCE'], false);
const enableEditSource = getEnvVar('ENABLE_EDIT_SOURCE', ['Functions', 'ENABLE_EDIT_SOURCE'], false);
const enableDeleteSource = getEnvVar('ENABLE_DELETE_SOURCE', ['Functions', 'ENABLE_DELETE_SOURCE'], false);
const enableGetSource = getEnvVar('ENABLE_GET_SOURCE', ['Functions', 'ENABLE_GET_SOURCE'], false);
const enableListSources = getEnvVar('ENABLE_LIST_SOURCES', ['Functions', 'ENABLE_LIST_SOURCES'], false);
const enableStoreUser = getEnvVar('ENABLE_STORE_USER', ['Functions', 'ENABLE_STORE_USER'], false);
const enableEditUser = getEnvVar('ENABLE_EDIT_USER', ['Functions', 'ENABLE_EDIT_USER'], false);
const enableDeleteUser = getEnvVar('ENABLE_DELETE_USER', ['Functions', 'ENABLE_DELETE_USER'], false);

console.log('🌐 Server Config:', JSON.stringify(envConfig, null, 2));

console.log('✅ Private API URL:', privateApiUrl);
console.log('✅ Public API URL:', apiUrl);
console.log('✅ Port:', Port);
console.log('✅ Language:', requestedLang);
console.log('✅ SSL-validation:', sslValidate);
console.log('✅ PW_Encryption:', PwEncryption);
console.log('✅ Allow_Keygen:', AllowKeygen);
console.log('✅ Private_Key:', privateKeyPath);
console.log('✅ Public_Key:', publicKeyPath);
console.log('✅ Restricted Groups:', restrictedGroups);


// Alle Funktionen mit ihren Enable-Flags in einem Array organisieren
const allFunctions = [
  { name: 'Login', enabled: enableLogin },
  { name: 'Logout', enabled: enableLogout },
  { name: 'Chat', enabled: enableChat },
  { name: 'Continue Chat', enabled: enableContinueChat },
  { name: 'Get Chat Info', enabled: enableGetChatInfo },
  { name: 'List Groups', enabled: enableListGroups },
  { name: 'Store Group', enabled: enableStoreGroup },
  { name: 'Delete Group', enabled: enableDeleteGroup },
  { name: 'Create Source', enabled: enableCreateSource },
  { name: 'Edit Source', enabled: enableEditSource },
  { name: 'Delete Source', enabled: enableDeleteSource },
  { name: 'Get Source', enabled: enableGetSource },
  { name: 'List Sources', enabled: enableListSources },
  { name: 'Store User', enabled: enableStoreUser },
  { name: 'Edit User', enabled: enableEditUser },
  { name: 'Delete User', enabled: enableDeleteUser }
];

// Filtern, um nur deaktivierte (false) zu bekommen
const disabledFunctions = allFunctions.filter(f => !f.enabled);

// Wenn gar keine Funktionen deaktiviert sind, kurze Info ausgeben
if (disabledFunctions.length === 0) {
  console.log('✅ All functions are enabled.');
} else {
  console.log('⚠️ Deactivated functions:');
  disabledFunctions.forEach(func => {
    console.log(`  ➡️ ${func.name}: false`);
  });
}

// Nachrichten basierend auf Sprache
let lang = getEnvVar('LANGUAGE', ['Server_Config', 'LANGUAGE'], 'en').toLowerCase();
if (!(lang in messages)) {
    console.warn(`⚠️ Language "${lang}" is not supported. Fallback in English.`);
    lang = 'en';
}

const t = messages[lang];
console.log(t.apiUrlValidated.replace('${url}', apiUrl));

// Port validieren
console.log(t.portValidated.replace('${port}', Port));

// Debugging für RESTRICTED_GROUPS
console.log('🛠️ Access to RESTRICTED_GROUPS:', envConfig.Restrictions?.RESTRICTED_GROUPS);

// Zugriff und Validierung von RESTRICTED_GROUPS
const isRestrictedGroupsEnabled = validateBoolean(
    'RESTRICTED_GROUPS',
    restrictedGroups,
    t
);

console.log(
    t.restrictedGroupsSuccess.replace('${status}', isRestrictedGroupsEnabled)
);


// SSL-Validierung
const isSSLValidationEnabled = validateBoolean(
    'SSL_VALIDATE',
    getEnvVar('SSL_VALIDATE', ['Server_Config', 'SSL_VALIDATE'], 'false').toString(),
    t
);

const sslSymbol = isSSLValidationEnabled ? '✔️' : '⚠️';
console.log(
  t.sslValidationSet
    .replace('${symbol}', sslSymbol)
    .replace('${value}', String(isSSLValidationEnabled))
);
// console.log('sslValidationSet String ist:', t.sslValidationSet);

const validatedPort = validatePort(Port, t);
console.log(t.portValidated.replace('${port}', validatedPort));


// Beispiel: Tool-Überprüfung
function isToolEnabled(toolName) {
    const envKey = `ENABLE_${toolName.toUpperCase()}`;
    if (!(envKey in envConfig.Functions)) {
        console.warn(`⚠️ Tool "${toolName}" is not defined in the configuration. Default: deactivated.`);
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
        
    if (!isToolEnabled(toolName)) {
        return {
            status: 'error',
            message: messages[lang].toolDisabledError.replace('${toolName}', toolName),
        };
    }
    return null; // Tool ist aktiviert
}

function validateToken(token) {
    if (!token) {
        return {
            status: 'error',
            message: 'Token fehlt. Bitte einloggen und erneut versuchen.',
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
        console.error(t.invalidArgumentsError.replace('${input}', JSON.stringify(input)));
        return {}; // Leeres Objekt als Fallback
    }
}

// Parameter zuordnen
const API_URL = apiUrl;
const PORT = Port;

// Server-Startkonfiguration ausgeben
const serverConfig = JSON.stringify({ API_URL, PORT }, null, 2);
console.log(
    messages[lang].startingServerWithConfig
        .replace('${config}', serverConfig)
);

//const net = require('net');

class TcpServerTransport {
    constructor(port) {
        this.port = port;
        this.server = null;
        this.clients = new Map(); // Map zur Speicherung der Clients
    }

    async start(onMessage) {
        return new Promise((resolve, reject) => {
            // Server erstellen
            this.server = net.createServer((socket) => {
                const clientIP = socket.remoteAddress || 'unbekannt';
                const clientPort = socket.remotePort || 'unbekannt';

                // Client-Informationen in der Map speichern
                this.clients.set(socket, { ip: clientIP, port: clientPort });
                
                console.log(t.connection.new.replace('${ip}', clientIP).replace('${port}', clientPort));

                // Ereignis: Daten empfangen
                socket.on('data', async (data) => {
                    const client = this.clients.get(socket);
                    console.log(t.connection.dataReceived
                        .replace('${ip}', client.ip)
                        .replace('${port}', client.port)
                        .replace('${data}', data.toString()));
                    try {
                        const message = JSON.parse(data.toString());
                        const response = await onMessage(message);
                        socket.write(JSON.stringify(response));
                    } catch (err) {
                        console.error(t.errors.processMessage.replace('${error}', err.message || err));
                        socket.write(JSON.stringify({ error: t.errors.invalidMessage }));
                    }
                });

                // Ereignis: Verbindung geschlossen
                socket.on('close', () => {
                    const client = this.clients.get(socket);
                    console.log(t.connection.closed.replace('${ip}', client.ip).replace('${port}', client.port));
                    this.clients.delete(socket); // Client aus der Map entfernen
                });

                // Fehlerbehandlung für einzelne Sockets
                socket.on('error', (err) => {
                    const client = this.clients.get(socket);
                    console.error(t.errors.socketError
                        .replace('${ip}', client?.ip || 'unknown')
                        .replace('${port}', client?.port || 'unknown')
                        .replace('${error}', err.message || err));
                });

                // Server-Ereignis: Verbindung hergestellt
                this.server.on('connection', (socket) => {
                    console.log(t.connection.established);
                    socket.setKeepAlive(true, 30000); // Keep-Alive für jede Verbindung setzen
                });
            });

            // Server starten
            this.server.listen(this.port, () => {
                console.log(t.server.running.replace('${port}', this.port));
                resolve();
            });

            // Server-Ereignis: Fehler
            this.server.on('error', (err) => {
                console.error(t.errors.serverError.replace('${error}', err.message || err));
                reject(err);
            });
        });
    }

    async stop() {
        if (this.server) {
            this.server.close(() => {
                console.error(t.server.stopped);
                this.clients.clear(); // Alle Clients aus der Map entfernen
            });
        }
    }
}

class PrivateGPTServer {
    server;
    axiosInstance;
    authToken = null; // Initialisierung des Authentifizierungs-Tokens
    authTokenTimestamp = 0; // Initialisierung des Zeitstempels für Token-Gültigkeit

    constructor() {
        this.server = new Server({
            name: 'pgpt-mcp-server',
            version: '2.1.0',
        }, {
            capabilities: {
                resources: {},
                tools: {},
            },
        });

        // Create axios instance with SSL disabled for development
        this.axiosInstance = axios.create({
            baseURL: API_URL,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: isSSLValidationEnabled // Dynamisch durch SSL_VALIDATE gesteuert
            })
        });
        
    // console.log(t.sslValidationSet.replace('${value}', sslValidate));
        // Interceptors for logging requests and responses
        this.axiosInstance.interceptors.request.use((config) => {
            console.log(t.requestSent);
            console.log('URL:', config.baseURL + config.url);
            console.log('Method:', config.method.toUpperCase());
            console.log('Headers:', config.headers);
            if (config.data) {
                console.log('Payload:', config.data);
            }
            return config;
        },  (error) => {
                  console.error(t.requestError.replace('${error}', error.message || error));
            return Promise.reject(error);
        });
    
       this.axiosInstance.interceptors.response.use((response) => {
            console.log(t.responseReceived);
            console.log('Status:', response.status);
            console.log('Data:', response.data);
            return response;
        }, (error) => {
            console.error(t.responseError, error.response ? error.response.data : error.message);
            return Promise.reject(error);
        });

        this.setupResourceHandlers();
        this.setupToolHandlers();

        // Error handling
        this.server.onerror = (error) => {
            console.error(t.mcpError.replace('${error}', error.message || JSON.stringify(error, null, 2)));
        };

        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
        // Neue Login-Funktion
        async login(email, password) {
            console.error(`Authenticating user: ${email}`);
            try {
                const loginResponse = await this.axiosInstance.post('/login', {
                    email,
                    password
                });

                console.error('Login response:', loginResponse.data);

                // Rückgabe des Tokens
                return loginResponse.data.data.token;
            } catch (error) {
                console.error('Login error:', error.message || error);
                throw new Error('Authentication failed');
            }
        }

        // ensureAuthenticated nutzt die neue login-Funktion
        async ensureAuthenticated(token) {
            if (!token) {
                console.error('Fehlendes Token. Bitte zuerst einloggen.');
                throw new Error('Fehlendes Token.');
            }

            console.log('Setting token for authentication...');
            // Setze das Token als Authorization-Header
            this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            console.log('Token erfolgreich gesetzt.');
        }

        isTokenExpired() {
            // Beispielprüfung: Token sollte innerhalb einer Stunde erneuert werden
            const EXPIRATION_THRESHOLD = 3600 * 1000; // 1 Stunde
            const now = Date.now();
            const tokenAge = now - this.authTokenTimestamp;
            return tokenAge >= EXPIRATION_THRESHOLD;
        }
        async validateGroups(groups, token) {
            try {
                console.log(t.checkingGroups.replace('${groups}', JSON.stringify(groups)));

                // Sicherstellen, dass der Token gesetzt ist
                if (!token) {
                    throw new Error('Token fehlt. Kann Gruppen nicht validieren.');
                }

                // Temporär den Header setzen, falls global nicht vorhanden
                const response = await this.axiosInstance.get('/groups', {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const availableGroups = response.data?.data?.assignableGroups || [];
                console.log(t.availableGroups.replace('${availableGroups}', JSON.stringify(availableGroups)));

                // Überprüfen, ob die übergebenen Gruppen gültig sind
                const invalidGroups = groups.filter(group => !availableGroups.includes(group));
                if (invalidGroups.length > 0) {
                    console.error(t.invalidGroupsError.replace('${invalidGroups}', JSON.stringify(invalidGroups)));
                    return { isValid: false, invalidGroups };
                }

                return { isValid: true };
            } catch (error) {
                const errorMessage = error.response?.data || error.message;
                console.error(t.groupValidationError.replace('${error}', errorMessage));
                throw new Error(error.response?.data?.message || 'Fehler beim Abrufen der Gruppen.');
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
                throw new McpError(ErrorCode.InvalidRequest, 'Missing URI parameter');
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
            }
        ],
    }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (!request.params?.name) {
                throw new McpError(ErrorCode.InvalidRequest, 'Missing tool name');
            }
            try {
                //await this.ensureAuthenticated();
                console.error(t.handlingToolRequest.replace('${name}', request.params.name), request.params);
                switch (request.params.name) {
                /*  1.0 Login ######################################################################################*/
                    case 'login': { 
                        const disabledResponse = checkToolEnabled('login');
                        if (disabledResponse) return disabledResponse;
                        
                        const { email, password } = request.params.arguments; // Extrahiere email und password aus der Nachricht

                        if (!email || !password) {
                            return {
                                status: 'E10-R-1000',
                                message: 'Login fehlgeschlagen: E-Mail und Passwort sind erforderlich.',
                            };
                        }

                        try {
                            // Aufruf des Login-Endpunkts der API
                            const loginResponse = await this.axiosInstance.post('/login', { email, password });

                            console.log(t.loginSuccess.replace('${data}', JSON.stringify(loginResponse.data)));
;

                            // Token zurückgeben
                            return {
                                status: loginResponse.data?.status || 'ok', // Dynamisch, falls der API-Status einheitlich ist
                                message: loginResponse.data?.message || 'Login erfolgreich.', // API-Nachricht verwenden oder Standardnachricht
                                token: loginResponse.data?.data?.token, // Token aus API-Antwort
                            };
                        } catch (error) {
                            const errorMessage = error.response?.data || error.message;
                            console.error(t.loginError.replace('${error}', errorMessage));

                            return {
                                status: error.response?.status || 'E10-R-1001', // API-Fehlerstatus oder Standardfehlerstatus,
                                message: error.response?.data?.message || 'Login fehlgeschlagen.',
                            };
                        }
                    }
                /*  1.1 Logout #####################################################################################*/
                    case 'logout': {
                        const disabledResponse = checkToolEnabled('logout');
                        if (disabledResponse) return disabledResponse;

                        const { token } = message;
                        //const { token, arguments: args } = request.params;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;


                        try {
                            const logoutResponse = await this.axiosInstance.delete('/logout', {
                                headers: {
                                    Authorization: `Bearer ${token}`
                                }
                            });

                            console.log(t.logoutSuccess.replace('${data}', JSON.stringify(logoutResponse.data)));


                             return {
                                data: {}, // Optional: Zusätzliche Daten könnten hier eingefügt werden
                                message: 'success',
                                status: 200, // OK
                            };
                        } catch (error) {
                            const logoutErrorMessage = error.response?.data || error.message;
                            console.error(t.logoutError.replace('${error}', logoutErrorMessage));
                            return {
                                data: {},
                                message: error.response?.data?.message || 'Logout fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                                status: error.response?.status || 'E11-R-1100', // Internal Server Error oder spezifischer Statuscode
                            };
                        }
                    }
                /*  2.0 Chat #######################################################################################*/
                    case 'chat': {
                        const disabledResponse = checkToolEnabled('chat');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        console.log('Extrahierter Token:', token);


                        // Token prüfen und validieren
                        if (!token) {
                            console.error(t.noTokenError);
                            return { status: 'E20-R-2000', message: t.missingTokenError };
                        }

                        /*const tokenValidation = validateToken(token);
                        if (tokenValidation) {
                            console.error('❌ Token-Validierung fehlgeschlagen. Token:', token, 'Fehler:', tokenValidation);
                            return {
                                status: 'error',
                                message: 'Token ist ungültig oder abgelaufen. Bitte erneut einloggen.',
                            };
                        }*/

                        // Argument-Validierung
                        if (!args || !args.question) {
                            console.error(t.missingArgumentsError.replace('${args}', JSON.stringify(args)));
                            return {
                                status: 'error',
                                message: t.missingArgumentsError.replace('${args}', JSON.stringify(args)),
                            };
                        }

                        const { question, usePublic, groups, language } = args;

                        // Konflikt zwischen `usePublic` und `groups` lösen
                        if (usePublic && groups && groups.length > 0) {
                            console.warn(t.publicGroupsConflictWarning);
                            args.usePublic = false;
                        }

                        try {
                            console.log(t.sendingChatRequest
                                .replace('${question}', question)
                                .replace('${usePublic}', usePublic)
                                .replace('${groups}', JSON.stringify(groups))
                                .replace('${language}', language)
                            );

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
                            console.log(t.chatResponseSuccess.replace('${data}', JSON.stringify(data)));

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
                            console.error(t.chatApiError.replace('${error}', chatApiErrorMessage));

                            // Fehlerantwort mit Status und Nachricht
                            return {
                                status: error.response?.status || 'E20-R-2002',
                                message: error.response?.data?.message || 'Fehler bei der Chat-Anfrage.',
                            };
                        }
                    }
                /*  2.1 Continue Chat ##############################################################################*/
                    case 'continue_chat': {
                        const disabledResponse = checkToolEnabled('continue_chat');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;

                        if (!args || !args.chatId || !args.question) {
                            return { status: 'E21-R-2100', message: 'Fehlende erforderliche Parameter: chatId und/oder question.' };
                        }

                        const { chatId, question } = args;
                        console.log(t.conversationContinuation.replace('${chatId}', chatId));

                        try {
                            const continueChatResponse = await this.axiosInstance.patch(`/chats/${chatId}`, {
                                question: question,
                            });
                            console.log(t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)));
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
                            console.error(t.apiRequestError.replace('${error}', error.message));
                            return {
                                status: error.response?.status || 'E21-R-2101',
                                message: error.response?.data?.message || 'Fehler beim Fortsetzen der Konversation.',
                            };
                        }
                    }
                /*  2.2 Get Chat Info ##############################################################################*/
                    case 'get_chat_info': {
                        const disabledResponse = checkToolEnabled('get_chat_info');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;

                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { chatId } = args;

                        if (!chatId) {
                            return { status: 'E22-R-2200', message: 'chatId ist erforderlich, um Chat-Informationen abzurufen.' };
                        }

                        try {
                            const response = await this.axiosInstance.get(`/chats/${chatId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });

                            const chatData = response.data?.data;

                            if (!chatData) {
                                return {
                                    status: 'E22-R-2201',
                                    message: t.noChatData,
                                };
                            }

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
                            console.error(t.fetchChatInfoError.replace('${error}', fetchChatErrorMessage));
                            return {
                                status: 'E22-R-2202',
                                message: error.response?.data?.message || 'Fehler beim Abrufen der Chat-Informationen.'
                            };
                        }
                    }
                /*  3.0 Create Source ##############################################################################*/
                    case 'create_source': {
                        const disabledResponse = checkToolEnabled('create_source');
                        if (disabledResponse) return disabledResponse;

                        const args = request.params.arguments;
                        const token = request.params.token;

                        // Validierung: Erforderliche Parameter prüfen
                        if (!token) {
                            return { status: 'E30-R-3000', message: t.missingTokenError };
                        }
                        if (!args || !args.name || !args.content) {
                            return { status: 'E30-R-3001', message: t.missingParametersError.replace('${parameters}', 'name und content') };
                        }

                        const { name, content, groups } = args;

                        try {
                            // Token im Header setzen
                            this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                            // Gruppenvalidierung vorab durchführen
                            if (groups && groups.length > 0) {
                                console.log('📤 Überprüfen der Gruppen:', groups);

                                const response = await this.axiosInstance.get('/groups');
                                const availableGroups = response.data?.data?.assignableGroups || [];

                                // Ungültige Gruppen ermitteln
                                const invalidGroups = groups.filter(group => !availableGroups.includes(group));
                                if (invalidGroups.length > 0) {
                                    console.error('❌ Ungültige Gruppen gefunden:', invalidGroups);
                                    return {
                                        status: 'E30-R-3002',
                                        message: `Ungültige Gruppen: ${invalidGroups.join(', ')}`,
                                    };
                                }
                            }

                            // API-Aufruf zur Erstellung der Quelle
                            const createSourceResponse = await this.axiosInstance.post(
                                '/sources',
                                { name, content, groups },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );

                            console.log('✔️ Quelle erfolgreich erstellt:', createSourceResponse.data);

                            // Erfolgsantwort
                            return {
                                status: createSourceResponse.data?.status || 'ok',
                                message: createSourceResponse.data?.message || 'Quelle erfolgreich erstellt.',
                                data: createSourceResponse.data?.data,
                            };
                        } catch (error) {
                            const createSourceError = error.response?.data || error.message;
                            console.error(t.createSourceError.replace('${error}', createSourceError));

                            // console.error('❌ Fehler beim Erstellen der Quelle:', error.response?.data || error.message);

                            // Fehlerhafte Antwort
                            if (error.response) {
                                return {
                                    status: 'E30-R-3003',
                                    message: error.response.data?.message || 'Ein Fehler ist aufgetreten.',
                                    details: {
                                        status: error.response.status,
                                        headers: error.response.headers,
                                        data: error.response.data,
                                    },
                                };
                            } else if (error.request) {
                                return {
                                    status: 'E30-R-3004',
                                    message: t.noServerResponse,
                                    details: { request: error.request },
                                };
                            } else {
                                return {
                                    status: 'E30-R-3005',
                                    message: error.message || 'Ein unbekannter Fehler ist aufgetreten.',
                                };
                            }
                        }
                    }
                /*  3.1 Get Source #################################################################################*/
                    case 'get_source': {
                        const disabledResponse = checkToolEnabled('get_source');
                        if (disabledResponse) return disabledResponse;
                        const args = request.params.arguments;
                        console.log(t.makingGetSourceRequest.replace('${args}', JSON.stringify(args, null, 2)));
                        const getSourceResponse = await this.axiosInstance.get(`/sources/${args.sourceId}`);
                        console.log(t.gotGetSourceResponse.replace('${data}', JSON.stringify(getSourceResponse.data, null, 2)));
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(getSourceResponse.data, null, 2)
                                }
                            ]
                        };
                    }
                /*  3.2 List Sources ###############################################################################*/  
                    case 'list_sources': {
                        const disabledResponse = checkToolEnabled('list_sources');
                        if (disabledResponse) return disabledResponse;
                        const args = request.params.arguments;
                        console.log(t.makingListSourcesRequest.replace('${args}', JSON.stringify(args, null, 2)));
                        const listSourcesResponse = await this.axiosInstance.post('/sources/groups', {
                            groupName: args.groupName
                        });
                        console.log(t.gotListSourcesResponse.replace('${data}', JSON.stringify(listSourcesResponse.data, null, 2)));
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(listSourcesResponse.data, null, 2)
                                }
                            ]
                        };
                    }
                /*  3.3 Edit Source ################################################################################*/  
                    case 'edit_source': {
                        const disabledResponse = checkToolEnabled('edit_source');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;

                        // Validierung: Token erforderlich
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { sourceId, title, content, groups } = args;

                        // Validierung: Pflichtfeld `sourceId`
                        if (!sourceId) {
                            return {
                                data: {},
                                message: t.missingParameterError.replace('${parameter}', 'sourceId'),
                                status: 'E33-R-3300', // Bad Request
                            };
                        }

                        console.log(`Bearbeite Quelle mit ID: ${sourceId}, Titel: ${title || 'unverändert'}`);

                        try {
                            // Payload dynamisch erstellen
                            const payload = {};
                            if (title) payload.title = title;
                            if (content) payload.content = content;
                            if (groups) payload.groups = groups;

                            // API-Aufruf: Quelle bearbeiten
                            const editSourceResponse = await this.axiosInstance.patch(
                                `/sources/${sourceId}`,
                                payload,
                                {
                                    headers: {
                                        Authorization: `Bearer ${token}`, // Nutze den bereitgestellten Token
                                    },
                                }
                            );

                            console.log(t.editSourceSuccess.replace('${data}', JSON.stringify(editSourceResponse.data, null, 2)));

                            // Erfolgreiche Antwort
                            return {
                                data: editSourceResponse.data?.data || {}, // Optionale Daten aus der API
                                message: editSourceResponse.data?.message || 'Quelle erfolgreich bearbeitet.',
                                status: editSourceResponse.status || 200, // OK
                            };
                        } catch (error) {
                            const editSourceError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.editSourceError.replace('${error}', editSourceError));

                            // console.error(`❌ Fehler beim Bearbeiten der Quelle: ${error.message || JSON.stringify(error.response?.data)}`);

                            // Fehlerhafte Antwort
                            return {
                                data: {},
                                message: error.response?.data?.message || 'Bearbeiten der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                                status: error.response?.status || 'E33-R-3301', // Internal Server Error
                            };
                        }
                    }
                /*  3.4 Delete Source ##############################################################################*/
                    case 'delete_source': {
                        const disabledResponse = checkToolEnabled('delete_source');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params.arguments;

                        // Validierung: Token erforderlich
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        const { sourceId } = args;

                        // Validierung: sourceId erforderlich
                        if (!sourceId) {
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

                            console.log(`Quelle erfolgreich gelöscht: ${JSON.stringify(deleteResponse.data, null, 2)}`);

                            // Erfolgreiche Antwort
                            return {
                                data: deleteResponse.data?.data || {}, // Optionale Daten aus der API
                                message: deleteResponse.data?.message || 'Quelle erfolgreich gelöscht.',
                                status: deleteResponse.status || 200, // OK
                            };
                        } catch (error) {
                            // console.error(`❌ Fehler beim Löschen der Quelle: ${error.message || JSON.stringify(error.response?.data)}`);
                            const deleteSourceError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.deleteSourceError.replace('${error}', deleteSourceError));


                            // Fehlerhafte Antwort
                            return {
                                data: {},
                                message: error.response?.data?.message || 'Löschen der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                                status: error.response?.status || 'E34-R-3401', // Internal Server Error
                            };
                        }
                    }
                /*  4.0 List Groups ################################################################################*/
                    case 'list_groups': {
                        const disabledResponse = checkToolEnabled('list_groups');
                        if (disabledResponse) return disabledResponse;
                        console.log(t.makingListGroupsRequest);
                        const listGroupsResponse = await this.axiosInstance.get('/groups');
                        console.log(t.gotListGroupsResponse, listGroupsResponse.data);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: JSON.stringify(listGroupsResponse.data, null, 2)
                                }
                            ]
                        };
                    }
                /*  4.1 Store Group ################################################################################*/
                    case 'store_group': {
                        const disabledResponse = checkToolEnabled('store_group');
                        if (disabledResponse) return disabledResponse;
                        const args = request.params.arguments;

                        if (!args || !args.groupName) {
                            throw new McpError(ErrorCode.InvalidRequest, 'Store: Fehlender erforderlicher Parameter: groupName.');
                        }

                        console.log(
                            t.storeGroupLog
                                .replace('${groupName}', args.groupName)
                                .replace('${description}', args.description || 'Keine Beschreibung angegeben')
                        );

                        // console.log(`Storing new group with name: ${args.groupName} and description: ${args.description || 'No description provided'}`);

                        try {
                            const storeGroupResponse = await this.axiosInstance.post('/groups', {
                                groupName: args.groupName,
                                description: args.description || ''
                            });
                            console.log(
                                t.storeGroupSuccess.replace('${data}', JSON.stringify(storeGroupResponse.data, null, 2))
                            );
                            // console.log(`Group stored successfully: ${JSON.stringify(storeGroupResponse.data, null, 2)}`);

                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Group "${args.groupName}" successfully stored with ID: ${storeGroupResponse.data.id}`
                                    }
                                ]
                            };
                        } catch (error) {
                            console.error(t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)));
                            if (axios.isAxiosError(error)) {
                                const message = error.response?.data?.message ?? error.message;
                                console.error(
                                    t.apiErrorDetails.replace('${status}', error.response?.status || 'E41-R-4100').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2))
                                );
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
                    };
                /*  4.2 Delete Group ###############################################################################*/  
                    case 'delete_group': {
                        const disabledResponse = checkToolEnabled('delete_group');
                        if (disabledResponse) return disabledResponse;
                        
                        const { groupName } = request.params.arguments; // Extrahiere die Gruppe
                        if (!groupName) {
                            throw new McpError(ErrorCode.InvalidRequest, 'Delete Fehlender erforderlicher Parameter: groupName.');
                        }

                        // console.log(`Lösche Gruppe mit Name: ${groupName}`);
                        console.log(t.deleteGroupLog.replace('${groupName}', groupName));


                        try {
                            // API-Aufruf mit dem notwendigen JSON-Body
                            const deleteGroupResponse = await this.axiosInstance.delete('/groups', {
                                data: { groupName }, // JSON-Body für den DELETE-Request
                            });

                            // console.log(t.deleteGroupSuccessLog.replace('${data}', JSON.stringify(deleteGroupResponse.data)));
                            console.log(t.deleteGroupSuccessLog.replace('${data}', JSON.stringify(deleteGroupResponse.data)));


                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Gruppe "${groupName}" wurde erfolgreich gelöscht.`,
                                    },
                                ],
                            };
                        } catch (error) {
                            // console.error(`Fehler bei der API-Anfrage: ${error.message || JSON.stringify(error.response?.data)}`);
                            const apiError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.apiRequestError.replace('${error}', apiError));
                            if (axios.isAxiosError(error)) {
                                const message = error.response?.data?.message || 'Fehler beim Löschen der Gruppe.';
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
                            throw new McpError(ErrorCode.InternalError, 'Interner Fehler beim Löschen der Gruppe.');
                        }
                    }           
                /*  5.0 Store User #################################################################################*/
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
                            return {
                                status: 'E50-R-5000',
                                message: 'Fehlende erforderliche Felder: name, email oder password.'
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

                            // Erfolgreiche Antwort
                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich erstellt.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            // console.error('❌ Fehler beim Erstellen des Benutzers:', error.response?.data || error.message);
                            const createUserError = error.response?.data || error.message;
                            console.error(t.createUserError.replace('${error}', createUserError));
                            return {
                                status: error.response?.status || 'E50-R-5001',
                                message: error.response?.data?.message || 'Fehler beim Erstellen des Benutzers.'
                            };
                        }
                    }
                /*  5.1 Edit User ##################################################################################*/
                    case 'edit_user': {
                        const disabledResponse = checkToolEnabled('edit_user');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // Mindestens die E-Mail muss angegeben sein, um den User zu identifizieren
                        if (!args || !args.email) {
                            return {
                                status: 'E51-R-5100',
                                message: 'Die E-Mail des Benutzers ist erforderlich, um den Datensatz zu bearbeiten.'
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

                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich bearbeitet.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            const editUserError = error.response?.data || error.message;
                            console.error(t.editUserError.replace('${error}', editUserError));
                            // console.error('❌ Fehler beim Bearbeiten des Benutzers:', error.response?.data || error.message);
                            return {
                                status: error.response?.status || 'E51-R-5101',
                                message: error.response?.data?.message || 'Fehler beim Bearbeiten des Benutzers.'
                            };
                        }
                    }
                /*  5.2 Delete User ################################################################################*/
                    case 'delete_user': {
                        const disabledResponse = checkToolEnabled('delete_user');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = request.params;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // E-Mail ist nötig, um den Benutzer zu löschen
                        if (!args || !args.email) {
                            return {
                                status: 'E52-R-5200',
                                message: 'Die E-Mail ist erforderlich, um einen Benutzer zu löschen.'
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

                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich gelöscht.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            // console.error('❌ Fehler beim Löschen des Benutzers:', error.response?.data || error.message);
                            const deleteUserError = error.response?.data || error.message;
                            console.error(t.deleteUserError.replace('${error}', deleteUserError));
                            return {
                                status: error.response?.status || 'E52-R-5201',
                                message: error.response?.data?.message || 'Fehler beim Löschen des Benutzers.'
                            };
                        }
                    }               
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                console.error(t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)));
                if (axios.isAxiosError(error)) {
                    const message = error.response?.data?.message ?? error.message;
                    console.error(t.apiErrorDetails.replace('${status}', error.response?.status || 'Unknown').replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)));
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
            throw new Error(t.portInUse.replace('${PORT}', PORT));
        }

        const transport = new TcpServerTransport(PORT);
        await transport.start(async (message) => {
            try {
                console.log(t.incomingMessage, message);

                 // Token-Validierung nur durchführen, wenn es nicht der "login"-Befehl ist
                //if (message.command !== 'login') {
                    // const tokenValidation = validateToken(message.token);
                    // if (tokenValidation) return tokenValidation;
                // }
                
                if (!message || typeof message !== 'object') {
                    throw new McpError(ErrorCode.InvalidRequest, 'Ungültige Nachricht oder leere Anfrage.');
                }

                // Verarbeite verschiedene Anfragen dynamisch
                if (!message.command) {
                    throw new McpError(ErrorCode.InvalidRequest, 'Fehlender Befehlsparameter in der Nachricht.');
                }
                switch (message.command) {
                /*  1.0 Login ######################################################################################*/
                    case 'login': {
                        const disabledResponse = checkToolEnabled('login');
                        if (disabledResponse) return disabledResponse;

                        // Extrahiere die Argumente aus der Nachricht
                        const args = getArguments(message);
                        const { email, password: Pwd } = args;

                        // Überprüfe, ob die E-Mail und das Passwort vorhanden sind
                        if (!email || !Pwd) {
                            return {
                                status: 'E10-M-1050',
                                message: 'E-Mail und Passwort sind erforderlich.',
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

                            console.log(t.loginSuccess.replace('${data}', JSON.stringify(loginResponse.data)));

                            // Token zurückgeben
                            return {
                                status: loginResponse.data?.status || 'ok', // Dynamisch, falls der API-Status einheitlich ist
                                message: loginResponse.data?.message || 'Login erfolgreich.', // API-Nachricht verwenden oder Standardnachricht
                                token: loginResponse.data?.data?.token, // Token aus API-Antwort
                            };
                        } catch (error) {
                            const errorMessage = error.response?.data || error.message;
                            console.error(t.loginError.replace('${error}', errorMessage));
                            // console.error('❌ Fehler beim Login:', error.response?.data || error.message);

                            return {
                                status: error.response?.status || 'E10-M-1051', // API-Fehlerstatus oder Standardfehlerstatus,
                                message: error.response?.data || error.message || 'no error message'
                            };
                        }
                    }
                /*  1.1 Logout #####################################################################################*/  
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

                            console.log(t.logoutSuccess.replace('${data}', JSON.stringify(logoutResponse.data)));
                            // console.log('✔️ Logout erfolgreich:', logoutResponse.data);

                             return {
                                data: {}, // Optional: Zusätzliche Daten könnten hier eingefügt werden
                                status: logoutResponse.data?.status || 'no status', // Dynamisch, falls der API-Status einheitlich ist
                                message: logoutResponse.data?.message || 'no message', // API-Nachricht verwenden oder Standardnachricht
                            };
                        } catch (error) {
                                const logoutErrorMessage = error.response?.data || error.message;
                                console.error(t.logoutError.replace('${error}', logoutErrorMessage));
                            // console.error('❌ Fehler beim Logout:', error.response?.data || error.message);
                            return {
                                data: {},
                                message: error.response?.data || error.message || 'no error message',
                                status: error.response?.status || 'E11-M-1150', // Internal Server Error oder spezifischer Statuscode
                            };
                        }
                    }
                /*  2.0 Chat #######################################################################################*/  
                    case 'chat': {
                        const disabledResponse = checkToolEnabled('chat');
                        if (disabledResponse) return disabledResponse;
                        
                        // Extrahiere den Token und die Argumente
                        const token = message.token; // Token direkt extrahieren
                        const args = message.arguments || {}; // Sichere Extraktion der Argumente
                        const { question, usePublic, groups, language } = args;
                        
                        //const { token, arguments: args } = message;
//                      const { token, question, usePublic, groups, language } = args;
                        
                        // Argument-Validierung
                        if (!args || !args.question) {
                            return {
                                status: 'E20-M-2050',
                                message: 'Fehlende Frage in den Argumenten.',
                            };
                        }
                        
                        console.log('message Extrahierter Token:', token);

                        //const { question, usePublic, groups, language } = args;

                        // Konflikt zwischen `usePublic` und `groups` lösen
                        if (usePublic && groups && groups.length > 0) {
                            console.warn("⚠️ Konflikt: usePublic wurde auf false gesetzt, da Gruppen angegeben sind.");
                            args.usePublic = false;
                        }

                        try {
                            // API-Aufruf zur Verarbeitung der Chat-Anfrage
                            const response = await this.axiosInstance.post(
                                '/chats',
                                {
                                    question,
                                    usePublic: usePublic || false,
                                    // groups: Array.isArray(groups) ? groups : [groups],
                                    groups: Array.isArray(groups) ? groups : groups ? [groups] : [],
                                    language: language || 'de',
                                },
                                {
                                    headers: { Authorization: `Bearer ${token}` },
                                }
                            );

                            const data = response.data?.data || {};
                            console.log(t.chatResponseSuccess.replace('${data}', JSON.stringify(data)));
                          
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
                            console.error(t.chatApiError.replace('${error}', chatApiErrorMessage));

                            // Fehlerantwort mit Status und Nachricht
                            return {
                                status: error.response?.data?.status || error.message.status || 'E20-M-2051',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }
                    }
                /*  2.1 Continue Chat ##############################################################################*/
                    case 'continue_chat': {
                        const disabledResponse = checkToolEnabled('continue_chat');
                        if (disabledResponse) return disabledResponse;
                        //const { token, arguments: args } = message;
                        //const { token, chatId, question } = args;
                        const token = message.token; // Token direkt extrahieren
                        const args = message.arguments || {}; // Sichere Extraktion der Argumente

                        //const { token } = message;
                        //const args = message.arguments || {};
                        const { chatId, question } = args;
                        

                        if (!args || !args.chatId || !args.question) {
                            return { status: 'E21-M-2150', message: 'Fehlende erforderliche Parameter: chatId und/oder question.' };
                        }

                        //const { chatId, question } = args;

                        try {
                            const continueChatResponse = await this.axiosInstance.patch(
                                `/chats/${chatId}`,
                                { question },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );
                            console.log(t.conversationSuccess.replace('${data}', JSON.stringify(continueChatResponse.data, null, 2)));
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
                            //console.error(`Fehler bei der API-Anfrage: ${error.message}`);
                            console.error(t.apiRequestError.replace('${error}', error.message));
                            return {
                                status: 'E21-M-2151',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }
                    }
                /*  2.2 Get Chat Info ##############################################################################*/  
                    case 'get_chat_info': {
                        const disabledResponse = checkToolEnabled('get_chat_info');
                        if (disabledResponse) return disabledResponse;
                        
                        //const { token, chatId } = args;
                        
                        //const { token, arguments: args } = message;

                        //const { chatId } = args;
                        const { token } = message; // Token direkt aus `message` extrahieren
                        const args = message.arguments || {}; // Argumente aus `message` extrahieren
                        const { chatId } = args; // chatId aus den Argumenten extrahieren


                        if (!chatId) {
                            return { status: 'E22-M-2250', message: 'chatId ist erforderlich, um Chat-Informationen abzurufen.' };
                        }

                        try {
                            const response = await this.axiosInstance.get(`/chats/${chatId}`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });

                            const chatData = response.data?.data;

                            if (!chatData) {
                                return {
                                    status: 'E22-M-2251',
                                    message: t.noChatData,
                                };
                            }

                            // Formatiertes Ergebnis zurückgeben
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
                            console.error(t.fetchChatInfoError.replace('${error}', fetchChatErrorMessage));
                            return {
                                status: 'E22-M-2252',
                                message: error.response?.data?.message || error.message || 'no error message'
                            };
                        }
                    }
                /*  3.0 Create Source ##############################################################################*/  
                    case 'create_source': {
                        const disabledResponse = checkToolEnabled('create_source');
                        if (disabledResponse) return disabledResponse;

                        const args = getArguments(message);
                        // const args = request.params.arguments;
                        const token = message.token;

                        // Validierung: Erforderliche Parameter prüfen
                        if (!token) {
                            return { status: 'E30-M-3050', message: t.missingTokenError };
                        }
                        if (!args || !args.name || !args.content) {
                            return { status: 'E30-M-3051', message: t.missingParametersError.replace('${parameters}', 'name und content') };
                        }

                        const { name, content, groups } = args;

                        try {
                            // Gruppenvalidierung vorab durchführen
                            if (groups && groups.length > 0) {
                                const groupValidation = await this.validateGroups(groups, token);
                                if (!groupValidation.isValid) {
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

                            console.log('✔️ Quelle erfolgreich erstellt:', createSourceResponse.data);

                            // Erfolgsantwort
                            return {
                                status: createSourceResponse.data?.status || 'ok',
                                message: createSourceResponse.data?.message || 'Quelle erfolgreich erstellt.',
                                data: createSourceResponse.data?.data,
                            };
                        } catch (error) {
                            // console.error('❌ Fehler beim Erstellen der Quelle:', error.response?.data || error.message);
                            const createSourceError = error.response?.data || error.message;
                            console.error(t.createSourceError.replace('${error}', createSourceError));

                            // Fehlerhafte Antwort
                            if (error.response) {
                                return {
                                    status: 'E30-M-3053',
                                    message: error.response?.data?.message || error.message || 'no error message',
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
                                    message: error.message || 'Ein unbekannter Fehler ist aufgetreten.',
                                };
                            }
                        }
                    }
                /*  3.1 Get Source #################################################################################*/              
                    case 'get_source': {
                        const disabledResponse = checkToolEnabled('get_source');
                        if (disabledResponse) return disabledResponse;
                        const { token, arguments: args } = message; // Extrahiere den Token und die Argumente
                        //const { token, sourceId } = args;
                        const { sourceId } = args; // Extrahiere sourceId aus den Argumenten

                        if (!sourceId) {
                            return { status: 'E31-M-3150', message: t.groupNameRequired.replace('${param}', 'sourceId') };
                        }

                        console.log(t.makingGetSourceRequest.replace('${sourceId}', sourceId));

                        try {
                            const sourceResponse = await this.axiosInstance.get(`/sources/${sourceId}`, {
                                headers: {
                                    Authorization: `Bearer ${token}`, // Nutze den vom Client bereitgestellten Token
                                },
                            });

                            console.log(t.gotGetSourceResponse.replace('${data}', JSON.stringify(sourceResponse.data, null, 2)));

                            return {
                                content: sourceResponse.data,
                            };
                        } catch (error) {
                            console.error(t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)));
                            return {
                                status: 'E31-M-3151',
                                message: t.apiErrorDetails
                                    .replace('${status}', error.response?.status || 'E31-M-3151')
                                    .replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)),
                            };
                        }
                    }
                /*  3.2 List Sources ###############################################################################*/      
                    case 'list_sources': {
                        const disabledResponse = checkToolEnabled('list_sources');
                        if (disabledResponse) return disabledResponse;
                        const { token, attributes } = message; // Extrahiere den Token und die Attribute

                        //const { token, groupName } = args;
                        if (!attributes || !attributes.groupName) {
                            return { status: 'E32-M-3250', message: 'Gruppenname erforderlich für diese Anfrage.' };
                        }

                        const groupName = attributes.groupName; // Extrahiere den groupName aus attributes
                        console.log(t.fetchingSources.replace('${groupName}', groupName));

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

                            console.log(t.sourcesRetrieved.replace('${data}', JSON.stringify(sourceResponse.data, null, 2)));

                            return {
                                content: sourceResponse.data, // Sende die Antwort zurück
                            };
                        } catch (error) {
                            console.error(t.groupValidationError.replace('${error}', error.message || JSON.stringify(error)));
                            return {
                                status: 'E32-M-3251',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
//                              status: 'error',
                                //message: t.groupFetchError,
                        }
                    }
                /*  3.3 Edit Source ################################################################################*/              
                    case 'edit_source': {
                        const disabledResponse = checkToolEnabled('edit_source');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = message;

                        const { sourceId, title, content, groups } = args;

                        // Validierung: Erforderliche Parameter
                        if (!sourceId) {
                            return {
                                data: {},
                                message: t.missingParameterError.replace('${parameter}', 'sourceId'),
                                status: 'E33-M-3350', // Bad Request
                            };
                        }

                        // console.log(`Bearbeite Quelle mit ID: ${sourceId}, Titel: ${title || 'unverändert'}`);
                        console.log(
                            t.editSourceLog
                                .replace('${sourceId}', sourceId)
                                .replace('${title}', title || 'unverändert')
                        );

                        try {
                            // API-Aufruf: Quelle bearbeiten
                            const payload = {};
                            if (title) payload.title = title;
                            if (content) payload.content = content;
                            if (groups) payload.groups = groups;

                            const editSourceResponse = await this.axiosInstance.patch(
                                `/sources/${sourceId}`,
                                payload,
                                {
                                    headers: {
                                        Authorization: `Bearer ${token}`, // Nutze den bereitgestellten Token
                                    },
                                }
                            );

                            console.log(t.editSourceSuccess.replace('${data}', JSON.stringify(editSourceResponse.data, null, 2)));

                            // Erfolgreiche Antwort
                            return {
                                data: editSourceResponse.data?.data || {}, // Optionale Daten aus der API
                                message: editSourceResponse.data?.message || 'Quelle erfolgreich bearbeitet.',
                                status: editSourceResponse.status || 200, // OK
                            };
                        } catch (error) {
                            const editSourceError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.editSourceError.replace('${error}', editSourceError));

                            // console.error(`❌ Fehler beim Bearbeiten der Quelle: ${error.message || JSON.stringify(error.response?.data)}`);

                            // Fehlerhafte Antwort
                            return {
                                data: {},
                                message: error.response?.data?.message || 'Bearbeiten der Quelle fehlgeschlagen. Bitte versuchen Sie es später erneut.',
                                status: error.response?.status || 'E33-M-3351', // Internal Server Error
                            };
                        }
                    }
                /*  3.4 Delete Source ##############################################################################*/  
                    case 'delete_source': {
                        const disabledResponse = checkToolEnabled('delete_source');
                        if (disabledResponse) return disabledResponse;

                        const { token, arguments: args } = message;
                        const { sourceId } = args;

                        if (!sourceId) {
                            return { status: 'E34-M-3450', message: t.groupNameRequired.replace('${param}', 'sourceId') };
                        }

                        try {
                            const deleteResponse = await this.axiosInstance.delete(`/sources/${sourceId}`, {
                                headers: { Authorization: `Bearer ${token}` },
                            });

                            console.log(`Quelle erfolgreich gelöscht: ${JSON.stringify(deleteResponse.data, null, 2)}`);

                            return {
                                content: deleteResponse.data,
                            };
                        } catch (error) {
                            console.error(t.errorHandlingRequest.replace('${error}', error.message || JSON.stringify(error, null, 2)));
                            return {
                                status: 'E34-M-3451',
                                message: t.apiErrorDetails
                                    .replace('${status}', error.response?.status || 'E34-M-3451')
                                    .replace('${data}', JSON.stringify(error.response?.data || {}, null, 2)),
                            };
                        }
                    }       
                /*  4.0 List Groups ################################################################################*/  
                    case 'list_groups': {
                        const disabledResponse = checkToolEnabled('list_groups');
                        if (disabledResponse) return disabledResponse;
                        //const token = message.arguments?.token || message.token;
                        const token = message.token; // Token direkt aus `message` extrahieren
                        
                        try {
                            await this.ensureAuthenticated(token);

                            const response = await this.axiosInstance.get('/groups');
                            let assignableGroups = response.data?.data?.assignableGroups || [];
                            const personalGroups = response.data?.data?.personalGroups || [];
                            const message = response.data?.message || 'no_message'; // Fallback für Nachricht
                            const status = response.data?.status || 'E40-M-4050'; // Fallback für Status

                            
                            if (isRestrictedGroupsEnabled) {
                                // console.log('⚠️ RESTRICTED_GROUPS aktiviert. Verfügbare Gruppen werden eingeschränkt.');
                                console.log(t.restrictedGroupsWarning);
                                assignableGroups = ["NO ACCESS ALLOWED BY THE MCP-SERVER CONFIG"]; // Alle assignableGroups entfernen
                            }

                            return {
                                data: {
                                    personalGroups,
                                    assignableGroups,
                                    message,
                                    status,
                                },
                            };
                        } catch (error) {
                            const fetchGroupsError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.fetchGroupsError.replace('${error}', fetchGroupsError));


                            // Detaillierte Fehlerbehandlung
                            if (axios.isAxiosError(error)) {
                                const status = error.response?.status;
                                const serverMessage = error.response?.data?.message || error.message || 'no error message';
                                return {
                                    status: 'E40-M-4051',
                                    message: `Fehler beim Abrufen der Gruppen: ${serverMessage} (Status: ${status})`,
                                };
                            }

                            return {
                                status: 'E40-M-4052',
                                message: 'Ein unbekannter Fehler ist aufgetreten.',
                            };
                        }
                    }       
                /*  4.1 Store Group ################################################################################*/  
                    case 'store_group': {
                        const disabledResponse = checkToolEnabled('store_group');
                        if (disabledResponse) return disabledResponse;
                        
                        //const { groupName, description } = args; // Einheitliche Extraktion über getArguments
                        const { groupName, description } = message.arguments; // Extrahiere die Argumente
                        const clientToken = message.token; // Token aus der Anfrage

                        if (!groupName || !description) {
                            return { status: 'E41-M-4150', message: 'Fehlende erforderliche Parameter: groupName und description.' };
                        }

                        if (!clientToken) {
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

                            console.log(t.createGroupSuccess.replace('${data}', JSON.stringify(createGroupResponse.data)));

                            return {
                                content: createGroupResponse.data,
                            };
                        } catch (error) {
                            // console.error('❌ Fehler bei der API-Anfrage:', error.response?.data || error.message);
                            const apiError = error.response?.data || error.message;
                            console.error(t.apiRequestError.replace('${error}', apiError));
                            return {
                                status: 'E41-M-4152',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }
                    }
                /*  4.2 Delete Group ###############################################################################*/  
                    case 'delete_group': {
                        const disabledResponse = checkToolEnabled('delete_group');
                        if (disabledResponse) return disabledResponse;
                        
                        //const { token, groupName } = args;
                        
                        const { token, arguments: args } = message; // Extrahiere Token und Argumente
                        const { groupName } = args;

                        if (!groupName) {
                            return { status: 'E42-M-4250', message: 'Fehlender erforderlicher Parameter: groupName.' };
                        }

                        // console.log(`Lösche Gruppe mit Name: ${groupName}`);
                        console.log(t.deleteGroupLog.replace('${groupName}', groupName));


                        try {
                            // API-Aufruf mit dem Token des Clients
                            const deleteGroupResponse = await this.axiosInstance.delete('/groups', {
                                data: { groupName }, // JSON-Body für DELETE-Request
                                headers: {
                                    Authorization: `Bearer ${token}`, // Nutze den vom Client bereitgestellten Token
                                },
                            });

                            console.log(t.deleteGroupSuccessLog.replace('${data}', JSON.stringify(deleteGroupResponse.data)));
                    
                            return {
                                data: deleteGroupResponse.data?.data || {},
                                message: deleteGroupResponse.data?.message || 'success',
                                status: deleteGroupResponse.status || 200,
                            };
                        } catch (error) {
                            // console.error(`❌ Fehler beim Löschen der Quelle: ${error.message || JSON.stringify(error.response?.data)}`);
                            const deleteSourceError = error.message || JSON.stringify(error.response?.data);
                            console.error(t.deleteSourceError.replace('${error}', deleteSourceError));
    

                            // Fehlerhafte Antwort
                            return {
                                data: {},
                                message: error.response?.data?.message || error.message || 'no error message',
                                status: error.response?.status || 'E42-M-4251', // Internal Server Error oder spezifischer Statuscode
                            };
                        }
                    }               
                /*  5.0 Store User #################################################################################*/              
                    case 'store_user': {
                        const disabledResponse = checkToolEnabled('store_user');
                        if (disabledResponse) return disabledResponse;
                        const { token, arguments: args } = message;

                        //const { token, name, email, password } = args;
                        
                        if (!args || !args.name || !args.email || !args.password) {
                            return { status: 'E50-M-5050', message: 'Fehlende erforderliche Parameter: name, email oder password.' };
                        }


                        // Extrahiere die Argumente aus der Nachricht
                        //const args = getArguments(message);
                        const Pwd = args.password;

                        // Überprüfe, ob die E-Mail und das Passwort vorhanden sind
                        if (!Pwd) {
                            return {
                                status: 'E10-M-1050',
                                message: 'Passwort ist erforderlich.',
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

                            console.log(t.createUserLog.replace('${payload}', JSON.stringify(payload)));

                            // API-Aufruf
                            const createUserResponse = await this.axiosInstance.post('/users', payload, {
                                headers: {
                                    Authorization: `Bearer ${token}`
                                }
                            });

                            console.log(t.createUserSuccess.replace('${data}', JSON.stringify(createUserResponse.data)));

                            return {
                                content: createUserResponse.data,
                            };
                        } catch (error) {
                            const createUserError = error.response?.data || error.message;
                            console.error(t.createUserError.replace('${error}', createUserError));

                            // console.error('❌ Fehler beim Erstellen des Benutzers:', error.response?.data || error.message);

                            const errors = error.response?.data?.errors;
                            if (errors) {
                                const errorMessages = [];
                                for (const [key, messages] of Object.entries(errors)) {
                                    messages.forEach(message => errorMessages.push(`${key}: ${message}`));
                                }

                                return {
                                    status: 'E50-M-5051',
                                    message: 'Fehler beim Erstellen des Benutzers:',
                                    errors: errorMessages
                                };
                            }

                            return {
                                status: 'E50-M-5052',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }
                    }
                /*  5.1 Edit User ##################################################################################*/
                    case 'edit_user': {
                        const disabledResponse = checkToolEnabled('edit_user');
                        if (disabledResponse) return disabledResponse;
                        
                        const { token, arguments: args } = message;
                        const tokenValidation = validateToken(token);
                        if (tokenValidation) return tokenValidation;

                        // Mindestens die E-Mail muss angegeben sein, um den User zu identifizieren
                        if (!args || !args.email) {
                            return {
                                status: 'E51-R-5100',
                                message: 'Die E-Mail des Benutzers ist erforderlich, um den Datensatz zu bearbeiten.'
                            };
                        }

                        let password = null;

                        if (args.password) {
                            const Pwd = args.password;
                            if (!Pwd) {
                                return {
                                    status: 'E51-M-1050',
                                    message: 'Passwort ist erforderlich.',
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
                            console.log(t.editUserSuccess.replace('${data}', JSON.stringify(response.data)));

                            return {
                                status: response.data?.status || 'ok',
                                message: response.data?.message || 'Benutzer erfolgreich bearbeitet.',
                                data: response.data?.data
                            };
                        } catch (error) {
                            const editUserError = error.response?.data || error.message;
                            console.error(t.editUserError.replace('${error}', editUserError));
                            // console.error('❌ Fehler beim Bearbeiten des Benutzers:', error.response?.data || error.message);
                            return {
                                status: error.response?.status || 'E51-M-5151',
                                message: error.response?.data?.message || 'Fehler beim Bearbeiten des Benutzers.'
                            };
                        }
/*
                        const { token, arguments: args } = message;

                        //const { token, email, ...updates } = args;
                        const { email, ...updates } = args;

                        if (!email) {
                            return { status: 'E51-M-5150', message: 'Email ist erforderlich, um einen Benutzer zu bearbeiten.' };
                        }

                        try {
                            const response = await this.axiosInstance.patch(
                                '/users',
                                { email, ...updates },
                                { headers: { Authorization: `Bearer ${token}` } }
                            );

                            console.log(t.editUserSuccess.replace('${data}', JSON.stringify(response.data)));

                            return {
                                content: response.data,
                            };
                        } catch (error) {
                            const editUserError = error.response?.data || error.message;
                            console.error(t.editUserError.replace('${error}', editUserError));
                            // console.error('❌ Fehler beim Bearbeiten des Benutzers:', error.response?.data || error.message);
                            return {
                                status: 'E51-M-5151',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }*/
                    }
                /*  5.2 Delete User ################################################################################*/  
                    case 'delete_user': {
                        const disabledResponse = checkToolEnabled('delete_user');
                        if (disabledResponse) return disabledResponse;
                        const { token, arguments: args } = message;

                        const { email } = args;
                        //const { token, email } = args;

                        if (!email) {
                            return { status: 'E52-M-5250', message: 'Email ist erforderlich, um einen Benutzer zu löschen.' };
                        }

                        try {
                            const response = await this.axiosInstance.delete(
                                '/users',
                                {
                                    data: { email },
                                    headers: { Authorization: `Bearer ${token}` }
                                }
                            );

                           console.log(t.deleteUserSuccess.replace('${data}', JSON.stringify(response.data)));

                            return {
                                content: response.data,
                            };
                        } catch (error) {
                            const deleteUserError = error.response?.data || error.message;
                            console.error(t.deleteUserError.replace('${error}', deleteUserError));
                            // console.error('❌ Fehler beim Löschen des Benutzers:', error.response?.data || error.message);
                            return {
                                status: 'E52-M-5251',
                                message: error.response?.data?.message || error.message || 'no error message',
                            };
                        }
                    }
                /*  9.0 Generate Key ###############################################################################*/    
                    case 'keygen': {
                        const disabledResponse = checkToolEnabled('keygen');
                        if (disabledResponse) return disabledResponse;

                        const { password } = message.arguments;

                        try {
                            // Passwort verschlüsseln
                            const encryptedPassword = getEncryptedKey(password);

                            // Schlüssel zurückgeben
                            return {
                                data: {
                                    key: encryptedPassword
                                },
                                status: 'ok',
                                message: 'Keygen erfolgreich.',
                            };
                        } catch (error) {
                            console.error('❌ Fehler bei der Keygen-Anfrage:', error.message);
                            return {
                                data: {},
                                message: error.message || 'Keygen fehlgeschlagen.',
                                status: 'E90-M-1150',
                            };
                        }
                    }
                }
            } catch (err) {
                console.error(t.tcpServerError, err.message || err);
                return { status: 'E52-M-5252', message: err.message || t.internalServerError };
            }
        });
    }
}
const server = new PrivateGPTServer();
// Server läuft
console.log(
    messages[lang].serverRunning
        .replace('${port}', PORT)
);
server.run().catch(console.error);