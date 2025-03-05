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

type Payload struct {
	Command   string                 `json:"command"`
	Arguments map[string]interface{} `json:"arguments"`
}

func sendRequest(serverIP string, serverPort int, payload Payload) (map[string]interface{}, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", serverIP, serverPort))
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	_, err = conn.Write(payloadJSON)
	if err != nil {
		return nil, err
	}

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

	var response map[string]interface{}
	err = json.Unmarshal(responseBuffer.Bytes(), &response)
	if err != nil {
		return nil, err
	}

	return response, nil
}

func login(serverIP string, serverPort int, email, password string) (map[string]interface{}, error) {
	payload := Payload{
		Command: "login",
		Arguments: map[string]interface{}{
			"email":    email,
			"password": password,
		},
	}

	return sendRequest(serverIP, serverPort, payload)
}

func main() {
	serverIP := flag.String("server-ip", "", "IP address of the MCP server")
	serverPort := flag.Int("server-port", 0, "Port number of the MCP server")
	email := flag.String("email", "", "Email address for login")
	password := flag.String("password", "", "Password for login")

	flag.Parse()

	if *serverIP == "" || *serverPort == 0 || *email == "" || *password == "" {
		fmt.Println("❌ ERROR: All flags are required.")
		flag.Usage()
		os.Exit(1)
	}

	fmt.Println("🔐 Logging in...")
	response, err := login(*serverIP, *serverPort, *email, *password)
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	responseJSON, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		fmt.Printf("❌ ERROR: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Server Response:")
	fmt.Println(string(responseJSON))
}
