import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPListSourcesClient {

    public static void main(String[] args) {
        // Minimaler Check: erwartet 8 Array-Einträge:
        //   --server-ip <IP>
        //   --server-port <PORT>
        //   --token <TOKEN>
        //   --group-name <GROUP_NAME>
        // Macht insgesamt 8 Einzelargumente.
        if (args.length < 8) {
            printUsage();
            return;
        }

        // Argumente parsen
        String serverIp   = getArgument(args, "--server-ip");
        String portStr    = getArgument(args, "--server-port");
        String token      = getArgument(args, "--token");
        String groupName  = getArgument(args, "--group-name");

        // Falls eines der benötigten Argumente nicht vorhanden ist -> Usage
        if (serverIp == null || portStr == null || token == null || groupName == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sending request to list sources...");

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "list_sources");
        payload.put("token", token);

        // attributes
        JSONObject attributes = new JSONObject();
        attributes.put("groupName", groupName);

        payload.put("attributes", attributes);

        // Anfrage senden
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Hilfsmethode zum Auslesen einzelner Argumente
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
     * Stellt eine TCP-Verbindung her, sendet das JSON und empfängt die Antwort
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // JSON-Daten senden
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
     * Gibt die erwartete Verwendung aus
     */
    private static void printUsage() {
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --group-name <GROUP_NAME>");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  java -cp .;json-20241224.jar MCPListSourcesClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken --group-name devops");
    }
}
