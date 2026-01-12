import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';
import path from 'path'; // Neu: Für Pfad-Operationen
import os from 'os';     // Neu: Um das Home-Verzeichnis zu finden

// Hilfsfunktion: Tilde (~) und Pfade plattformübergreifend auflösen
function resolveHome(filepath) {
  if (filepath.startsWith('~')) {
    // Ersetzt "~" durch C:\Users\Name (Windows) oder /home/name (Linux)
    return path.join(os.homedir(), filepath.slice(1));
  }
  return path.resolve(filepath);
}

// Function to load the private key
function loadPrivateKey(inputPath) {
  if (!inputPath) {
    throw new Error(
      `No private key path provided. Please specify the path to the RSA-private key as an argument.\n` +
      `Example usage: node security/generate_decrypted_password.js ~/.ssh/id_rsa`
    );
  }

  // Pfad für das aktuelle Betriebssystem normalisieren
  const resolvedPath = resolveHome(inputPath);

  try {
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new Error(`Error reading private key at "${resolvedPath}": ${err.message}`);
  }
}

// Function for decryption (uses RSA-OAEP)
function decryptWithPrivateKey(encryptedData, privateKeyPem) {
  const ciphertext = Buffer.from(encryptedData, 'base64');
  
  // Hinweis: Falls der Private Key ein Passwort hat, müsste man hier
  // { key: privateKeyPem, passphrase: 'deinPasswort' } übergeben.
  // Hier gehen wir davon aus, dass der Key unverschlüsselt ist oder der Agent ihn handelt.
  const keyObj = crypto.createPrivateKey(privateKeyPem);

  const tryOaep = (hash) =>
    crypto.privateDecrypt(
      {
        key: keyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: hash, // try sha256 first, sha1 fallback if legacy
      },
      ciphertext
    );

  try {
    return tryOaep('sha256').toString('utf8');
  } catch (e256) {
    try {
      // Fallback für ältere Verschlüsselungen
      return tryOaep('sha1').toString('utf8');
    } catch (e1) {
      throw new Error(
        `Decryption failed with RSA-OAEP (tried SHA-256 and SHA-1). ` +
          `Ensure the ciphertext was created with RSA-OAEP using the same hash. ` +
          `Errors: [${e256.message}] / [${e1.message}]`
      );
    }
  }
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
      // .trim() ist wichtig, da Windows beim Pasten oft ein Newline anhängt
      resolve(answer.trim());
    });
  });
}

// Main function
async function main() {
  const privateKeyPath = process.argv[2]; // private key path as CLI arg

  try {
    const privateKey = loadPrivateKey(privateKeyPath);
    const encryptedPassword = await askEncryptedPassword('Please enter the encrypted password (base64): ');
    
    if (!encryptedPassword) {
        throw new Error("No password entered.");
    }

    const decryptedPassword = decryptWithPrivateKey(encryptedPassword, privateKey);
    console.log('Decrypted Password:', decryptedPassword);
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  }
}

main();