import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MCPEditUserClient {
    public static void main(String[] args) {
        // Kurze Validierung der Argumente
        if (args.length < 8) {
            System.out.println("Usage: " +
                    "--server-ip <IP> " +
                    "--server-port <PORT> " +
                    "--token <TOKEN> " +
                    "--user-id <USER_ID> [weitere optionale Parameter]");
            return;
        }

        // Argumente auslesen
        String serverIp   = getArgument(args, "--server-ip");
        String portString = getArgument(args, "--server-port");
        if (serverIp == null || portString == null) {
            System.err.println("Server-IP oder Server-Port fehlt!");
            return;
        }
        int serverPort    = Integer.parseInt(portString);
        String token      = getArgument(args, "--token");
        String userId     = getArgument(args, "--user-id");

        // Optional
        String name       = getArgument(args, "--name");
        String email      = getArgument(args, "--email");
        String password   = getArgument(args, "--password");
        String language   = getArgument(args, "--language");
        String timezone   = getArgument(args, "--timezone");

        List<String> roles  = getListArgument(args, "--roles");
        List<String> groups = getListArgument(args, "--groups");

        boolean usePublic   = Arrays.asList(args).contains("--usePublic");
        boolean activateFtp = Arrays.asList(args).contains("--activateFtp");
        String ftpPassword  = getArgument(args, "--ftpPassword");

        // Argumente in eine Map packen
        Map<String, Object> argumentsMap = new HashMap<>();
        argumentsMap.put("userId",      userId);
        argumentsMap.put("name",        name);
        argumentsMap.put("email",       email);
        argumentsMap.put("password",    password);
        argumentsMap.put("language",    language);
        argumentsMap.put("timezone",    timezone);
        argumentsMap.put("roles",       roles);
        argumentsMap.put("groups",      groups);
        argumentsMap.put("usePublic",   usePublic);
        argumentsMap.put("activateFtp", activateFtp);
        argumentsMap.put("ftpPassword", ftpPassword);

        // Null oder leere Strings entfernen
        argumentsMap = removeNullOrEmpty(argumentsMap);

        // JSON-Payload zusammenstellen
        JSONObject payload = new JSONObject();
        payload.put("command", "edit_user");
        payload.put("token", token);
        payload.put("arguments", argumentsMap);

        System.out.println("📤 Sending edit user request...");
        String response = sendRequest(serverIp, serverPort, payload.toString());
        System.out.println("✔️ Response from server:");
        System.out.println(response);
    }

    /**
     * Liest den Wert eines bestimmten Parameters aus dem Argument-Array.
     * Bsp.: "--server-ip" -> "127.0.0.1"
     *
     * @param args Array mit allen Argumenten
     * @param key  Name des Arguments, nach dem gesucht wird (z.B. "--server-ip")
     * @return     Wert des Arguments oder null, falls nicht gefunden
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
     * Liest mehrere Werte für einen Argument-Schlüssel (z.B. "--roles") aus,
     * bis ein neues Argument mit "--" beginnt.
     *
     * @param args Array mit allen Argumenten
     * @param key  Name des Arguments, nach dem gesucht wird (z.B. "--roles")
     * @return     Liste der gefundenen Werte, sonst eine leere Liste
     */
    private static List<String> getListArgument(String[] args, String key) {
        List<String> values = new ArrayList<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals(key)) {
                // Sammle solange, bis ein neues "--" beginnt oder args zu Ende
                for (int j = i + 1; j < args.length && !args[j].startsWith("--"); j++) {
                    values.add(args[j]);
                }
                break;
            }
        }
        return values;
    }

    /**
     * Entfernt alle Einträge, deren Wert null oder ein leerer String ist.
     */
    private static Map<String, Object> removeNullOrEmpty(Map<String, Object> original) {
        Map<String, Object> cleaned = new HashMap<>();
        for (Map.Entry<String, Object> entry : original.entrySet()) {
            Object value = entry.getValue();
            if (value != null) {
                // Wenn String, checke ob leer oder nur Whitespace
                if (value instanceof String) {
                    String str = (String) value;
                    if (!str.trim().isEmpty()) {
                        cleaned.put(entry.getKey(), value);
                    }
                } else {
                    // Keine weitere Prüfung für Listen, Booleans, etc.
                    cleaned.put(entry.getKey(), value);
                }
            }
        }
        return cleaned;
    }

    /**
     * Sendet den gegebenen JSON-String per TCP an den Server und empfängt die Antwort.
     * 
     * @param serverIp   IP des Servers
     * @param serverPort Port des Servers
     * @param payload    JSON-String
     * @return           Antwort als String oder Fehlermeldung
     */
    private static String sendRequest(String serverIp, int serverPort, String payload) {
        try (Socket socket = new Socket(serverIp, serverPort)) {
            // Daten zum Server senden
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
                charsRead = reader.read(buffer, 0, buffer.length);
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
