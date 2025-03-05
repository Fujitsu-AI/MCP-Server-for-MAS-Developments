<?php
/**
 * MCPDeleteUserClient.php
 *
 * A PHP script that acts as a Delete User Client. It connects to a server via TCP,
 * sends a request to delete an existing user, and receives the server's response.
 *
 * Usage:
 * php MCPDeleteUserClient.php --server-ip <IP> --server-port <Port> --email <Email> --token <Token>
 */

/**
 * Function to parse command line arguments
 *
 * @param array $args Array of command line arguments
 * @return array Associative array with parsed arguments
 */
function parseArguments($args) {
    $parsedArgs = [];
    $argc = count($args);
    for ($i = 1; $i < $argc; $i++) {
        switch ($args[$i]) {
            case '--server-ip':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['serverIp'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --server-ip.\n");
                }
                break;
            case '--server-port':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['serverPort'] = intval($args[++$i]);
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --server-port.\n");
                }
                break;
            case '--email':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['email'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --email.\n");
                }
                break;
            case '--token':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['token'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --token.\n");
                }
                break;
            default:
                fwrite(STDERR, "⚠️ Warning: Unknown argument: {$args[$i]}\n");
        }
    }
    return $parsedArgs;
}

/**
 * Helper function to check if a string starts with a specific prefix
 *
 * @param string $string The string to check
 * @param string $prefix The prefix
 * @return bool True if the string starts with the prefix, otherwise False
 */
function startsWith($string, $prefix) {
    return substr($string, 0, strlen($prefix)) === $prefix;
}

/**
 * Function to send a Delete User request over a TCP connection
 *
 * @param string $serverIp The server's IP address
 * @param int $serverPort The server's port
 * @param string $email The email of the user to be deleted
 * @param string $token The authentication token
 * @return array The response received from the server as an associative array
 * @throws Exception On connection errors or JSON parsing errors
 */
function sendDeleteUserRequest($serverIp, $serverPort, $email, $token) {
    $payload = [
        "command" => "delete_user",
        "token" => $token,
        "arguments" => [
            "email" => $email
        ]
    ];

    $jsonPayload = json_encode($payload);
    if ($jsonPayload === false) {
        throw new Exception("Error while encoding the JSON payload: " . json_last_error_msg());
    }

    $errno = 0;
    $errstr = '';
    $timeoutDuration = 10; // Seconds (10 seconds timeout)
    $client = @fsockopen($serverIp, $serverPort, $errno, $errstr, $timeoutDuration);

    if (!$client) {
        throw new Exception("Connection error: $errstr ($errno)");
    }

    echo "🔗 Connected to server ({$serverIp}:{$serverPort}).\n";
    echo "📤 Sending Payload: {$jsonPayload}\n";

    fwrite($client, $jsonPayload);

    $responseData = '';
    stream_set_timeout($client, $timeoutDuration);

    while (!feof($client)) {
        $data = fread($client, 1024);
        if ($data === false) {
            throw new Exception("Error reading data from server.");
        }
        if ($data === '') {
            break; // No more data
        }
        echo "📥 Received data: {$data}\n";
        $responseData .= $data;

        // Attempt to parse the received data as JSON
        $parsedData = json_decode($responseData, true);
        if ($parsedData !== null) {
            echo "✅ JSON response successfully parsed.\n";
            fclose($client);
            return $parsedData;
        }

        // Check if the stream has timed out
        $info = stream_get_meta_data($client);
        if ($info['timed_out']) {
            throw new Exception("Timeout while waiting for data from server.");
        }
    }

    fclose($client);
    throw new Exception("Connection to server was closed before a complete response was received.");
}

/**
 * Main function of the script
 */
function main($argv) {
    $parsedArgs = parseArguments($argv);
    $serverIp = $parsedArgs['serverIp'] ?? null;
    $serverPort = $parsedArgs['serverPort'] ?? null;
    $email = $parsedArgs['email'] ?? null;
    $token = $parsedArgs['token'] ?? null;

    // Check if all required parameters are present
    if (!$serverIp || !$serverPort || !$email || !$token) {
        fwrite(STDERR, "❌ ERROR: --server-ip, --server-port, --email, and --token are required.\n");
        fwrite(STDOUT, "📖 Example: php MCPDeleteUserClient.php --server-ip 192.168.0.1 --server-port 5000 --email roy@acme.com --token YOUR_AUTH_TOKEN\n");
        exit(1);
    }

    try {
        echo "🗑️ Sending Delete-User request...\n";
        $response = sendDeleteUserRequest(
            $serverIp,
            $serverPort,
            $email,
            $token
        );
        echo "✔️ Server response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ Error deleting user: " . $e->getMessage() . "\n");
    }
}

// Check if PHP version is at least 7.1 (for better features)
if (version_compare(PHP_VERSION, '7.1.0') < 0) {
    fwrite(STDERR, "❌ ERROR: This script requires PHP version 7.1 or higher.\n");
    exit(1);
}

// Call the main function
main($argv);
?>
