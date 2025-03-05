<?php
/**
 * MCPContinueChatClient.php
 *
 * A PHP script acting as a Continue Chat Client. It connects to a server via TCP,
 * sends a Continue Chat request, and receives the server's response.
 *
 * Usage:
 * php MCPContinueChatClient.php --server-ip <IP> --server-port <Port> --token <Token> --conversation-id <ConversationID> --message <Message>
 */

/**
 * Function to parse command line arguments
 *
 * @param array $args Command line arguments
 * @return array Associative array of parsed arguments
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
                    fwrite(STDERR, "Error: --server-ip expects a value.\n");
                    exit(1);
                }
                break;
            case '--server-port':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['serverPort'] = intval($args[++$i]);
                } else {
                    fwrite(STDERR, "Error: --server-port expects a value.\n");
                    exit(1);
                }
                break;
            case '--token':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['token'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --token expects a value.\n");
                    exit(1);
                }
                break;
            case '--conversation-id':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['conversationId'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --conversation-id expects a value.\n");
                    exit(1);
                }
                break;
            case '--message':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['message'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --message expects a value.\n");
                    exit(1);
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
 * Function for interactively prompting a parameter (optional)
 *
 * @param string $prompt The prompt message
 * @return string User input
 */
function askQuestionPrompt($prompt) {
    if (preg_match('/^win/i', PHP_OS)) {
        // Windows-specific input prompt
        $vbscript = sys_get_temp_dir() . 'prompt_input.vbs';
        file_put_contents($vbscript, 'wscript.echo(InputBox("' . addslashes($prompt) . '", "", ""))');
        $response = shell_exec("cscript //nologo " . escapeshellarg($vbscript));
        unlink($vbscript);
        return trim($response);
    } else {
        // Unix/Linux input prompt
        echo $prompt;
        $handle = fopen("php://stdin", "r");
        $response = trim(fgets($handle));
        fclose($handle);
        return $response;
    }
}

/**
 * Function to send a Continue Chat request over a TCP connection
 *
 * @param string $serverIp Server IP address
 * @param int $serverPort Server port
 * @param array $payload Payload to send as an associative array
 * @return array Server response as an associative array
 * @throws Exception On connection errors or JSON parsing errors
 */
function sendContinueChatRequest($serverIp, $serverPort, $payload) {
    $jsonPayload = json_encode($payload);
    if ($jsonPayload === false) {
        throw new Exception("Error encoding JSON payload.");
    }

    $errno = 0;
    $errstr = '';
    $timeout = 30; // seconds
    $client = @fsockopen($serverIp, $serverPort, $errno, $errstr, $timeout);
    
    if (!$client) {
        throw new Exception("Connection error: $errstr ($errno)");
    }

    echo "🔗 Connected to server ({$serverIp}:{$serverPort}).\n";
    echo "📤 Sending payload: $jsonPayload\n";

    fwrite($client, $jsonPayload);

    $responseData = '';
    stream_set_timeout($client, $timeout);

    while (!feof($client)) {
        $data = fread($client, 1024);
        if ($data === false) {
            throw new Exception("Error reading data from server.");
        }
        if ($data === '') {
            break; // No more data
        }
        echo "📥 Received data: $data\n";
        $responseData .= $data;

        // Attempt to parse received data as JSON
        $parsedData = json_decode($responseData, true);
        if ($parsedData !== null) {
            echo "✅ JSON response successfully parsed.\n";
            fclose($client);
            return $parsedData;
        }

        // Check if the stream timed out
        $info = stream_get_meta_data($client);
        if ($info['timed_out']) {
            throw new Exception("Timeout waiting for data from server.");
        }
    }

    fclose($client);
    throw new Exception("Connection to server closed before a complete response was received.");
}

/**
 * Main function of the script
 */
function main($argv) {
    $parsedArgs = parseArguments($argv);
    $serverIp = $parsedArgs['serverIp'] ?? null;
    $serverPort = $parsedArgs['serverPort'] ?? null;
    $token = $parsedArgs['token'] ?? null;
    $conversationId = $parsedArgs['conversationId'] ?? null;
    $message = $parsedArgs['message'] ?? null;

    // Check if all required parameters are present
    if (!$serverIp || !$serverPort || !$token || !$conversationId || !$message) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPContinueChatClient.php --server-ip <IP> --server-port <Port> --token <Token> --conversation-id <ConversationID> --message <Message>\n");
        exit(1);
    }

    $payload = [
        "command" => "continue_chat",
        "token" => $token,
        "arguments" => [
            "chatId" => $conversationId,
            "question" => $message
        ]
    ];

    try {
        echo "💬 Sending Continue Chat request...\n";
        $response = sendContinueChatRequest($serverIp, $serverPort, $payload);
        echo "✅ Server Response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ ERROR: " . $e->getMessage() . "\n");
    }
}

main($argv);
?>
