using System;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

namespace MCPListGroupsClient
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 3)
            {
                Console.WriteLine("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN>");
                return;
            }

            string serverIp = GetArgument(args, "--server-ip");
            int serverPort = int.Parse(GetArgument(args, "--server-port"));
            string token = GetArgument(args, "--token");

            Console.WriteLine("📄 Abrufen der Gruppen...");

            var payload = new
            {
                command = "list_groups",
                token = token
            };

            string response = SendRequest(serverIp, serverPort, payload);

            Console.WriteLine("✔️ Antwort:");
            Console.WriteLine(response);
        }

        static string GetArgument(string[] args, string key)
        {
            int index = Array.IndexOf(args, key);
            return index >= 0 && index < args.Length - 1 ? args[index + 1] : null;
        }

        static string SendRequest(string serverIp, int serverPort, object payload)
        {
            string payloadJson = JsonConvert.SerializeObject(payload);

            try
            {
                using (TcpClient client = new TcpClient(serverIp, serverPort))
                {
                    NetworkStream stream = client.GetStream();

                    // Senden der Nutzdaten
                    byte[] data = Encoding.UTF8.GetBytes(payloadJson);
                    stream.Write(data, 0, data.Length);

                    // Empfang der Antwort
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    StringBuilder response = new StringBuilder();

                    do
                    {
                        bytesRead = stream.Read(buffer, 0, buffer.Length);
                        response.Append(Encoding.UTF8.GetString(buffer, 0, bytesRead));
                    } while (bytesRead == buffer.Length);

                    return response.ToString();
                }
            }
            catch (Exception e)
            {
                return $"Error: {e.Message}";
            }
        }
    }
}
