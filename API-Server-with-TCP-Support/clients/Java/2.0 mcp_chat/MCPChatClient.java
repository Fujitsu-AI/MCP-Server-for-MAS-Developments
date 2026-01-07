import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class MCPChatClient {

    public static void main(String[] args) {
        // Minimalprüfung, ob genug Argumente für --server-ip, --server-port, --token, --question vorliegen.
        // (Die eigentliche Prüfung machen wir etwas weiter unten ausführlicher.)
        if (args.length < 5) {
            printUsage();
            return;
        }

        // Argumente auslesen
        String serverIp = getArgument(args, "--server-ip");
        String serverPortStr = getArgument(args, "--server-port");
        String token = getArgument(args, "--token");
        String question = getArgument(args, "--question");
        boolean usePublic = Arrays.asList(args).contains("--use-public");
        String language = getArgument(args, "--language");
        if (language == null) {
            language = "de"; // Defaultwert wie im Original
        }

        // Groups (kommagetrennt)
        List<String> groups = new ArrayList<>();
        String groupsArgument = getArgument(args, "--groups");
        if (groupsArgument != null) {
            // Zerlege den String an Kommas
            String[] groupArray = groupsArgument.split(",");
            groups.addAll(Arrays.asList(groupArray));
        }

        // Vollständige Prüfung
        if (serverIp == null || serverPortStr == null || token == null || question == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(serverPortStr);

        // Anfrage an den Server stellen
        String response = sendMCPRequest(serverIp, serverPort, token, question, usePublic, groups, language);
        System.out.println("Response from server:");
        System.out.println(response);
    }

    /**
     * Liest den Wert eines Arguments aus (z.B. --server-ip 127.0.0.1).
     * Gibt null zurück, wenn der Schlüssel nicht gefunden wurde.
     */
    private static String getArgument(String[] args, String key) {
        for (int i = 0; i < args.length - 1; i++) {
            if (args[i].equals(key)) {
                // Gib das nächste Element zurück, sofern vorhanden
                return args[i + 1];
            }
        }
        return null;
    }

    /**
     * Stellt eine Socket-Verbindung her, sendet das JSON-Payload und empfängt die Antwort.
     */
    private static String sendMCPRequest(String serverIp,
                                         int serverPort,
                                         String token,
                                         String question,
                                         boolean usePublic,
                                         List<String> groups,
                                         String language) {

        // Payload aufbauen
        JSONObject payload = new JSONObject();
        payload.put("command", "chat");
        payload.put("token", token);

        // arguments
        JSONObject arguments = new JSONObject();
        arguments.put("question", question);
        arguments.put("usePublic", usePublic);
        arguments.put("language", language);

        // Falls du lieber ein reines Array statt List speichern möchtest,
        // kannst du direkt new JSONArray(groups) verwenden.
        // Hier konvertieren wir die Java-Liste in ein JSONArray:
        JSONArray groupsArray = new JSONArray(groups);
        arguments.put("groups", groupsArray);

        payload.put("arguments", arguments);

        // Konvertiere das JSON-Objekt in einen String
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Sende das JSON-Payload
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
            // Fehler in ein JSON-Objekt packen, wie im Original
            JSONObject errorResponse = new JSONObject();
            errorResponse.put("status", "error");
            errorResponse.put("message", e.getMessage());
            return errorResponse.toString();
        }
    }

    private static void printUsage() {
        System.out.println("Usage: ");
        System.out.println("  --server-ip <IP> --server-port <PORT> --token <TOKEN> --question <QUESTION>");
        System.out.println("  [--use-public] [--groups <GROUPS>] [--language <LANGUAGE>]");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPChatClient --server-ip 127.0.0.1 --server-port 1234 \\");
        System.out.println("       --token 12345 --question \"Hallo Welt?\" --use-public --groups \"devops,hr\"");
    }
}
