import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPDeleteUserClient {
    public static void main(String[] args) {
        // Wir benötigen 4 Schlüssel (jeweils 2 Argumente): "--server-ip <IP>", 
        // "--server-port <PORT>", "--email <EMAIL>", "--token <TOKEN>".
        // => mind. 8 Elemente in args
        if (args.length < 8) {
            System.out.println("Usage: --server-ip <IP> --server-port <PORT> --email <EMAIL> --token <TOKEN>");
            return;
        }

        // Argumente auslesen
        String serverIp = getArgument(args, "--server-ip");
        String portStr  = getArgument(args, "--server-port");
        String email    = getArgument(args, "--email");
        String token    = getArgument(args, "--token");

        // Fehlende Pflichtargumente abfangen
        if (serverIp == null || portStr == null || email == null || token == null) {
            System.err.println("Fehler: Mindestens eines der erforderlichen Argumente ist nicht gesetzt.");
            return;
        }

        int serverPort;
        try {
            serverPort = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            System.err.println("Fehler: Server-Port muss eine ganze Zahl sein.");
            return;
        }

        // JSON-Payload vorbereiten
        JSONObject arguments = new JSONObject();
        arguments.put("email", email);

        JSONObject payload = new JSONObject();
        payload.put("command", "delete_user");
        payload.put("token", token);
        payload.put("arguments", arguments);

        System.out.println("📤 Sending delete user request...");
        String response = sendRequest(serverIp, serverPort, payload.toString());
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Holt den Wert eines bestimmten Arguments aus args, z.B. --server-ip 127.0.0.1
     * @param args Array mit allen Argumenten
     * @param key  Name des gesuchten Arguments, z.B. "--server-ip"
     * @return     Der direkt folgende Wert oder null, wenn nicht vorhanden
     */
    private static String getArgument(String[] args, String key) {
        for (int i = 0; i < args.length; i++) {
            if (key.equals(args[i]) && i < args.length - 1) {
                return args[i + 1];
            }
        }
        return null;
    }

    /**
     * Stellt eine Socket-Verbindung her, sendet den JSON-String und empfängt die Server-Antwort.
     *
     * @param serverIp   IP des Servers
     * @param serverPort Port des Servers
     * @param payload    Zu sendender JSON-String
     * @return           Server-Antwort oder Fehlermeldung
     */
    private static String sendRequest(String serverIp, int serverPort, String payload) {
        try (Socket socket = new Socket(serverIp, serverPort)) {
            // JSON an den Server senden
            OutputStream output = socket.getOutputStream();
            byte[] data = payload.getBytes(StandardCharsets.UTF_8);
            output.write(data);
            output.flush();

            // Antwort vom Server lesen
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
