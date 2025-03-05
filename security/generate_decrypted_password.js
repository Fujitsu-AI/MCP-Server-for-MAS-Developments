import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';

// Function to load the private key
function loadPrivateKey(path) {
    if (!path) {
        throw new Error(
            `No private key path provided. Please specify the path to the RSA-private key as an argument.
			Example usage: node security/generate_decrypted_password.js ~/.ssh/id_rsa`
        );
    }

    try {
        return fs.readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(`Error reading private key at "${path}": ${err.message}`);
    }
}

// Function for decryption
function decryptWithPrivateKey(encryptedData, privateKey) {
    return crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_PADDING, // Ensure the padding matches the encryption
        },
        Buffer.from(encryptedData, 'base64')
    ).toString('utf8');
}

// Function to prompt for encrypted password input
function askEncryptedPassword(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Main function
async function main() {
    const privateKeyPath = process.argv[2]; // Get the private key path from command-line arguments

    try {
        const privateKey = loadPrivateKey(privateKeyPath); // Load the private key
        const encryptedPassword = await askEncryptedPassword('Please enter the encrypted password: '); // Prompt for encrypted password
        const decryptedPassword = decryptWithPrivateKey(encryptedPassword, privateKey); // Decrypt the password
        console.log('Decrypted Password:', decryptedPassword);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();