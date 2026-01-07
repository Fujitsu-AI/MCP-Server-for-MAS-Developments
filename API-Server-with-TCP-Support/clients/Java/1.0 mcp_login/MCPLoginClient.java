import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPLoginClient {

    public static void main(String[] args) {
        String serverIp = null;
        int serverPort = 0;
        String email = null;
        String password = null;

        // Argumente parsen
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--server-ip":
                    serverIp = args[++i];
                    break;
                case "--server-port":
                    serverPort = Integer.parseInt(args[++i]);
                    break;
                case "--email":
                    email = args[++i];
                    break;
                case "--password":
                    password = args[++i];
                    break;
            }
        }

        // Validierung
        if (serverIp == null || serverPort == 0 || email == null || password == null) {
            System.out.println("❌ ERROR: Missing required parameters.");
            return;
        }

        System.out.println("🔐 Logging in...");

        // JSON-Objekt erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "login");

        JSONObject arguments = new JSONObject();
        arguments.put("email", email);
        arguments.put("password", password);
        payload.put("arguments", arguments);

        // Request senden und Antwort empfangen
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✅ Server Response:");
        System.out.println(response);
    }

    /**
     * Stellt eine TCP-Verbindung her, sendet das JSON und empfängt die Antwort.
     */
    public static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        try (Socket socket = new Socket(serverIp, serverPort)) {
            // JSON in Byte-Array umwandeln
            String payloadString = payload.toString();
            byte[] data = payloadString.getBytes(StandardCharsets.UTF_8);

            // Daten senden
            OutputStream out = socket.getOutputStream();
            out.write(data);
            out.flush();

            // Antwort empfangen
            InputStream in = socket.getInputStream();
            byte[] buffer = new byte[4096];
            int bytesRead = in.read(buffer);

            if (bytesRead == -1) {
                // Falls keine Daten empfangen wurden
                return "❌ ERROR: No response from server.";
            }

            return new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);

        } catch (IOException e) {
            e.printStackTrace();
            return "❌ ERROR: " + e.getMessage();
        }
    }
}
