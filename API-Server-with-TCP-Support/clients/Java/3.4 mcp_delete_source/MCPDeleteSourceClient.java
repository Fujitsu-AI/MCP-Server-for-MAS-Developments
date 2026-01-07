import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPDeleteSourceClient {

    public static void main(String[] args) {
        // Minimaler Check, ob genügend Argumente übergeben wurden
        if (args.length < 4) {
            printUsage();
            return;
        }

        String serverIp    = getArgument(args, "--server-ip");
        String portStr     = getArgument(args, "--server-port");
        String token       = getArgument(args, "--token");
        String sourceId    = getArgument(args, "--source-id");

        // Wenn eines der erforderlichen Argumente null ist, Usage anzeigen
        if (serverIp == null || portStr == null || token == null || sourceId == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sending request to delete source...");

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "delete_source");
        payload.put("token", token);

        JSONObject arguments = new JSONObject();
        arguments.put("sourceId", sourceId);

        payload.put("arguments", arguments);

        // Anfrage an den Server schicken
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Liest den Wert eines Arguments aus (z.B. --server-ip 127.0.0.1).
     * Gibt null zurück, wenn der Schlüssel nicht gefunden wurde.
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
     * Baut eine TCP-Verbindung zum Server auf, sendet das JSON-Payload
     * und empfängt die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Payload senden
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

    private static void printUsage() {
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> "
                         + "--token <TOKEN> --source-id <SOURCE_ID>");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPDeleteSourceClient "
                         + "--server-ip 127.0.0.1 --server-port 1234 "
                         + "--token MyToken --source-id 12345");
    }
}
