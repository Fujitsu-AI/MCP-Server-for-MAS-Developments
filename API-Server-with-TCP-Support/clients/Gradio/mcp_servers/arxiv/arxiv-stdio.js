#!/usr/bin/env node

const { spawn } = require('child_process');
const { createInterface } = require('readline');

// Spawn the Python process
const pythonProcess = spawn('arxiv-mcp-server', [], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Set up readline interface for stdin
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Forward stdin to the Python process
rl.on('line', (line) => {
  pythonProcess.stdin.write(line + '\n');
});

// Forward stdout from the Python process
pythonProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// Forward stderr from the Python process
pythonProcess.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

// Handle process exit
pythonProcess.on('close', (code) => {
  console.error(`child process exited with code ${code}`);
  process.exit(code);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  pythonProcess.kill('SIGINT');
});
