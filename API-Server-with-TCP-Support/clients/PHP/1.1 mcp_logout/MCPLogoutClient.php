<?php
// Functions for parsing command line arguments
function parseArguments($args) {
    $parsedArgs = [];
    $argc = count($args);
    for ($i = 1; $i < $argc; $i++) {
        switch ($args[$i]) {
            case '--server-ip':
                if (isset($args[$i + 1])) {
                    $parsedArgs['serverIp'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --server-ip expects a value.\n");
                    exit(1);
                }
                break;
            case '--server-port':
                if (isset($args[$i + 1])) {
                    $parsedArgs['serverPort'] = intval($args[++$i]);
                } else {
                    fwrite(STDERR, "Error: --server-port expects a value.\n");
                    exit(1);
                }
                break;
            case '--token':
                if (isset($args[$i + 1])) {
                    $parsedArgs['token'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --token expects a value.\n");
                    exit(1);
                }
                break;
            default:
                fwrite(STDERR, "Warning: Unknown argument: {$args[$i]}\n");
        }
    }
    return $parsedArgs;
}

// Function for interactively asking for a token (optional)
function askToken($prompt) {
    if (preg_match('/^win/i', PHP_OS)) {
        // Windows-specific token prompt
        $vbscript = sys_get_temp_dir() . 'prompt_token.vbs';
        file_put_contents($vbscript, 'wscript.echo(InputBox("' . addslashes($prompt) . '", "", "token here"))');
        $token = shell_exec("cscript //nologo " . escapeshellarg($vbscript));
        unlink($vbscript);
        return trim($token);
    } else {
        // Unix/Linux token prompt
        echo $prompt;
        // Token input typically without echo
        if (shell_exec('which stty')) {
            system('stty -echo');
            $token = rtrim(fgets(STDIN), "\n");
            system('stty echo');
            echo "\n";
            return $token;
        } else {
            // Fallback if stty is unavailable
            return rtrim(fgets(STDIN), "\n");
        }
    }
}

// Function for sending a logout request over a TCP connection
function sendLogoutRequest($serverIp, $serverPort, $payload) {
    $jsonPayload = json_encode($payload);
    if ($jsonPayload === false) {
        throw new Exception("Error encoding JSON payload.");
    }

    $errno = 0;
    $errstr = '';
    $timeout = 30; // seconds
    $client = fsockopen($serverIp, $serverPort, $errno, $errstr, $timeout);
    
    if (!$client) {
        throw new Exception("Connection error: $errstr ($errno)");
    }

    echo "🔗 Connection to server established.\n";

    fwrite($client, $jsonPayload);

    $responseData = '';
    stream_set_timeout($client, $timeout);

    while (!feof($client)) {
        $data = fread($client, 1024);
        if ($data === false) {
            throw new Exception("Error reading data from server.");
        }
        $responseData .= $data;

        // Attempt to parse the received data as JSON
        $parsedData = json_decode($responseData, true);
        if ($parsedData !== null) {
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

    // Check if all required parameters except token are present
    if (!$serverIp || !$serverPort) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPLogoutClient.php --server-ip <IP> --server-port <Port> --token <Token>\n");
        exit(1);
    }

    // Interactively ask for token if not provided in arguments
    $authToken = $token;
    if (!$authToken) {
        $authToken = askToken('🔒 Please enter your authentication token: ');
    }

    if (empty($authToken)) {
        fwrite(STDERR, "❌ ERROR: Authentication token must not be empty.\n");
        exit(1);
    }

    $payload = [
        "command" => "logout",
        "token" => $authToken
    ];

    try {
        echo "🚪 Logging out...\n";
        $response = sendLogoutRequest($serverIp, $serverPort, $payload);
        echo "✅ Server Response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ ERROR: " . $e->getMessage() . "\n");
    }
}

main($argv);
?>
