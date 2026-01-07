import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class MCPContinueChatClient {

    public static void main(String[] args) {
        // Minimalprüfung, ob genug Argumente vorhanden sind.
        // (Die genaue Prüfung folgt unten, falls einzelne Argumente fehlen.)
        if (args.length < 6) {
            printUsage();
            return;
        }

        String serverIp       = getArgument(args, "--server-ip");
        String serverPortStr  = getArgument(args, "--server-port");
        String token          = getArgument(args, "--token");
        String conversationId = getArgument(args, "--conversation-id");
        String message        = getArgument(args, "--message");

        // Ggf. fehlende Argumente prüfen
        if (serverIp == null || serverPortStr == null || token == null 
                || conversationId == null || message == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(serverPortStr);

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "continue_chat");
        payload.put("token", token);

        JSONObject arguments = new JSONObject();
        arguments.put("chatId", conversationId);
        arguments.put("question", message);

        payload.put("arguments", arguments);

        System.out.println("📤 Sending request to continue chat...");
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Hilfsmethode, um ein bestimmtes Argument aus dem args-Array auszulesen.
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
     * Sendet das JSON-Payload an den MCP-Server und empfängt die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Sende das Payload
            OutputStream out = client.getOutputStream();
            byte[] data = payloadJson.getBytes(StandardCharsets.UTF_8);
            out.write(data);
            out.flush();

            // Empfang der Antwort
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
            // Im Fehlerfall geben wir ein JSON mit "status" = "error" zurück,
            // analog zum C#-Beispiel mit JsonConvert.
            JSONObject errorJson = new JSONObject();
            errorJson.put("status", "error");
            errorJson.put("message", e.getMessage());
            return errorJson.toString();
        }
    }

    private static void printUsage() {
        System.out.println("Usage: ");
        System.out.println("  --server-ip <IP> --server-port <PORT> --token <TOKEN>");
        System.out.println("  --conversation-id <ID> --message <MESSAGE>");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  java -cp .;json-20241224.jar MCPContinueChatClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken \\");
        System.out.println("       --conversation-id xyz123 --message \"Gibt es ein Update?\"");
    }
}
