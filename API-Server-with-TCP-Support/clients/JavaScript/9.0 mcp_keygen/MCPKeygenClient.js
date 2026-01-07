const net = require("net");
const { argv } = require("process");

/**
 * Funktion zum Parsen der Kommandozeilenargumente
 * @param {string[]} args - Array von Kommandozeilenargumenten
 * @returns {Object} - Objekt mit geparsten Argumenten
 */
function parseArguments(args) {
    const parsedArgs = {};
    for (let i = 2; i < args.length; i++) {
        switch (args[i]) {
            case "--server-ip":
                parsedArgs.serverIp = args[++i];
                break;
            case "--server-port":
                parsedArgs.serverPort = parseInt(args[++i], 10);
                break;
            case "--token":
                parsedArgs.token = args[++i];
                break;
            case "--password":
                parsedArgs.password = args[++i];
                break;
            default:
                console.warn(`⚠️ Unbekanntes Argument: ${args[i]}`);
        }
    }
    return parsedArgs;
}

/**
 * Sendet eine Keygen-Anfrage an den MCP-Server.
 *
 * @param {string} serverIp - IP-Adresse des MCP-Servers
 * @param {number} serverPort - Portnummer des MCP-Servers
 * @param {string} token - Authentifizierungstoken
 * @param {string} password - Passwort für die Schlüsselgenerierung
 * @returns {Promise<Object>} - Antwort vom Server
 */
function sendKeygenRequest(serverIp, serverPort, token, password) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const payload = {
            command: "keygen",
            token: token,
            arguments: {
                password: password
            }
        };
        const payloadString = JSON.stringify(payload);

        // Timeout setzen
        const TIMEOUT_DURATION = 10000; // 10 Sekunden
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error("Verbindungs-Timeout: Der Server hat nicht rechtzeitig geantwortet."));
        }, TIMEOUT_DURATION);

        client.connect(serverPort, serverIp, () => {
            console.log(`🔗 Verbindung zum Server (${serverIp}:${serverPort}) hergestellt.`);
            console.log(`📤 Sende Payload: ${payloadString}`);
            client.write(payloadString);
        });

        let responseData = "";

        client.on("data", (data) => {
            responseData += data.toString();
            try {
                const parsedData = JSON.parse(responseData);
                clearTimeout(timeout);
                resolve(parsedData);
                client.destroy();
            } catch (e) {
                console.warn("⚠️ Antwort ist noch unvollständig, warte auf weitere Daten...");
                // Weiter empfangen, falls JSON unvollständig ist
            }
        });

        client.on("close", () => {
            console.log("🔒 Verbindung zum Server geschlossen.");
        });

        client.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

// Hauptfunktion
async function main() {
    const args = parseArguments(argv);

    if (!args.serverIp || !args.serverPort || !args.token || !args.password) {
        console.error("❌ Fehler: --server-ip, --server-port, --token und --password sind erforderlich.");
        console.log("📖 Beispiel: node MCPKeygenClient.js --server-ip 192.168.0.1 --server-port 5000 --token YOUR_AUTH_TOKEN --password YourPassword");
        process.exit(1);
    }

    try {
        console.log("🔑 Sende Keygen-Anfrage...");
        const response = await sendKeygenRequest(args.serverIp, args.serverPort, args.token, args.password);
        console.log("✔️ Antwort vom Server:", JSON.stringify(response, null, 2));
    } catch (err) {
        console.error("❌ Fehler bei der Keygen-Anfrage:", err.message);
    }
}

main();
