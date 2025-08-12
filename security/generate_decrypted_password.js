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

// Function for decryption (uses RSA-OAEP)
function decryptWithPrivateKey(encryptedData, privateKeyPem) {
  const ciphertext = Buffer.from(encryptedData, 'base64');
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
    const decryptedPassword = decryptWithPrivateKey(encryptedPassword, privateKey);
    console.log('Decrypted Password:', decryptedPassword);
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  }
}

main();
