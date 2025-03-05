<?php
/**
 * MCPCreateSourceClient.php
 *
 * A PHP script acting as a Create Source Client. It connects to a server via TCP,
 * sends a request to create a new source, and receives the server's response.
 *
 * Usage:
 * php MCPCreateSourceClient.php --server-ip <IP> --server-port <Port> --token <Token> --name <Name> --content <Content> [--groups <Group1> <Group2> ...]
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
            case '--name':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['name'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --name expects a value.\n");
                    exit(1);
                }
                break;
            case '--content':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['content'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --content expects a value.\n");
                    exit(1);
                }
                break;
            case '--groups':
                // Collect all group arguments until the next flag or end
                $parsedArgs['groups'] = [];
                while ($i + 1 < $argc && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['groups'][] = $args[++$i];
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
 * Function to send a Create Source request over a TCP connection
 *
 * @param string $serverIp The server's IP address
 * @param int $serverPort The server's port
 * @param array $payload The payload to send as an associative array
 * @return array The response received from the server as an associative array
 * @throws Exception On connection errors or JSON parsing errors
 */
function sendCreateSourceRequest($serverIp, $serverPort, $payload) {
    $jsonPayload = json_encode($payload);
    if ($jsonPayload === false) {
        throw new Exception("Error while coding the JSON payload: " . json_last_error_msg());
    }

    $errno = 0;
    $errstr = '';
    $timeout = 30; // seconds
    $client = @fsockopen($serverIp, $serverPort, $errno, $errstr, $timeout);
    
    if (!$client) {
        throw new Exception("Connection error: $errstr ($errno)");
    }

    echo "🔗 Connected to the server ({$serverIp}:{$serverPort}).\n";
    echo "📤 Sending payload: $jsonPayload\n";

    fwrite($client, $jsonPayload);

    $responseData = '';
    stream_set_timeout($client, $timeout);

    while (!feof($client)) {
        $data = fread($client, 1024);
        if ($data === false) {
            throw new Exception("Error reading data from the server.");
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
            throw new Exception("Timeout waiting for data from the server.");
        }
    }

    fclose($client);
    throw new Exception("Connection to the server was closed before a complete response was received.");
}

/**
 * Main function of the script
 */
function main($argv) {
    $parsedArgs = parseArguments($argv);
    $serverIp = $parsedArgs['serverIp'] ?? null;
    $serverPort = $parsedArgs['serverPort'] ?? null;
    $token = $parsedArgs['token'] ?? null;
    $name = $parsedArgs['name'] ?? null;
    $content = $parsedArgs['content'] ?? null;
    $groups = $parsedArgs['groups'] ?? null;

    // Interactively prompt for missing parameters
    if (!$serverIp) {
        $serverIp = askQuestionPrompt('🔗 Please enter the server IP: ');
    }
    if (!$serverPort) {
        $portInput = askQuestionPrompt('🔗 Please enter the server port: ');
        $serverPort = intval($portInput);
        if ($serverPort <= 0) {
            fwrite(STDERR, "❌ ERROR: Invalid server port.\n");
            exit(1);
        }
    }
    if (!$token) {
        $token = askQuestionPrompt('🔒 Please enter your authentication token: ');
    }
    if (!$name) {
        $name = askQuestionPrompt('📛 Please enter the name of the new source: ');
    }
    if (!$content) {
        $content = askQuestionPrompt('📝 Please enter the content of the new source (Markdown): ');
    }
    if (!$groups) {
        $groupsInput = askQuestionPrompt('👥 Please enter groups (space-separated, optional): ');
        $groups = $groupsInput ? explode(' ', $groupsInput) : [];
    }

    // Check if all required parameters are now present
    if (!$serverIp || !$serverPort || !$token || !$name || !$content) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPCreateSourceClient.php --server-ip <IP> --server-port <Port> --token <Token> --name <Name> --content <Content> [--groups <Group1> <Group2> ...]\n");
        exit(1);
    }

    $payload = [
        "command" => "create_source",
        "token" => $token,
        "arguments" => [
            "name" => $name,
            "content" => $content,
            "groups" => $groups
        ]
    ];

    try {
        echo "🛠️ Sending Create Source request...\n";
        $response = sendCreateSourceRequest($serverIp, $serverPort, $payload);
        echo "✅ Server Response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ ERROR: " . $e->getMessage() . "\n");
    }
}

// Ensure PHP version is at least 7.1
if (version_compare(PHP_VERSION, '7.1.0') < 0) {
    fwrite(STDERR, "❌ ERROR: This script requires PHP version 7.1 or higher.\n");
    exit(1);
}

// Call the main function
main($argv);
?>
