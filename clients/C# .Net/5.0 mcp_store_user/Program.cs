using System;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

namespace MCPStoreUserClient
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 14)
            {
                Console.WriteLine("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --name <NAME> --email <EMAIL> --password <PASSWORD> [--language <LANG>] [--timezone <TIMEZONE>] [--roles <ROLE1 ROLE2>] [--groups <GROUP1 GROUP2>] [--usePublic] [--activateFtp] [--ftpPassword <FTP_PASSWORD>]");
                return;
            }

            string serverIp = GetArgument(args, "--server-ip");
            int serverPort = int.Parse(GetArgument(args, "--server-port"));
            string token = GetArgument(args, "--token");
            string name = GetArgument(args, "--name");
            string email = GetArgument(args, "--email");
            string password = GetArgument(args, "--password");
            string language = GetArgument(args, "--language") ?? "en";
            string timezone = GetArgument(args, "--timezone") ?? "Europe/Berlin";
            List<string> roles = GetListArgument(args, "--roles");
            List<string> groups = GetListArgument(args, "--groups");
            bool usePublic = Array.Exists(args, arg => arg == "--usePublic");
            bool activateFtp = Array.Exists(args, arg => arg == "--activateFtp");
            string ftpPassword = GetArgument(args, "--ftpPassword") ?? "";

            var payload = new
            {
                command = "store_user",
                token = token,
                arguments = new
                {
                    name = name,
                    email = email,
                    password = password,
                    language = language,
                    timezone = timezone,
                    roles = roles,
                    groups = groups,
                    usePublic = usePublic,
                    activateFtp = activateFtp,
                    ftpPassword = ftpPassword
                }
            };

            Console.WriteLine("📤 Sending store user request...");
            string response = SendRequest(serverIp, serverPort, payload);
            Console.WriteLine("✔️ Response from server:");
            Console.WriteLine(response);
        }

        static string GetArgument(string[] args, string key)
        {
            int index = Array.IndexOf(args, key);
            return index >= 0 && index < args.Length - 1 ? args[index + 1] : null;
        }

        static List<string> GetListArgument(string[] args, string key)
        {
            int index = Array.IndexOf(args, key);
            List<string> values = new List<string>();
            if (index >= 0)
            {
                for (int i = index + 1; i < args.Length && !args[i].StartsWith("--"); i++)
                {
                    values.Add(args[i]);
                }
            }
            return values;
        }

        static string SendRequest(string serverIp, int serverPort, object payload)
        {
            string payloadJson = JsonConvert.SerializeObject(payload);

            try
            {
                using (TcpClient client = new TcpClient(serverIp, serverPort))
                {
                    NetworkStream stream = client.GetStream();

                    // Send payload
                    byte[] data = Encoding.UTF8.GetBytes(payloadJson);
                    stream.Write(data, 0, data.Length);

                    // Receive response
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
