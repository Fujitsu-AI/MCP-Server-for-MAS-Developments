import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPGetSourceClient {

    public static void main(String[] args) {
        // Minimaler Check: 
        //   --server-ip <IP>
        //   --server-port <PORT>
        //   --token <TOKEN>
        //   --source-id <SOURCE_ID>
        // => Das sind 4 Schlüssel und 4 Werte = 8 Strings im args[]-Array.
        if (args.length < 8) {
            printUsage();
            return;
        }

        String serverIp  = getArgument(args, "--server-ip");
        String portStr   = getArgument(args, "--server-port");
        String token     = getArgument(args, "--token");
        String sourceId  = getArgument(args, "--source-id");

        // Falls eines der erforderlichen Argumente null ist -> Usage
        if (serverIp == null || portStr == null || token == null || sourceId == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sending request to get source information...");

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "get_source");
        payload.put("token", token);

        JSONObject arguments = new JSONObject();
        arguments.put("sourceId", sourceId);

        payload.put("arguments", arguments);

        // Anfrage senden
        String response = sendRequest(serverIp, serverPort, payload);

        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Liest einen Wert für ein bestimmtes Argument (z.B. --server-ip 127.0.0.1).
     * Gibt null zurück, falls das Argument nicht gefunden wird oder kein Wert folgt.
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
     * Baut eine Socket-Verbindung zum Server auf, sendet das JSON-Payload
     * und empfängt die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // JSON-Daten senden
            OutputStream outputStream = client.getOutputStream();
            byte[] data = payloadJson.getBytes(StandardCharsets.UTF_8);
            outputStream.write(data);
            outputStream.flush();

            // Antwort empfangen
            InputStream inputStream = client.getInputStream();
            byte[] buffer = new byte[4096];
            StringBuilder responseBuilder = new StringBuilder();
            int bytesRead;

            do {
                bytesRead = inputStream.read(buffer);
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
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --source-id <SOURCE_ID>");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPGetSourceClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken --source-id 123");
    }
}
