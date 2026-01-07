const net = require('net');
const readline = require('readline');
const { argv } = require('process');

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
                parsedArgs.serverIp = args[++i];
                break;
            case '--server-port':
                parsedArgs.serverPort = parseInt(args[++i], 10);
                break;
            case '--token':
                parsedArgs.token = args[++i];
                break;
            case '--name':
                parsedArgs.name = args[++i];
                break;
            case '--email':
                parsedArgs.email = args[++i];
                break;
            case '--password':
                parsedArgs.password = args[++i];
                break;
            case '--language':
                parsedArgs.language = args[++i];
                break;
            case '--timezone':
                parsedArgs.timezone = args[++i];
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
                parsedArgs.ftpPassword = args[++i];
                break;
            default:
                console.warn(`⚠️ Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

/**
 * Sendet eine Anfrage an den MCP-Server, um einen Benutzer zu bearbeiten.
 *
 * @param {string} serverIp - IP-Adresse des MCP-Servers
 * @param {number} serverPort - Portnummer des MCP-Servers
 * @param {string} token - Authentifizierungstoken
 * @param {Object} args - Argumente für den zu bearbeitenden Benutzer
 * @returns {Promise<string>} - Antwort vom Server
 */
function sendEditUserRequest(serverIp, serverPort, token, args) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const payload = {
            command: "edit_user",
            token: token,
            arguments: {
                name: args.name,
                email: args.email,
                password: args.password,
                language: args.language,
                timezone: args.timezone,
                roles: args.roles || [],
                groups: args.groups || [],
                usePublic: args.usePublic || false,
                activateFtp: args.activateFtp || false,
                ftpPassword: args.ftpPassword
            }
        };

        // Entferne Null- oder undefined-Werte
        payload.arguments = Object.fromEntries(Object.entries(payload.arguments).filter(([_, v]) => v != null));

        const payloadString = JSON.stringify(payload);

        // Timeout setzen
        const TIMEOUT_DURATION = 10000; // 10 Sekunden
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Verbindungs-Timeout: Der Server hat nicht rechtzeitig geantwortet.'));
        }, TIMEOUT_DURATION);

        client.connect(serverPort, serverIp, () => {
            console.log(`🔗 Verbindung zum Server (${serverIp}:${serverPort}) hergestellt.`);
            console.log(`📤 Sende Payload: ${payloadString}`);
            client.write(payloadString);
        });

        let responseData = '';

        client.on('data', (data) => {
            responseData += data.toString();
            try {
                const parsedData = JSON.parse(responseData);
                clearTimeout(timeout);
                resolve(parsedData);
                client.destroy();
            } catch (e) {
                // Weiter empfangen, falls JSON unvollständig ist
            }
        });

        client.on('close', () => {
            console.log('🔒 Verbindung zum Server geschlossen.');
        });

        client.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = parseArguments(argv);

    if (!args.serverIp || !args.serverPort || !args.token) {
        console.error('❌ Fehler: --server-ip, --server-port und --token sind erforderlich.');
        console.log('📖 Beispiel: node MCPEditUserClient.js --server-ip 192.168.0.1 --server-port 5000 --token YOUR_AUTH_TOKEN');
        process.exit(1);
    }

    try {
        console.log('🧑‍💻 Sende Edit-User-Anfrage...');
        const response = await sendEditUserRequest(
            args.serverIp,
            args.serverPort,
            args.token,
            args
        );
        console.log('✔️ Antwort vom Server:', JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ Fehler beim Bearbeiten des Benutzers:', err.message);
    }
}

main();
