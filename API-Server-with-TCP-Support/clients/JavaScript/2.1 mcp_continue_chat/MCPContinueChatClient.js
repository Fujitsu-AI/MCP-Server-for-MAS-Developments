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
            case '--conversation-id':
                parsedArgs.conversationId = args[++i];
                break;
            case '--message':
                parsedArgs.message = args[++i];
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

// Funktion zum Senden einer Continue-Chat-Anfrage über eine TCP-Verbindung
function sendContinueChatRequest(serverIp, serverPort, payload) {
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
    const { serverIp, serverPort, token, conversationId, message } = parsedArgs;

    // Überprüfen, ob alle erforderlichen Parameter vorhanden sind
    if (!serverIp || !serverPort || !token || !conversationId || !message) {
        console.error('❌ ERROR: Fehlende erforderliche Parameter.');
        console.log('Verwendung: node MCPContinueChatClient.js --server-ip <IP> --server-port <Port> --token <Token> --conversation-id <ConversationID> --message <Nachricht>');
        exit(1);
    }

    const payload = {
        command: "continue_chat",
        token: token,
        arguments: {
            chatId: conversationId,
            question: message
        }
    };

    try {
        console.log('💬 Sende Continue-Chat-Anfrage...');
        const response = await sendContinueChatRequest(serverIp, serverPort, payload);
        console.log('✅ Server Response:');
        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
}

main();
