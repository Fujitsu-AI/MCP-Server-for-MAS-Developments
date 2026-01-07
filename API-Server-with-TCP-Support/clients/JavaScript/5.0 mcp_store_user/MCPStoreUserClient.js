const net = require('net');
const readline = require('readline');
const { argv, exit } = require('process');

/**
 * Funktion zum Parsen der Kommandozeilenargumente
 * @param {string[]} args - Array von Kommandozeilenargumenten
 * @returns {Object} - Objekt mit geparsten Argumenten
 */
function parseArguments(args) {
    const parsedArgs = {};
    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case '--server-ip':
                if (i + 1 < args.length) {
                    parsedArgs.serverIp = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --server-ip angegeben.');
                }
                break;
            case '--server-port':
                if (i + 1 < args.length) {
                    parsedArgs.serverPort = parseInt(args[++i], 10);
                } else {
                    console.warn('⚠️ Kein Wert für --server-port angegeben.');
                }
                break;
            case '--token':
                if (i + 1 < args.length) {
                    parsedArgs.token = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --token angegeben.');
                }
                break;
            case '--name':
                if (i + 1 < args.length) {
                    parsedArgs.name = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --name angegeben.');
                }
                break;
            case '--email':
                if (i + 1 < args.length) {
                    parsedArgs.email = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --email angegeben.');
                }
                break;
            case '--password':
                if (i + 1 < args.length) {
                    parsedArgs.password = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --password angegeben.');
                }
                break;
            case '--language':
                if (i + 1 < args.length) {
                    parsedArgs.language = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --language angegeben.');
                }
                break;
            case '--timezone':
                if (i + 1 < args.length) {
                    parsedArgs.timezone = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --timezone angegeben.');
                }
                break;
            case '--roles':
                parsedArgs.roles = [];
                while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    parsedArgs.roles.push(args[++i]);
                }
                break;
            case '--groups':
                parsedArgs.groups = [];
                while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    parsedArgs.groups.push(args[++i]);
                }
                break;
            case '--usePublic':
                parsedArgs.usePublic = true;
                break;
            case '--activateFtp':
                parsedArgs.activateFtp = true;
                break;
            case '--ftpPassword':
                if (i + 1 < args.length) {
                    parsedArgs.ftpPassword = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --ftpPassword angegeben.');
                }
                break;
            default:
                console.warn(`⚠️ Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

/**
 * Funktion zum interaktiven Abfragen eines Parameters (optional)
 * @param {string} query - Frage an den Benutzer
 * @returns {Promise<string>} - Antwort des Benutzers
 */
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Sendet eine Anfrage an den MCP-Server, um einen neuen Benutzer zu erstellen.
 *
 * @param {string} serverIp - IP-Adresse des MCP-Servers
 * @param {number} serverPort - Portnummer des MCP-Servers
 * @param {string} token - Authentifizierungstoken
 * @param {string} name - Name des neuen Benutzers
 * @param {string} email - Email des neuen Benutzers
 * @param {string} password - Passwort für den neuen Benutzer
 * @param {string} language - Bevorzugte Sprache des neuen Benutzers
 * @param {string} timezone - Zeitzone des neuen Benutzers
 * @param {string[]} roles - Rollen des neuen Benutzers
 * @param {string[]} groups - Gruppen des neuen Benutzers
 * @param {boolean} usePublic - Verwendung der öffentlichen Wissensbasis
 * @param {boolean} activateFtp - Aktivierung von FTP für den Benutzer
 * @param {string} ftpPassword - FTP-Passwort für den Benutzer
 * @returns {Promise<Object>} - Antwort vom Server
 */
function sendStoreUserRequest(serverIp, serverPort, token, name, email, password, language, timezone, roles, groups, usePublic, activateFtp, ftpPassword) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const payload = {
            command: "store_user",
            token: token,
            arguments: {
                name: name,
                email: email,
                password: password,
                language: language,
                timezone: timezone,
                roles: roles,
                groups: groups,
                usePublic: usePublic,
                activateFtp: activateFtp,
                ftpPassword: ftpPassword
            }
        };
        const payloadString = JSON.stringify(payload);

        // Timeout setzen (optional)
        const TIMEOUT_DURATION = 10000; // 10 Sekunden
        const timeout = setTimeout(() => {
            client.destroy(); // Verbindung zerstören
            reject(new Error('Verbindungs-Timeout: Der Server hat nicht rechtzeitig geantwortet.'));
        }, TIMEOUT_DURATION);

        client.connect(serverPort, serverIp, () => {
            console.log(`🔗 Verbindung zum Server (${serverIp}:${serverPort}) hergestellt.`);
            console.log(`📤 Sende Payload: ${payloadString}`);
            client.write(payloadString);
        });

        let responseData = '';

        client.on('data', (data) => {
            console.log(`📥 Empfangene Daten: ${data}`);
            responseData += data.toString();
            try {
                const parsedData = JSON.parse(responseData);
                console.log('✅ JSON-Antwort erfolgreich geparst.');
                clearTimeout(timeout);
                resolve(parsedData);
                client.destroy(); // Verbindung schließen
            } catch (err) {
                console.warn('⚠️ Antwort noch nicht vollständig oder ungültiges JSON. Weitere Daten werden erwartet.');
                // Weiter empfangen
            }
        });

        client.on('close', () => {
            console.log('🔒 Verbindung zum Server geschlossen.');
            clearTimeout(timeout);
        });

        client.on('error', (err) => {
            console.error('❌ Verbindungsfehler:', err.message);
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = argv;
    const parsedArgs = parseArguments(args);
    let { 
        serverIp, 
        serverPort, 
        token, 
        name, 
        email, 
        password, 
        language, 
        timezone, 
        roles, 
        groups, 
        usePublic, 
        activateFtp, 
        ftpPassword 
    } = parsedArgs;

    // Überprüfen, ob alle erforderlichen Parameter vorhanden sind, sonst interaktiv abfragen
    if (!serverIp) {
        serverIp = await askQuestion('🔗 Bitte gib die Server-IP ein: ');
    }
    if (!serverPort) {
        const portInput = await askQuestion('🔗 Bitte gib den Server-Port ein: ');
        serverPort = parseInt(portInput, 10);
    }
    if (!token) {
        token = await askQuestion('🔒 Bitte gib dein Authentifizierungstoken ein: ');
    }
    if (!name) {
        name = await askQuestion('👤 Bitte gib den Namen des Benutzers ein: ');
    }
    if (!email) {
        email = await askQuestion('📧 Bitte gib die Email des Benutzers ein: ');
    }
    if (!password) {
        password = await askQuestion('🔑 Bitte gib das Passwort des Benutzers ein: ');
    }
    if (!language) {
        language = await askQuestion('🌐 Bitte gib die bevorzugte Sprache des Benutzers ein (z.B. en, de): ');
    }
    if (!timezone) {
        timezone = await askQuestion('🕰️ Bitte gib die Zeitzone des Benutzers ein (z.B. Europe/Berlin): ');
    }
    // Rollen und Gruppen sind optional und wurden bereits mit parseArguments behandelt
    // usePublic, activateFtp und ftpPassword sind ebenfalls optional

    // Standardwerte für optionale Parameter setzen, falls sie nicht vorhanden sind
    roles = roles || [];
    groups = groups || [];
    usePublic = usePublic || false;
    activateFtp = activateFtp || false;
    ftpPassword = ftpPassword || '';

    try {
        console.log('🧑‍💻 Sende Store-User-Anfrage...');
        const response = await sendStoreUserRequest(
            serverIp,
            serverPort,
            token,
            name,
            email,
            password,
            language,
            timezone,
            roles,
            groups,
            usePublic,
            activateFtp,
            ftpPassword
        );
        console.log('✔️ Antwort vom Server:', JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ Fehler:', err.message);
    }
}

main();
