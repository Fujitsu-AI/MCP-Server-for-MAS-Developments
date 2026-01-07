import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPStoreGroupClient {

    public static void main(String[] args) {
        // Minimaler Check: Wir erwarten mindestens 4 "Paare"
        // (--server-ip <IP> --server-port <PORT> --group-name <NAME> --token <TOKEN>)
        // plus optional: --description <TEXT>
        if (args.length < 8) {
            printUsage();
            return;
        }

        String serverIp   = getArgument(args, "--server-ip");
        String portStr    = getArgument(args, "--server-port");
        String groupName  = getArgument(args, "--group-name");
        String token      = getArgument(args, "--token");
        String description= getArgument(args, "--description");
        if (description == null) {
            description = "";
        }

        // Falls eines der Argumente null ist -> Usage
        if (serverIp == null || portStr == null || groupName == null || token == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sende Anfrage zur Erstellung einer Gruppe...");

        // JSON-Payload
        JSONObject payload = new JSONObject();
        payload.put("command", "store_group");
        payload.put("token", token);

        // arguments
        JSONObject arguments = new JSONObject();
        arguments.put("groupName", groupName);
        arguments.put("description", description);

        payload.put("arguments", arguments);

        // Server-Anfrage
        String response = sendRequest(serverIp, serverPort, payload);

        System.out.println("✔️ Antwort vom Server:");
        System.out.println(response);
    }

    /**
     * Sucht im args-Array nach key und gibt den Wert zurück,
     * oder null, wenn key nicht gefunden wurde oder kein Wert folgt.
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
     * Stellt eine TCP-Verbindung her, sendet das JSON und empfängt die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Daten senden
            OutputStream out = client.getOutputStream();
            byte[] data = payloadJson.getBytes(StandardCharsets.UTF_8);
            out.write(data);
            out.flush();

            // Antwort lesen
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
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --group-name <GROUP_NAME> --token <TOKEN> [--description <DESCRIPTION>]");
        System.out.println();
        System.out.println("Beispiel:");
        System.out.println("  java -cp .;json-20241224.jar MCPStoreGroupClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --group-name MyGroup --token MyToken --description \"Testgruppe\"");
    }
}
