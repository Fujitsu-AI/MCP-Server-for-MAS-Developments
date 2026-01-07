const net = require('net');
const readline = require('readline');
const { argv, exit } = require('process');

// Funktion zum Parsen der Kommandozeilenargumente
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
            default:
                console.warn(`Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

// Funktion zum interaktiven Abfragen des Tokens (optional)
function askToken(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    return new Promise((resolve) => {
        rl.question(query, (token) => {
            rl.close();
            resolve(token);
        });
    });
}

// Funktion zum Senden einer Logout-Anfrage über eine TCP-Verbindung
function sendLogoutRequest(serverIp, serverPort, payload) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = '';

        client.connect(serverPort, serverIp, () => {
            console.log('🔗 Verbindung zum Server hergestellt.');
            client.write(JSON.stringify(payload));
        });

        client.on('data', (data) => {
            responseData += data.toString();
            try {
                const parsedData = JSON.parse(responseData);
                resolve(parsedData);
                client.destroy(); // Verbindung schließen
            } catch (err) {
                // Antwort noch nicht vollständig, weiter empfangen
            }
        });

        client.on('close', () => {
            console.log('🔒 Verbindung zum Server geschlossen.');
        });

        client.on('error', (err) => {
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = argv;
    const parsedArgs = parseArguments(args);
    const { serverIp, serverPort, token } = parsedArgs;

    // Überprüfen, ob alle erforderlichen Parameter außer Token vorhanden sind
    if (!serverIp || !serverPort) {
        console.error('❌ ERROR: Fehlende erforderliche Parameter.');
        console.log('Verwendung: node MCPLogoutClient.js --server-ip <IP> --server-port <Port> --token <Token>');
        exit(1);
    }

    // Token interaktiv abfragen, falls nicht in den Argumenten vorhanden
    let authToken = token;
    if (!authToken) {
        authToken = await askToken('🔒 Bitte gib dein Authentifizierungstoken ein: ');
    }

    const payload = {
        command: "logout",
        token: authToken
    };

    try {
        console.log('🚪 Logging out...');
        const response = await sendLogoutRequest(serverIp, serverPort, payload);
        console.log('✅ Server Response:');
        console.log(JSON.stringify(response, null, 4));
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
}

main();
