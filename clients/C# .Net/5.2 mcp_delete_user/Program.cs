using System;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

namespace MCPDeleteUserClient
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 8)
            {
                Console.WriteLine("Usage: --server-ip <IP> --server-port <PORT> --email <EMAIL> --token <TOKEN>");
                return;
            }

            string serverIp = GetArgument(args, "--server-ip");
            int serverPort = int.Parse(GetArgument(args, "--server-port"));
            string email = GetArgument(args, "--email");
            string token = GetArgument(args, "--token");

            var payload = new
            {
                command = "delete_user",
                token = token,
                arguments = new
                {
                    email = email
                }
            };

            Console.WriteLine("📤 Sending delete user request...");
            string response = SendRequest(serverIp, serverPort, payload);
            Console.WriteLine("✔️ Response from server:");
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
