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

type MCPRequest struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendMCPRequest(serverIP string, serverPort int, token, question string, usePublic bool, groups []string, language string) (map[string]interface{}, error) {
	// Prepare the request payload
	payload := MCPRequest{
		Command: "chat",
		Token:   token,
		Arguments: map[string]interface{}{
			"question":  question,
			"usePublic": usePublic,
			"groups":    groups,
			"language":  language,
		},
	}

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

func main() {
	serverIP := flag.String("server-ip", "", "IP address of the MCP server")
	serverPort := flag.Int("server-port", 0, "Port number of the MCP server")
	token := flag.String("token", "", "Authentication token")
	question := flag.String("question", "", "The question to ask the MCP server")
	usePublic := flag.Bool("use-public", false, "Use the public knowledge base")
	groups := flag.String("groups", "", "Comma-separated list of groups for retrieval-augmented generation")
	language := flag.String("language", "de", "Language code for the request (default: 'de')")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" || *question == "" {
		fmt.Println("❌ ERROR: Required flags are missing.")
		flag.Usage()
		os.Exit(1)
	}

	// Convert groups to a slice
	groupList := []string{}
	if *groups != "" {
		groupList = append(groupList, *groups)
	}

	// Send the question to the MCP server
	fmt.Println("💬 Sending request to the MCP server...")
	response, err := sendMCPRequest(*serverIP, *serverPort, *token, *question, *usePublic, groupList, *language)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	responseJSON, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Response from server:")
	fmt.Println(string(responseJSON))
}
