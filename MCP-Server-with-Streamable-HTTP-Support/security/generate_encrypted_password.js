import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import path from 'path'; // Neu hinzugefügt
import os from 'os';     // Neu hinzugefügt

// Hilfsfunktion: Tilde (~) im Pfad auflösen
function resolveHome(filepath) {
    if (filepath.startsWith('~')) {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}

// Function to read the public key
function loadPublicKey(inputPath) {
    if (!inputPath) {
        throw new Error(
            `No public key path provided. Please specify the path to the RSA-public key as an argument.\nExample usage: node security/generate_encrypted_password.js ~/.ssh/certs/id_rsa_public.pem`
        );
    }

    // Pfad bereinigen und ~ auflösen
    const resolvedPath = path.resolve(resolveHome(inputPath));

    try {
        return fs.readFileSync(resolvedPath, 'utf8');
    } catch (err) {
        // Zeigt nun den absoluten Pfad an, was beim Debuggen hilft
        throw new Error(`Error reading public key at "${resolvedPath}": ${err.message}`);
    }
}

// Function for encryption
function encryptWithPublicKey(data, publicKey) {
    return crypto.publicEncrypt(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
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
    const publicKeyPath = process.argv[2]; 

    try {
        const publicKey = loadPublicKey(publicKeyPath); 
        const password = await askPassword('Please enter your password: '); 
        const encryptedPassword = encryptWithPublicKey(password, publicKey); 
        console.log('Encrypted Password:', encryptedPassword);
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();