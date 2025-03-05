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
                console.warn(`⚠️ Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

// Funktion zum interaktiven Abfragen eines Parameters (optional)
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

// Funktion zum Senden einer generischen Anfrage über eine TCP-Verbindung
function sendRequest(serverIp, serverPort, payload) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = '';
        const TIMEOUT_DURATION = 10000; // 10 Sekunden

        // Setze einen Timeout
        const timeout = setTimeout(() => {
            client.destroy(); // Zerstöre die Verbindung
            reject(new Error('Verbindungs-Timeout: Der Server hat nicht rechtzeitig geantwortet.'));
        }, TIMEOUT_DURATION);

        client.connect(serverPort, serverIp, () => {
            console.log(`🔗 Verbindung zum Server (${serverIp}:${serverPort}) hergestellt.`);
            const payloadString = JSON.stringify(payload);
            console.log(`📤 Sende Payload: ${payloadString}`);
            client.write(payloadString);
        });

        client.on('data', (data) => {
            console.log(`📥 Empfangene Daten: ${data}`);
            responseData += data.toString();
            try {
                const parsedData = JSON.parse(responseData);
                console.log('✅ JSON-Antwort erfolgreich geparst.');
                clearTimeout(timeout); // Entferne den Timeout
                resolve(parsedData);
                client.destroy(); // Verbindung schließen
            } catch (err) {
                console.warn('⚠️ Antwort noch nicht vollständig oder ungültiges JSON. Weitere Daten werden erwartet.');
                // Antwort noch nicht vollständig, weiter empfangen
            }
        });

        client.on('close', () => {
            console.log('🔒 Verbindung zum Server geschlossen.');
            clearTimeout(timeout); // Entferne den Timeout
        });

        client.on('error', (err) => {
            console.error('❌ Verbindungsfehler:', err.message);
            clearTimeout(timeout); // Entferne den Timeout
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = argv;
    const parsedArgs = parseArguments(args);
    let { serverIp, serverPort, token } = parsedArgs;

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

    const payload = {
        command: "list_groups",
        token: token
    };

    try {
        console.log('📄 Abrufen der Gruppen...');
        const response = await sendRequest(serverIp, serverPort, payload);
        console.log('✔️ Antwort:', JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
}

main();
