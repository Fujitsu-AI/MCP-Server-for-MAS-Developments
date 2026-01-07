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
            case '--source-id':
                parsedArgs.sourceId = args[++i];
                break;
            case '--title':
                parsedArgs.title = args[++i];
                break;
            case '--content':
                parsedArgs.content = args[++i];
                break;
            case '--groups':
                // Sammle alle Gruppenargumente bis zum nächsten Flag oder Ende
                parsedArgs.groups = [];
                while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    parsedArgs.groups.push(args[++i]);
                }
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

// Funktion zum Senden einer Edit-Source-Anfrage über eine TCP-Verbindung
function sendEditSourceRequest(serverIp, serverPort, payload) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let responseData = '';

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
                resolve(parsedData);
                client.destroy(); // Verbindung schließen
            } catch (err) {
                console.warn('⚠️ Antwort noch nicht vollständig oder ungültiges JSON. Weitere Daten werden erwartet.');
                // Antwort noch nicht vollständig, weiter empfangen
            }
        });

        client.on('close', () => {
            console.log('🔒 Verbindung zum Server geschlossen.');
        });

        client.on('error', (err) => {
            console.error('❌ Verbindungsfehler:', err.message);
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = argv;
    const parsedArgs = parseArguments(args);
    let { serverIp, serverPort, token, sourceId, title, content, groups } = parsedArgs;

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
    if (!sourceId) {
        sourceId = await askQuestion('📁 Bitte gib die Source-ID ein: ');
    }

    // Überprüfen, ob mindestens eines der optionalen Parameter vorhanden ist
    if (title === undefined && content === undefined && (groups === undefined || groups.length === 0)) {
        console.warn('⚠️ Keine Änderungsparameter angegeben. Es werden mindestens eines der folgenden benötigt: --title, --content, --groups.');
        exit(1);
    }

    // Optional: Abfrage fehlender optionaler Parameter, wenn entsprechende Flags gesetzt sind
    // Hier gehen wir davon aus, dass --title, --content und --groups bereits korrekt geparst wurden
    // und entweder definiert sind oder nicht angegeben wurden.

    // Entferne unerwünschte Schlüssel mit undefined oder null Werten
    const filteredArguments = {};
    if (sourceId) filteredArguments.sourceId = sourceId;
    if (title) filteredArguments.title = title;
    if (content) filteredArguments.content = content;
    if (groups && groups.length > 0) filteredArguments.groups = groups;

    const payload = {
        command: "edit_source",
        token: token,
        arguments: filteredArguments
    };

    try {
        console.log('🛠️ Sende Edit-Source-Anfrage...');
        const response = await sendEditSourceRequest(serverIp, serverPort, payload);
        console.log('✅ Server Response:');
        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
}

main();
