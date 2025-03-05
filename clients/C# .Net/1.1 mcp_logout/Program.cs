using System;
using System.Net.Sockets;
using System.Text;
using Newtonsoft.Json;

class Program
{
    static void Main(string[] args)
    {
        string serverIp = null;
        int serverPort = 0;
        string token = null;

        // Argumente parsen
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--server-ip":
                    serverIp = args[++i];
                    break;
                case "--server-port":
                    serverPort = int.Parse(args[++i]);
                    break;
                case "--token":
                    token = args[++i];
                    break;
            }
        }

        // Überprüfen, ob alle Argumente angegeben wurden
        if (string.IsNullOrEmpty(serverIp) || serverPort == 0 || string.IsNullOrEmpty(token))
        {
            Console.WriteLine("❌ ERROR: Missing required parameters.");
            return;
        }

        Console.WriteLine("🔒 Sending logout request...");
        string response = SendLogoutRequest(serverIp, serverPort, token);
        Console.WriteLine("Response from server:");
        Console.WriteLine(response);
    }

    static string SendLogoutRequest(string serverIp, int serverPort, string token)
    {
        // Erstelle das JSON-Payload
        var payload = new
        {
            command = "logout",
            token = token
        };

        string payloadJson = JsonConvert.SerializeObject(payload);

        try
        {
            using (var client = new TcpClient(serverIp, serverPort))
            using (var stream = client.GetStream())
            {
                // Sende das Payload
                byte[] data = Encoding.UTF8.GetBytes(payloadJson);
                stream.Write(data, 0, data.Length);

                // Antwort empfangen
                byte[] buffer = new byte[4096];
                int bytesRead = stream.Read(buffer, 0, buffer.Length);

                string response = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                return response;
            }
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }
}
