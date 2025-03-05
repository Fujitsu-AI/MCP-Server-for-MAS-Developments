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

type EditUserPayload struct {
	Command   string                 `json:"command"`
	Token     string                 `json:"token"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendEditUserRequest(serverIP string, serverPort int, token string, arguments map[string]interface{}) (string, error) {
	// Prepare the request payload
	payload := EditUserPayload{
		Command:   "edit_user",
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
	name := flag.String("name", "", "New name of the user")
	email := flag.String("email", "", "New email of the user")
	password := flag.String("password", "", "New password of the user")
	language := flag.String("language", "", "Preferred language of the user")
	timezone := flag.String("timezone", "", "Timezone of the user")
	roles := flag.String("roles", "", "Comma-separated list of roles to assign to the user")
	groups := flag.String("groups", "", "Comma-separated list of groups to assign to the user")
	usePublic := flag.Bool("usePublic", false, "Enable public knowledge base access")
	activateFtp := flag.Bool("activateFtp", false, "Activate FTP access")
	ftpPassword := flag.String("ftpPassword", "", "Password for FTP access")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *token == "" {
		fmt.Println("❌ ERROR: Required flags are missing.")
		flag.Usage()
		os.Exit(1)
	}

	// Prepare arguments map
	arguments := map[string]interface{}{}
	if *name != "" {
		arguments["name"] = *name
	}
	if *email != "" {
		arguments["email"] = *email
	}
	if *password != "" {
		arguments["password"] = *password
	}
	if *language != "" {
		arguments["language"] = *language
	}
	if *timezone != "" {
		arguments["timezone"] = *timezone
	}
	if *roles != "" {
		arguments["roles"] = *roles
	}
	if *groups != "" {
		arguments["groups"] = *groups
	}
	arguments["usePublic"] = *usePublic
	arguments["activateFtp"] = *activateFtp
	if *ftpPassword != "" {
		arguments["ftpPassword"] = *ftpPassword
	}

	// Send the request to edit the user
	fmt.Println("📤 Sending request to edit user...")
	response, err := sendEditUserRequest(*serverIP, *serverPort, *token, arguments)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✔️ Response from server:")
	fmt.Println(response)
}