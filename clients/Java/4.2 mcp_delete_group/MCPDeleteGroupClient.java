import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPDeleteGroupClient {

    public static void main(String[] args) {
        // Erwartet mind. 8 Argumente:
        // --server-ip <IP>
        // --server-port <PORT>
        // --token <TOKEN>
        // --group-name <GROUP_NAME>
        if (args.length < 8) {
            System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --group-name <GROUP_NAME>");
            return;
        }

        // Argumente auslesen
        String serverIp   = getArgument(args, "--server-ip");
        String portString = getArgument(args, "--server-port");
        String token      = getArgument(args, "--token");
        String groupName  = getArgument(args, "--group-name");

        if (serverIp == null || portString == null || token == null || groupName == null) {
            System.err.println("Mindestens eines der erforderlichen Argumente ist nicht gesetzt.");
            return;
        }

        int serverPort;
        try {
            serverPort = Integer.parseInt(portString);
        } catch (NumberFormatException e) {
            System.err.println("Fehler: Server-Port muss eine ganze Zahl sein.");
            return;
        }

        System.out.println("📤 Sending request to delete group...");

        // JSON-Payload erstellen
        JSONObject arguments = new JSONObject();
        arguments.put("groupName", groupName);

        JSONObject payload = new JSONObject();
        payload.put("command", "delete_group");
        payload.put("token", token);
        payload.put("arguments", arguments);

        // Anfrage abschicken
        String response = sendRequest(serverIp, serverPort, payload.toString());

        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Liest den Wert zu einem bestimmten Key (z.B. "--server-ip") aus args aus
     * und gibt ihn zurück.
     *
     * @param args Array mit allen Argumenten
     * @param key  Schlüssel, nach dem gesucht wird (z.B. "--server-ip")
     * @return     Der Wert des Arguments oder null, wenn nicht gefunden
     */
    private static String getArgument(String[] args, String key) {
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals(key) && i < args.length - 1) {
                return args[i + 1];
            }
        }
        return null;
    }

    /**
     * Erstellt eine Socket-Verbindung, sendet den JSON-Payload und empfängt die
     * Antwort als String.
     *
     * @param serverIp   IP-Adresse des Servers
     * @param serverPort Port des Servers
     * @param payload    Zu sendender JSON-String
     * @return           Antwort vom Server oder Fehlermeldung bei Exception
     */
    private static String sendRequest(String serverIp, int serverPort, String payload) {
        try (Socket socket = new Socket(serverIp, serverPort)) {
            // Payload an den Server senden
            OutputStream output = socket.getOutputStream();
            byte[] data = payload.getBytes(StandardCharsets.UTF_8);
            output.write(data);
            output.flush();

            // Antwort lesen
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)
            );
            StringBuilder sb = new StringBuilder();
            char[] buffer = new char[4096];
            int charsRead;
            do {
                charsRead = reader.read(buffer);
                if (charsRead > 0) {
                    sb.append(buffer, 0, charsRead);
                }
            } while (charsRead == buffer.length);

            return sb.toString();
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }
}
