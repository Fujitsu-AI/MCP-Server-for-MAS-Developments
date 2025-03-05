// Using CommandLineParser for cleaner argument parsing
using System;
using Newtonsoft.Json;

class Program
{
    static void Main(string[] args)
    {
        string serverIp = null;
        int serverPort = 0;
        string email = null;
        string password = null;

        // Loop through args and parse them manually (or use a parser library like CommandLineParser)
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
                case "--email":
                    email = args[++i];
                    break;
                case "--password":
                    password = args[++i];
                    break;
            }
        }

        if (string.IsNullOrEmpty(serverIp) || serverPort == 0 || string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password))
        {
            Console.WriteLine("❌ ERROR: Missing required parameters.");
            return;
        }

        Console.WriteLine("🔐 Logging in...");
        var payload = new
        {
            command = "login",
            arguments = new
            {
                email,
                password
            }
        };

        var response = SendRequest(serverIp, serverPort, payload);
        Console.WriteLine("✅ Server Response:");
        Console.WriteLine(JsonConvert.SerializeObject(response, Formatting.Indented));
    }

    static dynamic SendRequest(string serverIp, int serverPort, object payload)
    {
        using (var client = new System.Net.Sockets.TcpClient())
        {
            client.Connect(serverIp, serverPort);
            using (var stream = client.GetStream())
            {
                var payloadJson = JsonConvert.SerializeObject(payload);
                var data = System.Text.Encoding.UTF8.GetBytes(payloadJson);

                // Send payload
                stream.Write(data, 0, data.Length);

                // Receive response
                var buffer = new byte[4096];
                var bytesRead = stream.Read(buffer, 0, buffer.Length);
                var responseJson = System.Text.Encoding.UTF8.GetString(buffer, 0, bytesRead);

                return JsonConvert.DeserializeObject(responseJson);
            }
        }
    }
}
