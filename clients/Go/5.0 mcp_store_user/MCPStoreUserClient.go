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

type StoreUserPayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendStoreUserRequest(serverIP string, serverPort int, token, name, email, password, language, timezone string, roles, groups []string, usePublic, activateFtp bool, ftpPassword string) (string, error) {
	// Prepare the request payload
	payload := StoreUserPayload{
		Command: "store_user",
		Token:   token,
		Arguments: map[string]interface{}{
			"name":        name,
			"email":       email,
			"password":    password,
			"language":    language,
			"timezone":    timezone,
			"roles":       roles,
			"groups":      groups,
			"usePublic":   usePublic,
			"activateFtp": activateFtp,
			"ftpPassword": ftpPassword,
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
	name := flag.String("name", "", "Name of the user")
	email := flag.String("email", "", "Email of the user")
	password := flag.String("password", "", "Password for the user")
	language := flag.String("language", "en", "Language code (optional)")
	timezone := flag.String("timezone", "Europe/Berlin", "Timezone (optional)")
	roles := flag.String("roles", "", "Comma-separated list of roles for the user (optional)")
	groups := flag.String("groups", "", "Comma-separated list of groups for the user (optional)")
	usePublic := flag.Bool("usePublic", false, "Use the public knowledge base")
	activateFtp := flag.Bool("activateFtp", false, "Activate FTP for the user")
	ftpPassword := flag.String("ftpPassword", "", "FTP password for the user (optional)")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" || *name == "" || *email == "" || *password == "" {
		fmt.Println("❌ ERROR: Required flags are missing.")
		flag.Usage()
		os.Exit(1)
	}

	// Convert roles and groups to slices
	roleList := []string{}
	if *roles != "" {
		roleList = append(roleList, *roles)
	}

groupList := []string{}
	if *groups != "" {
		groupList = append(groupList, *groups)
	}

	// Send the request to store the user
	fmt.Println("📤 Sending request to create a new user...")
	response, err := sendStoreUserRequest(*serverIP, *serverPort, *token, *name, *email, *password, *language, *timezone, roleList, groupList, *usePublic, *activateFtp, *ftpPassword)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response from server:")
	fmt.Println(response)
}