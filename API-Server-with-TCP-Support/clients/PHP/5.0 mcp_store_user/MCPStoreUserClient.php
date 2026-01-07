<?php
/**
 * MCPStoreUserClient.php
 *
 * A PHP script that acts as a Store User Client. It connects to a server via TCP,
 * sends a request to store a new user, and receives the server's response.
 *
 * Usage:
 * php MCPStoreUserClient.php --server-ip <IP> --server-port <Port> --token <Token> --name <Name> --email <Email> --password <Password> --language <Language> --timezone <Timezone> [--roles <Role1> <Role2> ...] [--groups <Group1> <Group2> ...] [--usePublic] [--activateFtp] [--ftpPassword <FtpPassword>]
 */

/**
 * Function to parse command line arguments
 *
 * @param array $args The command line arguments
 * @return array An associative array with the parsed arguments
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
            case '--token':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['token'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --token.\n");
                }
                break;
            case '--name':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['name'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --name.\n");
                }
                break;
            case '--email':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['email'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --email.\n");
                }
                break;
            case '--password':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['password'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --password.\n");
                }
                break;
            case '--language':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['language'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --language.\n");
                }
                break;
            case '--timezone':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['timezone'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --timezone.\n");
                }
                break;
            case '--roles':
                $parsedArgs['roles'] = [];
                while ($i + 1 < $argc && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['roles'][] = $args[++$i];
                }
                break;
            case '--groups':
                $parsedArgs['groups'] = [];
                while ($i + 1 < $argc && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['groups'][] = $args[++$i];
                }
                break;
            case '--usePublic':
                $parsedArgs['usePublic'] = true;
                break;
            case '--activateFtp':
                $parsedArgs['activateFtp'] = true;
                break;
            case '--ftpPassword':
                if (isset($args[$i + 1]) && !startsWith($args[$i + 1], '--')) {
                    $parsedArgs['ftpPassword'] = $args[++$i];
                } else {
                    fwrite(STDERR, "⚠️ Warning: No value provided for --ftpPassword.\n");
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
 * Function to interactively prompt for a parameter (optional)
 *
 * @param string $prompt The input prompt
 * @return string The user input
 */
function askQuestionPrompt($prompt) {
    if (preg_match('/^win/i', PHP_OS)) {
        // Windows specific input prompt
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
 * Function to send a Store User request over a TCP connection
 *
 * @param string $serverIp The server's IP address
 * @param int $serverPort The server's port
 * @param string $token The authentication token
 * @param array $args The arguments for the user to be processed
 * @return array The response received from the server as an associative array
 * @throws Exception On connection errors or JSON parsing errors
 */
function sendStoreUserRequest($serverIp, $serverPort, $token, $args) {
    $payload = [
        "command" => "store_user",
        "token" => $token,
        "arguments" => [
            "name" => $args['name'] ?? null,
            "email" => $args['email'] ?? null,
            "password" => $args['password'] ?? null,
            "language" => $args['language'] ?? null,
            "timezone" => $args['timezone'] ?? null,
            "roles" => $args['roles'] ?? [],
            "groups" => $args['groups'] ?? [],
            "usePublic" => $args['usePublic'] ?? false,
            "activateFtp" => $args['activateFtp'] ?? false,
            "ftpPassword" => $args['ftpPassword'] ?? null
        ]
    ];

    // Remove null or empty values from the arguments
    $payload['arguments'] = array_filter($payload['arguments'], function($value) {
        if (is_array($value)) {
            return !empty($value);
        }
        return $value !== null;
    });

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
    $token = $parsedArgs['token'] ?? null;
    $name = $parsedArgs['name'] ?? null;
    $email = $parsedArgs['email'] ?? null;
    $password = $parsedArgs['password'] ?? null;
    $language = $parsedArgs['language'] ?? null;
    $timezone = $parsedArgs['timezone'] ?? null;
    $roles = $parsedArgs['roles'] ?? [];
    $groups = $parsedArgs['groups'] ?? [];
    $usePublic = $parsedArgs['usePublic'] ?? false;
    $activateFtp = $parsedArgs['activateFtp'] ?? false;
    $ftpPassword = $parsedArgs['ftpPassword'] ?? null;

    // Check if all required parameters are present, otherwise prompt interactively
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
        $name = askQuestionPrompt('👤 Please enter the user\'s name: ');
    }
    if (!$email) {
        $email = askQuestionPrompt('📧 Please enter the user\'s email: ');
    }
    if (!$password) {
        $password = askQuestionPrompt('🔑 Please enter the user\'s password: ');
    }
    if (!$language) {
        $language = askQuestionPrompt('🌐 Please enter the user\'s preferred language (e.g., en, de): ');
    }
    if (!$timezone) {
        $timezone = askQuestionPrompt('🕰️ Please enter the user\'s timezone (e.g., Europe/Berlin): ');
    }
    // Roles and groups are optional and have already been handled by parseArguments
    // usePublic, activateFtp, and ftpPassword are also optional

    // Set default values for optional parameters if they are not present
    $roles = $roles ?: [];
    $groups = $groups ?: [];
    $usePublic = $usePublic ? true : false;
    $activateFtp = $activateFtp ? true : false;
    $ftpPassword = $ftpPassword ?: '';

    // Check if all required parameters are now present
    if (!$serverIp || !$serverPort || !$token || !$name || !$email || !$password || !$language || !$timezone) {
        fwrite(STDERR, "❌ ERROR: Missing required parameters.\n");
        fwrite(STDOUT, "Usage: php MCPStoreUserClient.php --server-ip <IP> --server-port <Port> --token <Token> --name <Name> --email <Email> --password <Password> --language <Language> --timezone <Timezone> [--roles <Role1> <Role2> ...] [--groups <Group1> <Group2> ...] [--usePublic] [--activateFtp] [--ftpPassword <FtpPassword>]\n");
        exit(1);
    }

    try {
        echo "🧑‍💻 Sending Store-User request...\n";
        $response = sendStoreUserRequest(
            $serverIp,
            $serverPort,
            $token,
            [
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'language' => $language,
                'timezone' => $timezone,
                'roles' => $roles,
                'groups' => $groups,
                'usePublic' => $usePublic,
                'activateFtp' => $activateFtp,
                'ftpPassword' => $ftpPassword
            ]
        );
        echo "✔️ Server response:\n";
        echo json_encode($response, JSON_PRETTY_PRINT) . "\n";
    } catch (Exception $e) {
        fwrite(STDERR, "❌ Error: " . $e->getMessage() . "\n");
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
