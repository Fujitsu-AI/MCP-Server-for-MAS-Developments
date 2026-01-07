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
            case '--group-name':
                if (i + 1 < args.length) {
                    parsedArgs.groupName = args[++i];
                } else {
                    console.warn('⚠️ Kein Wert für --group-name angegeben.');
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
 * Sendet eine Anfrage an den MCP-Server, um eine bestehende Gruppe zu löschen.
 *
 * @param {string} serverIp - IP-Adresse des MCP-Servers
 * @param {number} serverPort - Portnummer des MCP-Servers
 * @param {string} token - Authentifizierungstoken
 * @param {string} groupName - Name der zu löschenden Gruppe
 * @returns {Promise<Object>} - Antwort vom Server
 */
function sendDeleteGroupRequest(serverIp, serverPort, token, groupName) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const payload = {
            command: "delete_group",
            token: token,
            arguments: {
                groupName: groupName
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
    let { serverIp, serverPort, token, groupName } = parsedArgs;

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
    if (!groupName) {
        groupName = await askQuestion('👥 Bitte gib den Namen der Gruppe ein: ');
    }

    const payload = {
        command: "delete_group",
        token: token,
        arguments: {
            groupName: groupName
        }
    };

    try {
        console.log('🗑️ Sende Delete-Group-Anfrage...');
        const response = await sendDeleteGroupRequest(serverIp, serverPort, token, groupName);
        console.log('✔️ Antwort vom Server:', JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ Fehler:', err.message);
    }
}

main();
