#include <iostream>
#include <string>
#include <map>
#include <sstream>
#include <stdexcept>
#include <json/json.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib") // Winsock-Bibliothek verlinken

// Funktion zum Argument-Parsing
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

        // Argumente extrahieren
        std::string serverIp = args["--server-ip"];
        int serverPort = std::stoi(args["--server-port"]);
        std::string token = args["--token"];
        std::string sourceId = args["--source-id"];

        // Überprüfen, ob alle erforderlichen Parameter angegeben sind
        if (serverIp.empty() || serverPort == 0 || token.empty() || sourceId.empty()) {
            std::cerr << "Usage: MCPGetSourceClient --server-ip <IP> --server-port <PORT> --token <TOKEN> --source-id <SOURCE_ID>\n";
            return 1;
        }

        std::cout << "📤 Sending request to get source information...\n";

        // JSON-Payload erstellen
        Json::Value payload;
        payload["command"] = "get_source";
        payload["token"] = token;
        payload["arguments"]["sourceId"] = sourceId;

        // Anfrage senden und Antwort erhalten
        std::string response = sendRequest(serverIp, serverPort, payload);

        std::cout << "✔️ Response from server:\n" << response << "\n";
    } catch (const std::exception& e) {
        std::cerr << "❌ ERROR: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
