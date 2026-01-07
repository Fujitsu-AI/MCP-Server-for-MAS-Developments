import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPGetChatInfoClient {

    public static void main(String[] args) {
        // Wir erwarten mindestens 4 Schlüssel-Werte-Paare:
        //   --server-ip <IP>
        //   --server-port <PORT>
        //   --token <TOKEN>
        //   --chat-id <CHAT_ID>
        if (args.length < 8) {
            printUsage();
            return;
        }

        String serverIp = getArgument(args, "--server-ip");
        String portStr  = getArgument(args, "--server-port");
        String token    = getArgument(args, "--token");
        String chatId   = getArgument(args, "--chat-id");

        // Falls eines der Argumente nicht vorhanden ist, Usage ausgeben
        if (serverIp == null || portStr == null || token == null || chatId == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "get_chat_info");
        payload.put("token", token);

        JSONObject arguments = new JSONObject();
        arguments.put("chatId", chatId);
        payload.put("arguments", arguments);

        System.out.println("📤 Anfrage senden...");
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Antwort:");
        System.out.println(response);
    }

    /**
     * Liest einen Wert für ein bestimmtes Argument-Schlüsselwort aus dem args-Array.
     * Gibt null zurück, falls nicht gefunden oder kein Wert dahinter.
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
            // Sende das JSON
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
            // Analog zum C#-Code: Fehler als JSON ausgeben
            JSONObject errorJson = new JSONObject();
            errorJson.put("status", "error");
            errorJson.put("message", e.getMessage());
            return errorJson.toString();
        }
    }

    /**
     * Zeigt, wie das Programm verwendet wird.
     */
    private static void printUsage() {
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --chat-id <CHAT_ID>");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  java -cp .;json-20241224.jar MCPGetChatInfoClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken --chat-id 6789");
    }
}
