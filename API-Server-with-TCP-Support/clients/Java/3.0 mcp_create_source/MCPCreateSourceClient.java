import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class MCPCreateSourceClient {

    public static void main(String[] args) {
        // Entspricht dem Minimalcheck (8 Parameter) wie im C#-Code.
        if (args.length < 8) {
            printUsage();
            return;
        }

        String serverIp  = getArgument(args, "--server-ip");
        String portStr   = getArgument(args, "--server-port");
        String token     = getArgument(args, "--token");
        String name      = getArgument(args, "--name");
        String content   = getArgument(args, "--content");
        List<String> groups = getArgumentList(args, "--groups");

        // Falls wichtige Argumente fehlen, direkt Usage anzeigen
        if (serverIp == null || portStr == null || token == null 
            || name == null || content == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sending request to create a new source...");

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "create_source");
        payload.put("token", token);

        // "arguments" Objekt
        JSONObject arguments = new JSONObject();
        arguments.put("name", name);
        arguments.put("content", content);

        // "groups" als JSONArray hinzufügen
        JSONArray groupsJsonArray = new JSONArray(groups);
        arguments.put("groups", groupsJsonArray);

        payload.put("arguments", arguments);

        // Request an den MCP-Server senden
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Gibt einen einzelnen Argumentwert für das gegebene Schlüsselwort zurück,
     * oder null, wenn keiner gefunden wurde.
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
     * Sucht im args-Array nach dem Schlüssel 'key' und liest dann solange
     * weiter, bis das nächste Argument wieder mit "--" beginnt (oder das Array endet).
     * So können mehrere Gruppenwerte nacheinander gelesen werden.
     */
    private static List<String> getArgumentList(String[] args, String key) {
        List<String> values = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals(key)) {
                // Ab hier die folgenden Einträge sammeln, bis "--" oder Ende
                for (int j = i + 1; j < args.length; j++) {
                    if (args[j].startsWith("--")) {
                        break;
                    }
                    values.add(args[j]);
                }
                break; // Suche beenden, sobald wir die Liste gefunden haben
            }
        }
        return values;
    }

    /**
     * Baut eine Socket-Verbindung zum Server auf, sendet das JSON-Payload
     * und empfängt die Antwort.
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

    private static void printUsage() {
        System.out.println("Usage:");
        System.out.println("  --server-ip <IP> --server-port <PORT> --token <TOKEN> "
                         + "--name <NAME> --content <CONTENT> [--groups <GROUP1 GROUP2 ...>]");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPCreateSourceClient "
                         + "--server-ip 127.0.0.1 --server-port 1234 --token MyToken "
                         + "--name \"Test Source\" --content \"This is some content\" "
                         + "--groups dev hr admin");
    }
}
