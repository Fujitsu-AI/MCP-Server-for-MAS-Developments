using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

namespace MCPEditSourceClient
{
    class Program
    {
        static void Main(string[] args)
        {
            // Parameterprüfung (mind. 8 Elemente, weil 4 Pflichtargumente: 
            // --server-ip, --server-port, --token, --source-id)
            // plus optionale Argumente (--title, --content, --groups).
            if (args.Length < 8)
            {
                Console.WriteLine("Usage:");
                Console.WriteLine("  --server-ip <IP> --server-port <PORT> --token <TOKEN> --source-id <SOURCE_ID>");
                Console.WriteLine("  [--title <TITLE>] [--content <CONTENT>] [--groups <LIST_OF_GROUPS>]");
                return;
            }

            // Argumente auslesen
            string serverIp  = GetArgument(args, "--server-ip");
            string portStr   = GetArgument(args, "--server-port");
            string token     = GetArgument(args, "--token");
            string sourceId  = GetArgument(args, "--source-id");
            string title     = GetArgument(args, "--title");
            string content   = GetArgument(args, "--content");
            List<string> groups = GetListArgument(args, "--groups");

            if (serverIp == null || portStr == null || token == null || sourceId == null)
            {
                Console.WriteLine("Fehler: Mindestens eines der Pflichtargumente wurde nicht angegeben.");
                return;
            }

            if (!int.TryParse(portStr, out int serverPort))
            {
                Console.WriteLine("Fehler: --server-port muss eine ganzzahlige Portangabe sein.");
                return;
            }

            // Anfrage an den Server senden
            string response = SendEditSourceRequest(
                serverIp,
                serverPort,
                token,
                sourceId,
                title,
                content,
                groups
            );

            Console.WriteLine("Response from server:");
            Console.WriteLine(response);
        }

        /// <summary>
        /// Sendet die Edit-Source-Anfrage an den MCP-Server.
        /// </summary>
        /// <param name="serverIp">IP-Adresse des MCP-Servers</param>
        /// <param name="serverPort">Port des MCP-Servers</param>
        /// <param name="token">Authentifizierungstoken</param>
        /// <param name="sourceId">ID der zu bearbeitenden Quelle</param>
        /// <param name="title">Neuer Titel der Quelle (optional)</param>
        /// <param name="content">Neuer Inhalt (Markdown) (optional)</param>
        /// <param name="groups">Liste der neuen Gruppen (optional)</param>
        /// <returns>String-Antwort des Servers oder Fehlermeldung</returns>
        static string SendEditSourceRequest(
            string serverIp,
            int serverPort,
            string token,
            string sourceId,
            string title = null,
            string content = null,
            List<string> groups = null)
        {
            // Payload zusammenbauen
            var arguments = new Dictionary<string, object>
            {
                { "sourceId", sourceId }
            };

            // Nur hinzufügen, wenn nicht null
            if (!string.IsNullOrWhiteSpace(title))
                arguments["title"] = title;

            if (!string.IsNullOrWhiteSpace(content))
                arguments["content"] = content;

            // Falls keine Gruppen übergeben wurden, leere Liste setzen
            arguments["groups"] = groups ?? new List<string>();

            // Payload-Objekt erstellen
            var payload = new
            {
                command = "edit_source",
                token = token,
                arguments
            };

            // JSON serialisieren
            string payloadJson = JsonConvert.SerializeObject(payload);

            // Per TCP an den Server senden
            try
            {
                using (var client = new TcpClient(serverIp, serverPort))
                using (NetworkStream stream = client.GetStream())
                {
                    // Senden
                    byte[] data = Encoding.UTF8.GetBytes(payloadJson);
                    stream.Write(data, 0, data.Length);

                    // Antwort empfangen
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    StringBuilder responseBuilder = new StringBuilder();

                    do
                    {
                        bytesRead = stream.Read(buffer, 0, buffer.Length);
                        responseBuilder.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
                    } while (bytesRead == buffer.Length);

                    return responseBuilder.ToString();
                }
            }
            catch (Exception e)
            {
                return $"Error: {e.Message}";
            }
        }

        /// <summary>
        /// Liest den Wert eines bestimmten Keys aus args aus (z.B. --server-ip 127.0.0.1).
        /// </summary>
        /// <param name="args">Alle Argumente</param>
        /// <param name="key">Gesuchter Key (z.B. "--server-ip")</param>
        /// <returns>Wert des Keys oder null</returns>
        static string GetArgument(string[] args, string key)
        {
            int index = Array.IndexOf(args, key);
            return index >= 0 && index < args.Length - 1 ? args[index + 1] : null;
        }

        /// <summary>
        /// Liest eine Liste an Werten aus, die auf den key folgen (z.B. --groups G1 G2 --irgendeinAndererKey ...).
        /// </summary>
        /// <param name="args">Alle Argumente</param>
        /// <param name="key">Gesuchter Key (z.B. "--groups")</param>
        /// <returns>Liste gefundener Werte oder eine leere Liste</returns>
        static List<string> GetListArgument(string[] args, string key)
        {
            var result = new List<string>();
            int index = Array.IndexOf(args, key);
            if (index >= 0)
            {
                for (int i = index + 1; i < args.Length && !args[i].StartsWith("--"); i++)
                {
                    result.Add(args[i]);
                }
            }
            return result;
        }
    }
}
