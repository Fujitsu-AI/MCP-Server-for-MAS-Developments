#include <iostream>
#include <string>
#include <map>
#include <vector>
#include <sstream>
#include <stdexcept>
#include <json/json.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib") // Verlinkung mit der Winsock-Bibliothek

// Funktion zum Parsen von Argumenten
std::map<std::string, std::string> parseArguments(int argc, char* argv[]) {
    std::map<std::string, std::string> args;
    for (int i = 1; i < argc; ++i) {
        std::string key = argv[i];
        if (i + 1 < argc && key.rfind("--", 0) == 0) {
            args[key] = argv[++i];
        }
    }
    return args;
}

// Funktion zum Parsen von Listen-Argumenten
std::vector<std::string> parseListArgument(int argc, char* argv[], const std::string& key) {
    std::vector<std::string> values;
    for (int i = 1; i < argc; ++i) {
        if (argv[i] == key && i + 1 < argc) {
            for (int j = i + 1; j < argc && std::string(argv[j]).rfind("--", 0) != 0; ++j) {
                values.push_back(argv[j]);
            }
        }
    }
    return values;
}

// Funktion zum Senden der Anfrage
std::string sendRequest(const std::string& serverIp, int serverPort, const Json::Value& payload) {
    Json::StreamWriterBuilder writer;
    std::string payloadJson = Json::writeString(writer, payload);

    // Winsock initialisieren
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        throw std::runtime_error("Failed to initialize Winsock.");
    }

    // Socket erstellen
    SOCKET sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock == INVALID_SOCKET) {
        WSACleanup();
        throw std::runtime_error("Failed to create socket.");
    }

    // Server-Adresse konfigurieren
    sockaddr_in serverAddr;
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(serverPort);
    if (inet_pton(AF_INET, serverIp.c_str(), &serverAddr.sin_addr) <= 0) {
        closesocket(sock);
        WSACleanup();
        throw std::runtime_error("Invalid server IP address.");
    }

    // Verbindung herstellen
    if (connect(sock, (sockaddr*)&serverAddr, sizeof(serverAddr)) < 0) {
        closesocket(sock);
        WSACleanup();
        throw std::runtime_error("Connection failed.");
    }

    // Daten senden
    if (send(sock, payloadJson.c_str(), payloadJson.size(), 0) < 0) {
        closesocket(sock);
        WSACleanup();
        throw std::runtime_error("Failed to send data.");
    }

    // Antwort empfangen
    char buffer[4096];
    int bytesRead;
    std::ostringstream response;

    do {
        bytesRead = recv(sock, buffer, sizeof(buffer) - 1, 0);
        if (bytesRead > 0) {
            buffer[bytesRead] = '\0'; // Null-terminieren
            response << buffer;
        }
    } while (bytesRead == sizeof(buffer) - 1);

    // Socket schließen
    closesocket(sock);
    WSACleanup();

    return response.str();
}

int main(int argc, char* argv[]) {
    try {
        auto args = parseArguments(argc, argv);

        // Pflichtargumente überprüfen
        if (args["--server-ip"].empty() || args["--server-port"].empty() || args["--token"].empty() || args["--email"].empty() || args["--name"].empty()) {
            std::cerr << "Usage: --server-ip <IP> --server-port <PORT> --token <TOKEN> --email <EMAIL> --name <NAME> [optional parameters]\n";
            return 1;
        }

        // Argumente auslesen
        std::string serverIp = args["--server-ip"];
        int serverPort = std::stoi(args["--server-port"]);
        std::string token = args["--token"];
        std::string email = args["--email"];
        std::string name = args["--name"];
        std::string language = args.count("--language") ? args["--language"] : "en";
        std::string timezone = args.count("--timezone") ? args["--timezone"] : "UTC";
        std::string password = args["--password"];
        bool publicUpload = args.count("--publicUpload") > 0;
        auto groups = parseListArgument(argc, argv, "--groups");
        auto roles = parseListArgument(argc, argv, "--roles");
        bool activateFtp = args.count("--activateFtp") > 0;
        std::string ftpPassword = args["--ftpPassword"];

        // JSON-Payload erstellen
        Json::Value payload;
        payload["command"] = "edit_user";
        payload["token"] = token;
        payload["arguments"]["email"] = email;
        payload["arguments"]["name"] = name;
        payload["arguments"]["language"] = language;
        payload["arguments"]["timezone"] = timezone;
        if (!password.empty()) payload["arguments"]["password"] = password;
        payload["arguments"]["publicUpload"] = publicUpload;
        for (const auto& group : groups) {
            payload["arguments"]["groups"].append(group);
        }
        for (const auto& role : roles) {
            payload["arguments"]["roles"].append(role);
        }
        payload["arguments"]["activateFtp"] = activateFtp;
        if (!ftpPassword.empty()) payload["arguments"]["ftpPassword"] = ftpPassword;

        std::cout << "📤 Sending edit user request...\n";

        // Anfrage senden und Antwort erhalten
        std::string response = sendRequest(serverIp, serverPort, payload);

        std::cout << "✔️ Response from server:\n" << response << "\n";
    } catch (const std::exception& e) {
        std::cerr << "❌ ERROR: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
