import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPListGroupsClient {

    public static void main(String[] args) {
        // Minimaler Check: Wir erwarten mindestens 3 "richtige" Parameter
        // (d.h. --server-ip <IP>, --server-port <PORT>, --token <TOKEN>)
        if (args.length < 3 * 2) { // 3 Schlüssel + 3 Werte = 6 Strings
            printUsage();
            return;
        }

        // Argumente auslesen
        String serverIp  = getArgument(args, "--server-ip");
        String portStr   = getArgument(args, "--server-port");
        String token     = getArgument(args, "--token");

        if (serverIp == null || portStr == null || token == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📄 Abrufen der Gruppen...");

        // JSON-Payload erzeugen
        JSONObject payload = new JSONObject();
        payload.put("command", "list_groups");
        payload.put("token", token);

        // Request an den Server senden
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Antwort:");
        System.out.println(response);
    }

    /**
     * Extrahiert den Wert für ein bestimmtes Argument (z.B. --server-ip 127.0.0.1).
     * Gibt null zurück, wenn der Schlüssel nicht gefunden wird oder kein Wert dahinter steht.
     */
    private static String getArgument(String[] args, String key) {
        for (int i = 0; i < args.length - 1; i++) {
            if (args[i].equals(key)) {
                return args[i + 1];
            }
        }
        return null;
    }

    /**
     * Stellt eine Socket-Verbindung her, sendet das JSON und empfängt die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Daten senden
            OutputStream out = client.getOutputStream();
            byte[] data = payloadJson.getBytes(StandardCharsets.UTF_8);
            out.write(data);
            out.flush();

            // Antwort empfangen
            InputStream in = client.getInputStream();
            byte[] buffer = new byte[4096];
            StringBuilder responseBuilder = new StringBuilder();

            int bytesRead;
            do {
                bytesRead = in.read(buffer);
                if (bytesRead > 0) {
                    responseBuilder.append(new String(buffer, 0, bytesRead, StandardCharsets.UTF_8));
                }
            } while (bytesRead == buffer.length);

            return responseBuilder.toString();

        } catch (IOException e) {
            return "Error: " + e.getMessage();
        }
    }

    /**
     * Gibt die erwartete Aufrufstruktur aus.
     */
    private static void printUsage() {
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN>");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  java -cp .;json-20241224.jar MCPListGroupsClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken");
    }
}
