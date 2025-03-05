#include <iostream>
#include <string>
#include <map>
#include <stdexcept>
#include <json/json.h> // Für JSON-Bibliothek
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib") // Winsock-Bibliothek verlinken

// Argumente parsen
std::map<std::string, std::string> parseArguments(int argc, char* argv[]) {
    std::map<std::string, std::string> args;
    for (int i = 1; i < argc; i++) {
        std::string key = argv[i];
        if (i + 1 < argc) {
            args[key] = argv[++i];
        }
    }
    return args;
}

// Funktion zum Senden der Logout-Anfrage
std::string sendLogoutRequest(const std::string& serverIp, int serverPort, const std::string& token) {
    // JSON-Payload erstellen
    Json::Value payload;
    payload["command"] = "logout";
    payload["token"] = token;

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
    int bytesRead = recv(sock, buffer, sizeof(buffer) - 1, 0);
    if (bytesRead < 0) {
        closesocket(sock);
        WSACleanup();
        throw std::runtime_error("Failed to receive data.");
    }

    buffer[bytesRead] = '\0'; // Antwort null-terminieren

    // Socket schließen
    closesocket(sock);
    WSACleanup();

    return std::string(buffer);
}

int main(int argc, char* argv[]) {
    try {
        auto args = parseArguments(argc, argv);

        // Erforderliche Parameter extrahieren
        std::string serverIp = args["--server-ip"];
        int serverPort = std::stoi(args["--server-port"]);
        std::string token = args["--token"];

        if (serverIp.empty() || serverPort == 0 || token.empty()) {
            std::cerr << "❌ ERROR: Missing required parameters.\n";
            return 1;
        }

        std::cout << "🔒 Sending logout request...\n";

        // Logout-Anfrage senden und Antwort erhalten
        std::string response = sendLogoutRequest(serverIp, serverPort, token);

        std::cout << "Response from server:\n" << response << "\n";
    } catch (const std::exception& e) {
        std::cerr << "❌ ERROR: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
