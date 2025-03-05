package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
)

type LogoutPayload struct {
	Command string `json:"command"`
	Token   string `json:"token"`
}

func sendLogoutRequest(serverIP string, serverPort int, token string) (string, error) {
	payload := LogoutPayload{
		Command: "logout",
		Token:   token,
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", serverIP, serverPort))
	if err != nil {
		return "", err
	}
	defer conn.Close()

	_, err = conn.Write(payloadJSON)
	if err != nil {
		return "", err
	}

	var responseBuffer bytes.Buffer
	buf := make([]byte, 4096)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return "", err
		}
		responseBuffer.Write(buf[:n])
		if n < 4096 {
			break
		}
	}

	return responseBuffer.String(), nil
}

func main() {
	serverIP := flag.String("server-ip", "", "IP address of the MCP server")
	serverPort := flag.Int("server-port", 0, "Port number of the MCP server")
	token := flag.String("token", "", "Authentication token")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" {
		fmt.Println("❌ ERROR: All flags are required.")
		flag.Usage()
		os.Exit(1)
	}

	fmt.Println("🔒 Sending logout request...")
	response, err := sendLogoutRequest(*serverIP, *serverPort, *token)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Response from server:")
	fmt.Println(response)
}
