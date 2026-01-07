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
            case '--email':
                parsedArgs.email = args[++i];
                break;
            case '--password':
                parsedArgs.password = args[++i];
                break;
            default:
                console.warn(`Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

// Funktion zum Senden einer Anfrage über eine TCP-Verbindung
function sendRequest(serverIp, serverPort, payload) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = '';

        client.connect(serverPort, serverIp, () => {
            console.log('🔗 Verbindung zum Server hergestellt.');
            client.write(JSON.stringify(payload));
        });

        client.on('data', (data) => {
            responseData += data.toString();
            // Versuche, die empfangenen Daten als JSON zu parsen
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

// Funktion zum interaktiven Abfragen des Passworts (optional)
function askPassword(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    return new Promise((resolve) => {
        rl.question(query, (password) => {
            rl.close();
            resolve(password);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = argv;
    const { serverIp, serverPort, email, password } = parseArguments(args);

    // Überprüfen, ob alle erforderlichen Parameter vorhanden sind
    if (!serverIp || !serverPort || !email || !password) {
        console.error('❌ ERROR: Fehlende erforderliche Parameter.');
        console.log('Verwendung: node MCPLoginClient.js --server-ip <IP> --server-port <Port> --email <Email> --password <Passwort>');
        exit(1);
    }

    const payload = {
        command: "login",
        arguments: {
            email: email,
            password: password
        }
    };

    try {
        console.log('🔐 Logging in...');
        const response = await sendRequest(serverIp, serverPort, payload);
        console.log('✅ Server Response:');
        console.log(JSON.stringify(response, null, 4));
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
}

main();
