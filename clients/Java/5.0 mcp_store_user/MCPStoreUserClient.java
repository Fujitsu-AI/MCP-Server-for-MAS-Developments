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

public class MCPStoreUserClient {

    public static void main(String[] args) {
        // Laut Original soll es mindestens 14 Strings geben,
        // also 7 Schlüssel-Wert-Paare. (z.B. --server-ip <IP> etc.)
        if (args.length < 14) {
            printUsage();
            return;
        }

        // Argumente auslesen
        String serverIp  = getArgument(args, "--server-ip");
        String portStr   = getArgument(args, "--server-port");
        String token     = getArgument(args, "--token");
        String name      = getArgument(args, "--name");
        String email     = getArgument(args, "--email");
        String password  = getArgument(args, "--password");
        String language  = getArgument(args, "--language");
        String timezone  = getArgument(args, "--timezone");

        if (language == null) {
            language = "en";  // Standardwert laut Original
        }
        if (timezone == null) {
            timezone = "Europe/Berlin";  // Standardwert laut Original
        }

        List<String> roles = getListArgument(args, "--roles");
        List<String> groups = getListArgument(args, "--groups");

        // Flags
        boolean usePublic  = Arrays.asList(args).contains("--usePublic");
        boolean activateFtp= Arrays.asList(args).contains("--activateFtp");

        // FTP-Passwort, falls angegeben
        String ftpPassword = getArgument(args, "--ftpPassword");
        if (ftpPassword == null) {
            ftpPassword = "";
        }

        // Falls kritische Argumente fehlen, Usage anzeigen
        if (serverIp == null || portStr == null || token == null 
            || name == null || email == null || password == null) {
            printUsage();
            return;
        }

        int serverPort = Integer.parseInt(portStr);

        System.out.println("📤 Sending store user request...");

        // JSON-Payload erstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "store_user");
        payload.put("token", token);

        JSONObject arguments = new JSONObject();
        arguments.put("name", name);
        arguments.put("email", email);
        arguments.put("password", password);
        arguments.put("language", language);
        arguments.put("timezone", timezone);
        arguments.put("usePublic", usePublic);
        arguments.put("activateFtp", activateFtp);
        arguments.put("ftpPassword", ftpPassword);

        // roles & groups als JSON-Arrays
        JSONArray rolesArray = new JSONArray(roles);
        arguments.put("roles", rolesArray);

        JSONArray groupsArray = new JSONArray(groups);
        arguments.put("groups", groupsArray);

        payload.put("arguments", arguments);

        // Request versenden
        String response = sendRequest(serverIp, serverPort, payload);
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Holt genau ein Argument (z.B. "--server-ip 127.0.0.1").
     * Gibt null zurück, falls nicht vorhanden oder kein Wert folgt.
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
     * Ähnlich wie getArgument(), aber liest alle Werte ein, 
     * bis das nächste "--" beginnt oder das Array zu Ende ist.
     */
    private static List<String> getListArgument(String[] args, String key) {
        List<String> values = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals(key)) {
                // ab hier sammeln
                for (int j = i + 1; j < args.length; j++) {
                    if (args[j].startsWith("--")) {
                        break;
                    }
                    values.add(args[j]);
                }
                break; // Nur einmal sammeln
            }
        }
        return values;
    }

    /**
     * Stellt eine TCP-Verbindung her, sendet das JSON-Payload und liest die Antwort.
     */
    private static String sendRequest(String serverIp, int serverPort, JSONObject payload) {
        String payloadJson = payload.toString();

        try (Socket client = new Socket(serverIp, serverPort)) {
            // Payload senden
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
        System.out.println("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --name <NAME> --email <EMAIL> --password <PASSWORD>");
        System.out.println("       [--language <LANG>] [--timezone <TIMEZONE>] [--roles <ROLE1 ROLE2>] [--groups <GROUP1 GROUP2>]");
        System.out.println("       [--usePublic] [--activateFtp] [--ftpPassword <FTP_PASSWORD>]");
        System.out.println();
        System.out.println("Example:");
        System.out.println("  java -cp .;json-20241224.jar MCPStoreUserClient \\");
        System.out.println("       --server-ip 127.0.0.1 --server-port 1234 --token MyToken \\");
        System.out.println("       --name Max --email max@example.com --password 12345 \\");
        System.out.println("       --language de --timezone Europe/Berlin \\");
        System.out.println("       --roles admin manager --groups devops finance \\");
        System.out.println("       --usePublic --activateFtp --ftpPassword someFtpPass");
    }
}
