import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';

// Function to read the public key
function loadPublicKey(path) {
    if (!path) {
        throw new Error(
            `No public key path provided. Please specify the path to the RSA-public key as an argument.
			Example usage: node security/generate_encrypted_password.js ~/.ssh/id_rsa_public.pem`
        );
    }

    try {
        return fs.readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(`Error reading public key at "${path}": ${err.message}`);
    }
}

// Function for encryption
function encryptWithPublicKey(data, publicKey) {
    return crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PADDING, // Explicitly set padding
        },
        Buffer.from(data)
    ).toString('base64');
}

// Prompt for password
function askPassword(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
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
    const publicKeyPath = process.argv[2]; // Get the public key path from command-line arguments

    try {
        const publicKey = loadPublicKey(publicKeyPath); // Load the public key
        const password = await askPassword('Please enter your password: '); // Prompt for the password
        const encryptedPassword = encryptWithPublicKey(password, publicKey); // Encrypt the password
        console.log('Encrypted Password:', encryptedPassword);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();