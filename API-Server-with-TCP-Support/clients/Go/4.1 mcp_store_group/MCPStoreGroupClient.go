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

type StoreGroupPayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendStoreGroupRequest(serverIP string, serverPort int, groupName, token, description string) (string, error) {
	// Prepare the request payload
	payload := StoreGroupPayload{
		Command: "store_group",
		Token:   token,
		Arguments: map[string]interface{}{
			"groupName":   groupName,
			"description": description,
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
	groupName := flag.String("group-name", "", "Name of the group to store")
	token := flag.String("token", "", "Authentication token")
	description := flag.String("description", "", "Description of the group (optional)")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *groupName == "" || *token == "" {
		fmt.Println("❌ ERROR: Required flags are missing.")
		flag.Usage()
		os.Exit(1)
	}

	// Send the request to store the group
	fmt.Println("📤 Sending request to store group...")
	response, err := sendStoreGroupRequest(*serverIP, *serverPort, *groupName, *token, *description)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response from server:")
	fmt.Println(response)
}
