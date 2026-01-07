// logger.js
import winston from 'winston';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-Äquivalent von __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bestimmen Sie den Pfad zur Log-Datei relativ zu `logger.js`
const LOG_FILE_PATH = path.join(__dirname, '../logs/server.log'); // Passen Sie den Pfad nach Bedarf an

// Hilfsfunktionen für Symbole und Farben
function getLevelSymbol(level) {
    const symbols = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        debug: '🐞',
    };
    return symbols[level] || '';
}

function chalkForLevel(level) {
    const levels = {
        info: chalk.blue,
        warn: chalk.yellow,
        error: chalk.red,
        debug: chalk.green,
    };
    return levels[level] || chalk.white;
}

// Variable zur Steuerung der Dateiausgabe
let allowWrittenLogfile = false;

// Initialisieren der Transports mit nur der Konsolenausgabe
const transports = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message }) => {
                const symbol = getLevelSymbol(level);
                const coloredMessage = `${chalkForLevel(level)(symbol)} ${message}`;
                return `${timestamp} | ${coloredMessage}`;
            })
        ),
    }),
];

// Erstellen des Winston-Loggers
const logger = winston.createLogger({
    level: 'info',
    transports: transports,
});

/**
 * Funktion zum Hinzufügen des File-Transports
 */
function addFileTransport() {
    const logDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const fileTransport = new winston.transports.File({
        filename: LOG_FILE_PATH,
        level: 'info', // Stellen Sie sicher, dass der Level ausreichend niedrig ist
        maxsize: 10485760, // 10 MB pro Datei
        maxFiles: 5, // Maximal 5 Dateien
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message }) => {
                const symbol = getLevelSymbol(level);
                const plainMessage = stripAnsi(`${symbol} ${message}`); // ANSI-Codes entfernen
                return `${timestamp} | ${plainMessage}`;
            })
        ),
    });

    // Fehler-Handler hinzufügen
    fileTransport.on('error', (error) => {
        console.error(chalk.red('File-Transport Fehler:'), error);
    });

    // Prüfen, ob der Transport bereits hinzugefügt wurde, um Duplikate zu vermeiden
    if (!logger.transports.some(t => t instanceof winston.transports.File)) {
        logger.add(fileTransport);
    }
}

/**
 * Funktion zum Entfernen des File-Transports
 */
function removeFileTransport() {
    const fileTransport = logger.transports.find(
        (t) => t instanceof winston.transports.File
    );
    if (fileTransport) {
        logger.remove(fileTransport);
    }
}

/**
 * Funktion zum Setzen von allowWrittenLogfile
 * @param {boolean} value - true, um Dateilogs zu erlauben; false, um sie zu deaktivieren
 */
function setAllowWrittenLogfile(value) {
    allowWrittenLogfile = value;
    if (allowWrittenLogfile) {
        addFileTransport();
        logEvent('system', 'wrlog', 'File logs activated.', 'File logs are now activated.', 'info');
        
        // Überprüfen, ob der File-Transport hinzugefügt wurde
        const fileTransport = logger.transports.find(t => t instanceof winston.transports.File);
        if (fileTransport) {
            // console.log(chalk.green('File-Transport erfolgreich hinzugefügt.'));
        } else {
            console.log(chalk.red('Error: File transport could not be added.'));
        }
    } else {
        removeFileTransport();
        logEvent('system', 'wrlog', 'File logs deactivated.', 'File logs are now deactivated.', 'info');
    }
}

/**
 * Zentrale Logging-Funktion
 * @param {string} clientIP - IP-Adresse des Clients
 * @param {number|string} clientPort - Port des Clients
 * @param {string} functionName - Name der aufgerufenen Funktion
 * @param {string|object} status - Status der Rückmeldung
 * @param {string} level - Log-Level ('info', 'warn', 'error', 'debug')
 */
function logEvent(clientIP, clientPort, functionName, status, level = 'info') {
    // Kürzen und formatieren der Felder
    const ip = String(clientIP || 'N/A').padEnd(23).substring(0, 23); // Mindestens 8 Zeichen für die IP
    const port = String(clientPort || 'N/A').padEnd(5).substring(0, 5); // 5 Zeichen für den Port
    const func = String(functionName || 'N/A').padEnd(26).substring(0, 26); // 20 Zeichen für den Funktionsnamen
    const stat = String(status || '').padEnd(120).substring(0, 120); // 100 Zeichen für den Status

    // Formatierte Logzeile
    const logLine = `${ip}:${port} | ${func} | ${stat}`;
    // Log-Ausgabe basierend auf dem Level
    logger.log({ level, message: logLine });
}


export { logger, logEvent, setAllowWrittenLogfile, LOG_FILE_PATH };
