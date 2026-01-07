#include <iostream>
#include <string>
#include <map>
#include <cstring>
#include <cstdlib>
#include <sstream>
#include <stdexcept>
#include <json/json.h>
#include <openssl/ssl.h>
#include <openssl/err.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "libssl.lib")
#pragma comment(lib, "libcrypto.lib")
#else
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>
#endif

// Function to parse command-line arguments
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

void init_openssl() {
    SSL_load_error_strings();   
    OpenSSL_add_ssl_algorithms();
}

void cleanup_openssl() {
    EVP_cleanup();
}

SSL_CTX* create_context() {
    const SSL_METHOD* method;
    SSL_CTX* ctx;

    method = TLS_client_method();
    ctx = SSL_CTX_new(method);
    if (!ctx) {
        perror("Unable to create SSL context");
        ERR_print_errors_fp(stderr);
        exit(EXIT_FAILURE);
    }

    return ctx;
}

std::string sendRequest(const std::string& serverIp, int serverPort, const Json::Value& payload) {
    init_openssl();
    SSL_CTX* ctx = create_context();

#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2,2), &wsaData);
#endif

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        SSL_CTX_free(ctx);
#ifdef _WIN32
        WSACleanup();
#endif
        throw std::runtime_error("Failed to create socket");
    }

    struct sockaddr_in serverAddr;
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(serverPort);
    if (inet_pton(AF_INET, serverIp.c_str(), &serverAddr.sin_addr) <= 0) {
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        SSL_CTX_free(ctx);
        throw std::runtime_error("Invalid server IP address");
    }

    if (connect(sock, (struct sockaddr*)&serverAddr, sizeof(serverAddr)) < 0) {
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        SSL_CTX_free(ctx);
        throw std::runtime_error("Connection failed");
    }

    SSL* ssl = SSL_new(ctx);
    SSL_set_fd(ssl, sock);
    if (SSL_connect(ssl) <= 0) {
        ERR_print_errors_fp(stderr);
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        SSL_free(ssl);
        SSL_CTX_free(ctx);
        throw std::runtime_error("Failed to create SSL connection");
    }

    // Serialize the JSON payload to a string
    Json::StreamWriterBuilder writer;
    std::string payloadJson = Json::writeString(writer, payload);

    // Send the payload
    if (SSL_write(ssl, payloadJson.c_str(), payloadJson.size()) <= 0) {
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        SSL_free(ssl);
        SSL_CTX_free(ctx);
        throw std::runtime_error("Failed to send data");
    }

    // Receive the response
    char buffer[4096];
    int bytesRead = SSL_read(ssl, buffer, sizeof(buffer) - 1);
    if (bytesRead < 0) {
#ifdef _WIN32
        closesocket(sock);
        WSACleanup();
#else
        close(sock);
#endif
        SSL_free(ssl);
        SSL_CTX_free(ctx);
        throw std::runtime_error("Failed to receive data");
    }

    buffer[bytesRead] = '\0'; // Null-terminate the received data

    SSL_free(ssl);
#ifdef _WIN32
    closesocket(sock);
    WSACleanup();
#else
    close(sock);
#endif
    SSL_CTX_free(ctx);
    cleanup_openssl();

    return std::string(buffer);
}

int main(int argc, char* argv[]) {
    try {
        auto args = parseArguments(argc, argv);

        // Extract required parameters
        std::string serverIp = args["--server-ip"];
        int serverPort = std::stoi(args["--server-port"]);
        std::string email = args["--email"];
        std::string password = args["--password"];

        if (serverIp.empty() || serverPort == 0 || email.empty() || password.empty()) {
            std::cerr << "❌ ERROR: Missing required parameters.\n";
            return 1;
        }

        std::cout << "🔐 Logging in...\n";

        // Build the payload
        Json::Value payload;
        payload["command"] = "login";
        payload["arguments"]["email"] = email;
        payload["arguments"]["password"] = password;

        // Send request and get response
        std::string responseJson = sendRequest(serverIp, serverPort, payload);

        // Parse and print the server response
        Json::CharReaderBuilder reader;
        Json::Value response;
        std::istringstream responseStream(responseJson);
        std::string errs;

        if (!Json::parseFromStream(reader, responseStream, &response, &errs)) {
            throw std::runtime_error("Failed to parse server response: " + errs);
        }

        std::cout << "✅ Server Response:\n" << response.toStyledString();
    } catch (const std::exception& e) {
        std::cerr << "❌ ERROR: " << e.what() << '\n';
        return 1;
    }

    return 0;
}
