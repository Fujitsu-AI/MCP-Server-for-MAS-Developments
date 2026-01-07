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

type CreateSourcePayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendCreateSourceRequest(serverIP string, serverPort int, token, name, content string, groups []string) (string, error) {
	// Prepare the request payload
	payload := CreateSourcePayload{
		Command: "create_source",
		Token:   token,
		Arguments: map[string]interface{}{
			"name":    name,
			"content": content,
			"groups":  groups,
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
	name := flag.String("name", "", "Name of the new source")
	content := flag.String("content", "", "Content to be formatted as markdown")
	groups := flag.String("groups", "", "Comma-separated list of groups to assign the source to")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" || *name == "" || *content == "" {
		fmt.Println("❌ ERROR: All flags except 'groups' are required.")
		flag.Usage()
		os.Exit(1)
	}

	// Convert groups to a slice
	groupList := []string{}
	if *groups != "" {
		groupList = append(groupList, *groups)
	}

	// Send the request to create the source
	fmt.Println("📤 Sending request to create source...")
	response, err := sendCreateSourceRequest(*serverIP, *serverPort, *token, *name, *content, groupList)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response from server:")
	fmt.Println(response)
}
