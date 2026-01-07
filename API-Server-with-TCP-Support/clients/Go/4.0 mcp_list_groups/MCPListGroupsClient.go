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

type ListGroupsPayload struct {
	Command string `json:"command"`
	Token   string `json:"token"`
}

func sendRequest(serverIP string, serverPort int, payload ListGroupsPayload) (map[string]interface{}, error) {
	// Convert the payload to JSON
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// Create a connection to the server
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", serverIP, serverPort))
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	// Send the request
	_, err = conn.Write(payloadJSON)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		responseBuffer.Write(buf[:n])
		if n < 4096 {
			break
		}
	}

	// Decode the response
	var response map[string]interface{}
	err = json.Unmarshal(responseBuffer.Bytes(), &response)
	if err != nil {
		return nil, err
	}

	return response, nil
}

func listGroups(serverIP string, serverPort int, token string) (map[string]interface{}, error) {
	payload := ListGroupsPayload{
		Command: "list_groups",
		Token:   token,
	}
	return sendRequest(serverIP, serverPort, payload)
}

func main() {
	serverIP := flag.String("server-ip", "", "IP address of the MCP server")
	serverPort := flag.Int("server-port", 0, "Port number of the MCP server")
	token := flag.String("token", "", "Authentication token for the MCP server")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" {
		fmt.Println("❌ ERROR: All flags are required.")
		flag.Usage()
		os.Exit(1)
	}

	fmt.Println("📄 Fetching groups...")
	response, err := listGroups(*serverIP, *serverPort, *token)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	responseJSON, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response:")
	fmt.Println(string(responseJSON))
}
