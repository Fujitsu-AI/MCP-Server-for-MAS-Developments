using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

namespace MCPEditUserClient
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 4)
            {
                Console.WriteLine("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --user-id <USER_ID> [optional parameters]");
                return;
            }

            string serverIp = GetArgument(args, "--server-ip");
            int serverPort = int.Parse(GetArgument(args, "--server-port"));
            string token = GetArgument(args, "--token");
            string userId = GetArgument(args, "--user-id");
            string name = GetArgument(args, "--name");
            string email = GetArgument(args, "--email");
            string password = GetArgument(args, "--password");
            string language = GetArgument(args, "--language");
            string timezone = GetArgument(args, "--timezone");
            List<string> roles = GetListArgument(args, "--roles");
            List<string> groups = GetListArgument(args, "--groups");
            bool usePublic = Array.Exists(args, arg => arg == "--usePublic");
            bool activateFtp = Array.Exists(args, arg => arg == "--activateFtp");
            string ftpPassword = GetArgument(args, "--ftpPassword");

            var arguments = new Dictionary<string, object>
            {
                { "userId", userId },
                { "name", name },
                { "email", email },
                { "password", password },
                { "language", language },
                { "timezone", timezone },
                { "roles", roles },
                { "groups", groups },
                { "usePublic", usePublic },
                { "activateFtp", activateFtp },
                { "ftpPassword", ftpPassword }
            };

            // Remove null or empty values from arguments
            arguments = arguments.Where(kv => kv.Value != null && !(kv.Value is string str && string.IsNullOrWhiteSpace(str))).ToDictionary(kv => kv.Key, kv => kv.Value);

            var payload = new
            {
                command = "edit_user",
                token = token,
                arguments = arguments
            };

            Console.WriteLine("📤 Sending edit user request...");
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
