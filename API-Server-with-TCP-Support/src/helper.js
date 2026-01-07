// helper.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logEvent } from './logger.js';
import { messages } from './pgpt-messages.js';

/**
 * Lädt die Umgebungsvariablen aus der JSON-Datei.
 * @param {string} envFilePath - Der Pfad zur JSON-Umgebungsdatei.
 * @returns {object} - Das geladene Konfigurationsobjekt.
 */
function loadEnvConfig(envFilePath) {
    try {
        const config = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'));
        return config;
    } catch (error) {
        logEvent('system', 'N/A', 'Env Load Err', error.message, 'error');
        process.exit(1);
    }
}

/**
 * Funktion zum Abrufen von Umgebungsvariablen mit optionalem verschachteltem Pfad und Fallback.
 * @param {object} envConfig - Das Konfigurationsobjekt.
 * @param {string} key - Der Schlüssel der Umgebungsvariable.
 * @param {Array<string>} [nestedPath=null] - Ein optionaler verschachtelter Pfad.
 * @param {any} [fallback=null] - Ein optionaler Fallback-Wert.
 * @param {string} lang - Die gewählte Sprache.
 * @returns {any} - Der Wert der Umgebungsvariable oder der Fallback-Wert.
 */
function getEnvVar(envConfig, key, nestedPath = null, fallback = null, lang = 'en') {
    const t = messages[lang];
    // Prüfen, ob ein verschachtelter Pfad angegeben ist
    if (nestedPath) {
        const value = nestedPath.reduce((acc, part) => acc && acc[part], envConfig);
        if (value === undefined || value === null) {
            if (fallback !== null) return fallback;
            logEvent(
                'system',
                'N/A',
                'Missing Config',
                t.missingConfigError.replace('${key}', key),
                'error'
            );
            process.exit(1);
        }
        return value;
    }
    // Direkter Zugriff
    if (envConfig[key] === undefined || envConfig[key] === null) {
        if (fallback !== null) return fallback;
        logEvent('system', 'N/A', 'Missing Config', `Missing .json configuration variable: ${key}`, 'error');
        process.exit(1);
    }
    return envConfig[key];
}

/**
 * Funktion zur Pfad-Expansion.
 * @param {string} filePath - Der zu erweiternde Pfad.
 * @returns {string} - Der erweiterte Pfad.
 */
function expandPath(filePath) {
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

/**
 * Validiert eine URL und passt sie gegebenenfalls an.
 * @param {string} url - Die zu validierende URL.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @returns {string} - Die validierte und ggf. angepasste URL.
 */
function validateUrl(url, t) {
    if (!url.startsWith('https://')) {
        logEvent('system', 'N/A', 'URL Warning', t.apiUrlWarning, 'warn');
        url = url.replace(/^http:\/\//, 'https://');
    }
    url = url.replace(/([^:]\/)\/+/g, '$1'); // Doppelte Schrägstriche nach "://" entfernen
    if (!url.endsWith('/api/v1')) {
        logEvent('system', 'N/A', 'URL Warning V1', t.apiUrlWarningV1, 'warn');
        url = `${url.replace(/\/$/, '')}/api/v1`;
    }
    try {
        new URL(url);
    } catch {
        logEvent('system', 'N/A', 'URL Invalid', `${t.apiUrlInvalid} ${url}`, 'error');
        process.exit(1);
    }
    return url;
}

/**
 * Validiert einen Port.
 * @param {string} port - Der zu validierende Port.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @returns {number} - Der validierte Port.
 */
function validatePort(port, t) {
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
        logEvent('system', 'N/A', 'Port Invalid', t.portInvalid, 'error');
        process.exit(1);
    }
    return portNumber;
}

/**
 * Validiert einen booleschen Wert.
 * @param {string} varName - Der Name der Variable.
 * @param {string} value - Der zu validierende Wert.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @param {boolean} [useProxy=false] - Ob eine Proxy-Verwendung erfolgt.
 * @returns {boolean} - Der validierte boolesche Wert.
 */
function validateBoolean(varName, value, t, useProxy = false) {
    if (useProxy && (varName === 'HEADER_ENCRYPTED')) {
        if (value !== 'true' && value !== 'false') {
            logEvent('system', 'N/A', 'Validation Err',
                t.validationError.replace('${var}', varName).replace('${value}', value), 'error');
            process.exit(1);
        }
        return value === 'true';
    }
    // Allgemeine Validierung
    if (value !== 'true' && value !== 'false') {
        logEvent('system', 'N/A', 'Validation Err',
            t.validationError.replace('${var}', varName).replace('${value}', value), 'error');
        process.exit(1);
    }
    return value === 'true';
}

/**
 * Entschlüsselt eine verschlüsselte Zeichenkette mit dem privaten Schlüssel.
 * @param {string} encryptedData - Die verschlüsselte Zeichenkette im Base64-Format.
 * @param {string} privateKey - Der private Schlüssel.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @returns {string} - Das entschlüsselte Passwort.
 */
function decryptPassword(encryptedData, privateKey, t) {
    try {
        const decryptedPassword = crypto.privateDecrypt(
            {
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_PADDING, // Konsistentes Padding sicherstellen
            },
            Buffer.from(encryptedData, 'base64')
        ).toString('utf8');

        return decryptedPassword;
    } catch (error) {
        logEvent('system', 'N/A', 'Decryption Error', t.decryptionError, 'error');
        throw new Error(t.decryptPwdError);
    }
}

/**
 * Verschlüsselt Daten mit dem öffentlichen Schlüssel.
 * @param {string} data - Die zu verschlüsselnden Daten.
 * @param {string} publicKey - Der öffentliche Schlüssel.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @returns {string} - Die verschlüsselten Daten als Base64-String.
 */
function encryptWithPublicKey(data, publicKey, t) {
    try {
        return crypto.publicEncrypt(
            {
                key: publicKey,
                padding: crypto.constants.RSA_PKCS1_PADDING, // Padding explizit setzen
            },
            Buffer.from(data)
        ).toString('base64');
    } catch (err) {
        logEvent('system', 'N/A', 'Encryption Error', t.encryptionError, 'error');
        throw new Error(t.encryptPwdError);
    }
}

/**
 * Verschlüsselt ein gegebenes Passwort und gibt den verschlüsselten Schlüssel zurück.
 * @param {string} password - Das zu verschlüsselnde Passwort.
 * @param {string} publicKey - Der öffentliche Schlüssel.
 * @param {object} t - Die Übersetzungen basierend auf der Sprache.
 * @returns {string} - Das verschlüsselte Passwort als Base64-String.
 */
function getEncryptedKey(password, publicKey, t) {
    try {
        return encryptWithPublicKey(password, publicKey, t);
    } catch (err) {
        // Fehlerbehandlung wurde bereits in encryptWithPublicKey durchgeführt
        throw err;
    }
}

/**
 * Prüft, ob ein bestimmtes Tool aktiviert ist.
 * @param {string} toolName - Der Name des Tools.
 * @param {object} envConfig - Die Umgebungs-Konfigurationsdaten.
 * @param {boolean} AllowKeygen - Ob Keygen erlaubt ist.
 * @param {string} lang - Die ausgewählte Sprache.
 * @returns {object|null} - Gibt einen Fehler zurück, wenn das Tool deaktiviert ist, sonst null.
 */
function checkToolEnabled(toolName, envConfig, AllowKeygen, lang) {
    const t = messages[lang];
    if (toolName === "keygen" && AllowKeygen) {
        return null;
    }

    if (!isToolEnabled(toolName, envConfig, lang)) {
        logEvent(
            'system', 'N/A', 'Tool Disabled', t.toolDisabledLog.replace('${toolName}', toolName), 'error'
        );
        return {
            status: 'error',
            message: messages[lang].toolDisabledError.replace('${toolName}', toolName),
        };
    }
    return null; // Tool ist aktiviert
}

/**
 * Prüft, ob ein bestimmtes Tool aktiviert ist.
 * @param {string} toolName - Der Name des Tools.
 * @param {object} envConfig - Die Umgebungs-Konfigurationsdaten.
 * @param {string} lang - Die ausgewählte Sprache.
 * @returns {boolean} - Gibt true zurück, wenn das Tool aktiviert ist, sonst false.
 */
function isToolEnabled(toolName, envConfig, lang) {
    const envKey = `ENABLE_${toolName.toUpperCase()}`;
    if (!(envKey in envConfig.Functions)) {
        logEvent(
            'system', 'N/A', 'Tool Warn', messages[lang].toolNotDefinedInConfig.replace('${toolName}', toolName), 'warn'
        );
        return false;
    }
    return envConfig.Functions[envKey] === true;
}

export {
    loadEnvConfig,
    getEnvVar,
    expandPath,
    validateUrl,
    validatePort,
    validateBoolean,
    decryptPassword,
    encryptWithPublicKey,
    getEncryptedKey,
    checkToolEnabled,
    isToolEnabled
};
