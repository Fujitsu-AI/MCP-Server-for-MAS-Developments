#include <iostream>
#include <string>
#include <stdexcept>
#include <json/json.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "ws2_32.lib") // Verlinkung mit der Winsock-Bibliothek

// Funktion zum Senden der Keygen-Anfrage
std::string sendKeygenRequest(const std::string& serverIp, int serverPort, const std::string& token, const std::string& password) {
    // JSON-Payload erstellen
    Json::Value payload;
    payload["command"] = "keygen";
    payload["token"] = token;
    payload["arguments"]["password"] = password;

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
    if (argc < 5) {
        std::cerr << "Usage: " << argv[0] << " --server-ip <IP> --server-port <PORT> --token <TOKEN> --password <PASSWORD>\n";
        return 1;
    }

    // Argumente auslesen
    std::string serverIp;
    int serverPort = 0;
    std::string token;
    std::string password;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--server-ip" && i + 1 < argc) {
            serverIp = argv[++i];
        } else if (arg == "--server-port" && i + 1 < argc) {
            serverPort = std::stoi(argv[++i]);
        } else if (arg == "--token" && i + 1 < argc) {
            token = argv[++i];
        } else if (arg == "--password" && i + 1 < argc) {
            password = argv[++i];
        }
    }

    // Überprüfen, ob alle erforderlichen Parameter gesetzt sind
    if (serverIp.empty() || serverPort == 0 || token.empty() || password.empty()) {
        std::cerr << "Usage: " << argv[0] << " --server-ip <IP> --server-port <PORT> --token <TOKEN> --password <PASSWORD>\n";
        return 1;
    }

    try {
        // Keygen-Anfrage senden
        std::string response = sendKeygenRequest(serverIp, serverPort, token, password);
        std::cout << "Response from server:\n" << response << "\n";
    } catch (const std::exception& e) {
        std::cerr << "❌ ERROR: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
