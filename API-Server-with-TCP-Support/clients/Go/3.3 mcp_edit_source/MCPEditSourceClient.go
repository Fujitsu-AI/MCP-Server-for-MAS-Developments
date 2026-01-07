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

type EditSourcePayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendEditSourceRequest(serverIP string, serverPort int, token, sourceID, title, content string, groups []string) (string, error) {
	// Prepare the request payload
	arguments := map[string]interface{}{
		"sourceId": sourceID,
	}
	if title != "" {
		arguments["title"] = title
	}
	if content != "" {
		arguments["content"] = content
	}
	if len(groups) > 0 {
		arguments["groups"] = groups
	}

	payload := EditSourcePayload{
		Command:   "edit_source",
		Token:     token,
		Arguments: arguments,
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
	sourceID := flag.String("source-id", "", "ID of the source to edit")
	title := flag.String("title", "", "New title for the source (optional)")
	content := flag.String("content", "", "Updated content in markdown format (optional)")
	groups := flag.String("groups", "", "Comma-separated list of updated groups (optional)")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" || *sourceID == "" {
		fmt.Println("❌ ERROR: Required flags are missing.")
		flag.Usage()
		os.Exit(1)
	}

	// Convert groups to a slice
	groupList := []string{}
	if *groups != "" {
		groupList = append(groupList, *groups)
	}

	// Send the request to edit the source
	fmt.Println("📤 Sending request to edit source...")
	response, err := sendEditSourceRequest(*serverIP, *serverPort, *token, *sourceID, *title, *content, groupList)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response from server:")
	fmt.Println(response)
}
