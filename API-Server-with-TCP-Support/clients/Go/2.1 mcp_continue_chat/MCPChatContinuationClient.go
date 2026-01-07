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

type ContinueChatPayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendContinueChatRequest(serverIP string, serverPort int, token, conversationID, message string) (string, error) {
	// Prepare the request payload
	payload := ContinueChatPayload{
		Command: "continue_chat",
		Token:   token,
		Arguments: map[string]interface{}{
			"chatId":   conversationID,
			"question": message,
		},
	}

	// Convert the payload to JSON
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	// Create a connection to the server
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", serverIP, serverPort))
	if err != nil {
		return "", err
	}
	defer conn.Close()

	// Send the request
	_, err = conn.Write(payloadJSON)
	if err != nil {
		return "", err
	}

	// Receive the response
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
	conversationID := flag.String("conversation-id", "", "ID of the chat to continue")
	message := flag.String("message", "", "Message to send in the chat")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" || *conversationID == "" || *message == "" {
		fmt.Println("❌ ERROR: All flags are required.")
		flag.Usage()
		os.Exit(1)
	}

	fmt.Println("💬 Sending request to continue the chat...")
	response, err := sendContinueChatRequest(*serverIP, *serverPort, *token, *conversationID, *message)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Response from server:")
	fmt.Println(response)
}
