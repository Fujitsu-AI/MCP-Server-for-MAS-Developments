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

public class MCPEditSourceClient {

    public static void main(String[] args) {
        // Mindestens 8 Strings im Array erforderlich, z.B.:
        // --server-ip 127.0.0.1 --server-port 1234 --token X --source-id Y
        // plus optionale: --title "..." --content "..." --groups ...
        if (args.length < 8) {
            printUsage();
            return;
        }

        // Argumente einlesen
        String serverIp   = getArgument(args, "--server-ip");
        String portStr    = getArgument(args, "--server-port");
        String token      = getArgument(args, "--token");
        String sourceId   = getArgument(args, "--source-id");
        String title      = getArgument(args, "--title");
        String content    = getArgument(args, "--content");
        List<String> groups = getListArgument(args, "--groups");

        // Prüfung auf null
        if (serverIp == null || portStr == null || token == null || sourceId == null) {
            System.out.println("Fehler: Mindestens eines der Pflichtargumente fehlt.");
            return;
        }

        // Port in int umwandeln
        int serverPort;
        try {
            serverPort = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            System.out.println("Fehler: --server-port muss eine ganzzahlige Portangabe sein.");
            return;
        }

        System.out.println("📤 Sende Anfrage zum Editieren einer Quelle...");

        // Anfrage an den Server senden
        String response = sendEditSourceRequest(serverIp, serverPort, token, sourceId, title, content, groups);

        // Antwort ausgeben
        System.out.println("Response from server:");
        System.out.println(response);
    }

    /**
     * Baut die Payload für die "edit_source"-Anfrage zusammen und sendet sie über TCP.
     */
    private static String sendEditSourceRequest(
            String serverIp,
            int serverPort,
            String token,
            String sourceId,
            String title,
            String content,
            List<String> groups
    ) {
        // Arguments-Objekt erstellen
        JSONObject arguments = new JSONObject();
        arguments.put("sourceId", sourceId);

        if (title != null && !title.trim().isEmpty()) {
            arguments.put("title", title);
        }

        if (content != null && !content.trim().isEmpty()) {
            arguments.put("content", content);
        }

        // Gruppen (falls keine übergeben, bleibt es einfach eine leere Liste)
        if (groups == null) {
            groups = new ArrayList<>();
        }
        JSONArray groupsArray = new JSONArray(groups);
        arguments.put("groups", groupsArray);

        // Gesamte Payload
        JSONObject payload = new JSONObject();
        payload.put("command", "edit_source");
        payload.put("token", token);
        payload.put("arguments", arguments);

        // JSON in String umwandeln
        String payloadJson = payload.toString();

        // TCP-Verbindung aufbauen und senden
        try (Socket client = new Socket(serverIp, serverPort)) {
            // Senden
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
     * Liest den Wert für ein bestimmtes Argument aus (z.B. --server-ip 127.0.0.1).
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
     * Liest eine Liste von Werten aus (z.B. --groups G1 G2 G3 ...), bis zum nächsten -- oder Ende.
     */
    private static List<String> getListArgument(String[] args, String key) {
        List<String> result = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals(key)) {
                // Ab hier Werte einsammeln
                for (int j = i + 1; j < args.length; j++) {
                    if (args[j].startsWith("--")) {
                        break;
                    }
                    result.add(args[j]);
                }
                break;
            }
        }
        return result;
    }

    private static void printUsage() {
        System.out.println("Usage:");
        System.out.println("  --server-ip <IP> --server-port <PORT> --token <TOKEN> --source-id <SOURCE_ID>");
        System.out.println("  [--title <TITLE>] [--content <CONTENT>] [--groups <LIST_OF_GROUPS>]");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPEditSourceClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token SomeToken --source-id 456 \\");
        System.out.println("       --title \"Neuer Titel\" --content \"Neuer Inhalt...\" --groups DevOps Finance");
    }
}
