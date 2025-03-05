import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public class MCPLogoutClient {

    public static void main(String[] args) {
        String serverIp = null;
        int serverPort = 0;
        String token = null;

        // Argumente parsen
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--server-ip":
                    serverIp = args[++i];
                    break;
                case "--server-port":
                    serverPort = Integer.parseInt(args[++i]);
                    break;
                case "--token":
                    token = args[++i];
                    break;
            }
        }

        // Überprüfen, ob alle Argumente angegeben wurden
        if (serverIp == null || serverPort == 0 || token == null) {
            System.out.println("❌ ERROR: Missing required parameters.");
            return;
        }

        System.out.println("🔒 Sending logout request...");
        String response = sendLogoutRequest(serverIp, serverPort, token);
        System.out.println("Response from server:");
        System.out.println(response);
    }

    private static String sendLogoutRequest(String serverIp, int serverPort, String token) {
        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "logout");
        payload.put("token", token);

        // In String umwandeln
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // OutputStream holen und Daten senden
            OutputStream out = client.getOutputStream();
            byte[] data = payloadJson.getBytes(StandardCharsets.UTF_8);
            out.write(data);
            out.flush();

            // Antwort empfangen
            InputStream in = client.getInputStream();
            byte[] buffer = new byte[4096];
            int bytesRead = in.read(buffer);
            if (bytesRead == -1) {
                return "❌ ERROR: No response from server.";
            }

            return new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);

        } catch (IOException ex) {
            return "Error: " + ex.getMessage();
        }
    }
}
