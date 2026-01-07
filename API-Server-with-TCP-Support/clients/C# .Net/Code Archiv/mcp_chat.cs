using System;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;
using System.Collections.Generic;

namespace MCPClient
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length < 5)
            {
                Console.WriteLine("Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --question <QUESTION> [--use-public] [--groups <GROUPS>] [--language <LANGUAGE>]");
                return;
            }

            string serverIp = GetArgument(args, "--server-ip");
            int serverPort = int.Parse(GetArgument(args, "--server-port"));
            string token = GetArgument(args, "--token");
            string question = GetArgument(args, "--question");
            bool usePublic = Array.Exists(args, arg => arg == "--use-public");
            string language = GetArgument(args, "--language") ?? "de";

            List<string> groups = new List<string>();
            string groupsArgument = GetArgument(args, "--groups");
            if (groupsArgument != null)
            {
                groups.AddRange(groupsArgument.Split(","));
            }

            var response = SendMCPRequest(serverIp, serverPort, token, question, usePublic, groups, language);
            Console.WriteLine("Response from server:");
            Console.WriteLine(response);
        }

        static string GetArgument(string[] args, string key)
        {
            int index = Array.IndexOf(args, key);
            return index >= 0 && index < args.Length - 1 ? args[index + 1] : null;
        }

        static string SendMCPRequest(string serverIp, int serverPort, string token, string question, bool usePublic, List<string> groups, string language)
        {
            var payload = new
            {
                command = "chat",
                token = token,
                arguments = new
                {
                    question = question,
                    usePublic = usePublic,
                    groups = groups,
                    language = language
                }
            };

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
                return JsonConvert.SerializeObject(new { status = "error", message = e.Message });
            }
        }
    }
}
