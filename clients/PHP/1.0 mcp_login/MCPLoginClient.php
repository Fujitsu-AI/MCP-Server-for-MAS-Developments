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
            case '--email':
                if (isset($args[$i + 1])) {
                    $parsedArgs['email'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --email expects a value.\n");
                    exit(1);
                }
                break;
            case '--password':
                if (isset($args[$i + 1])) {
                    $parsedArgs['password'] = $args[++$i];
                } else {
                    fwrite(STDERR, "Error: --password expects a value.\n");
                    exit(1);
                }
                break;
            default:
                fwrite(STDERR, "Warning: Unknown argument: {$args[$i]}\n");
        }
    }
    return $parsedArgs;
}

// Function for sending a request over a TCP connection
function sendRequest($serverIp, $serverPort, $payload) {
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

// Function for interactively asking for a password (optional)
function askPassword($prompt) {
    if (preg_match('/^win/i', PHP_OS)) {
        // Windows-specific password prompt
        $vbscript = sys_get_temp_dir() . 'prompt_password.vbs';
        file_put_contents($vbscript, 'wscript.echo(InputBox("' . addslashes($prompt) . '", "", "password here"))');
        $password = shell_exec("cscript //nologo " . escapeshellarg($vbscript));
        unlink($vbscript);
        return trim($password);
    } else {
        // Unix/Linux password prompt
        echo $prompt;
        system('stty -echo');
        $password = rtrim(fgets(STDIN), "\n");
        system('stty echo');
        echo "\n";
        return $password;
    }
}

// Main function
function main($argv) {
    $args = parseArguments($argv);
    $serverIp = $args['serverIp'] ?? null;
    $serverPort = $args['serverPort'] ?? null;
    $email = $args['email'] ?? null;
    $password = $args['password'] ?? null;

    // Check if all required parameters are present
    if (!$serverIp || !$serverPort || !$email || !$password) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPLoginClient.php --server-ip <IP> --server-port <Port> --email <Email> --password <Password>\n");
        exit(1);
    }

    $payload = [
        "command" => "login",
        "arguments" => [
            "email" => $email,
            "password" => $password
        ]
    ];

    try {
        echo "🔐 Logging in...\n";
        $response = sendRequest($serverIp, $serverPort, $payload);
        echo "✅ Server Response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ ERROR: " . $e->getMessage() . "\n");
    }
}

main($argv);
?>
