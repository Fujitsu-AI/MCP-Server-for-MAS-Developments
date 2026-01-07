<?php
/**
 * MCPChatClient.php
 *
 * A PHP script that acts as a chat client. It connects to a server via TCP,
 * sends a chat request, and receives the server's response.
 *
 * Usage:
 * php MCPChatClient.php --server-ip <IP> --server-port <Port> --token <Token> --question <Question> [--use-public] [--groups <Group1> <Group2> ...] [--language <Language>]
 */

// Functions for parsing command line arguments
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
            case '--question':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['question'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --question expects a value.\n");
                    exit(1);
                }
                break;
            case '--use-public':
                $parsedArgs['usePublic'] = true;
                break;
            case '--groups':
                // Collect all group arguments until the next flag or end
                $parsedArgs['groups'] = [];
                while ($i + 1 < $argc && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['groups'][] = $args[++$i];
                }
                break;
            case '--language':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['language'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --language expects a value.\n");
                    exit(1);
                }
                break;
            default:
                fwrite(STDERR, "Warning: Unknown argument: {$args[$i]}\n");
        }
    }
    return $parsedArgs;
}

// Helper function to check if a string starts with a specific prefix
function startsWith($string, $prefix) {
    return substr($string, 0, strlen($prefix)) === $prefix;
}

// Function for interactively prompting a parameter (optional)
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

// Function to send a chat request over a TCP connection
function sendChatRequest($serverIp, $serverPort, $payload) {
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

    echo "🔗 Connection to server established.\n";
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

        // Attempt to parse the received data as JSON
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
    throw new Exception("Connection to the server was closed before a complete response was received.");
}

// Main function
function main($argv) {
    $args = parseArguments($argv);
    $serverIp = $args['serverIp'] ?? null;
    $serverPort = $args['serverPort'] ?? null;
    $token = $args['token'] ?? null;
    $question = $args['question'] ?? null;
    $usePublic = $args['usePublic'] ?? false;
    $groups = $args['groups'] ?? [];
    $language = $args['language'] ?? 'en'; // Default to English

    // Check if all required parameters are present
    if (!$serverIp || !$serverPort || !$token || !$question) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPChatClient.php --server-ip <IP> --server-port <Port> --token <Token> --question <Question> [--use-public] [--groups <Group1> <Group2> ...] [--language <Language>]\n");
        exit(1);
    }

    $payload = [
        "command" => "chat",
        "token" => $token,
        "arguments" => [
            "question" => $question,
            "usePublic" => $usePublic,
            "groups" => $groups,
            "language" => $language
        ]
    ];

    try {
        echo "💬 Sending chat request...\n";
        $response = sendChatRequest($serverIp, $serverPort, $payload);
        echo "✅ Server Response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ ERROR: " . $e->getMessage() . "\n");
    }
}

main($argv);
?>
