#!/bin/bash
set -e

# Script to set up and build the MCP Server for MAS Developments

# Function to display error messages and exit
error_exit() {
  echo "❌ $1" >&2
  exit 1
}

# Function to prompt user with a yes/no question
prompt_yes_no() {
  while true; do
    read -rp "$1 [y/n]: " yn
    case $yn in
        [Yy]* ) return 0;;
        [Nn]* ) return 1;;
        * ) echo "Please answer with y (yes) or n (no).";;
    esac
  done
}

# Check if the script is run as root
if [[ $EUID -eq 0 ]]; then
  echo "⚠️ Warning: You are running the installation script as the Root user."
  echo "Installing as Root can lead to permission issues and potential security risks."

  if prompt_yes_no "Do you want to create a new user 'mcpuser' and continue the installation as this user?"; then
    # Check if 'mcpuser' already exists
    if id "mcpuser" &>/dev/null; then
      echo "✔️ User 'mcpuser' already exists."
    else
      echo "Creating user 'mcpuser'..."
      useradd -m -s /bin/bash mcpuser || error_exit "Failed to create user 'mcpuser'."
      echo "✔️ User 'mcpuser' has been created."
      # Optional: Set a password for 'mcpuser' (uncomment the following lines if desired)
      # echo "Setting a password for 'mcpuser' (optional):"
      # passwd mcpuser
    fi

    # Define new project directory for mcpuser
    NEW_PROJECT_DIR="/home/mcpuser/MCP-Server-for-MAS-Developments"

    # Move the project directory to mcpuser's home directory if not already there
    CURRENT_DIR=$(pwd)
    PROJECT_NAME=$(basename "$CURRENT_DIR")
    if [[ "$CURRENT_DIR" != "/home/mcpuser/$PROJECT_NAME" ]]; then
      echo "📁 Moving project directory to '$NEW_PROJECT_DIR'..."
      mkdir -p "/home/mcpuser"
      mv "$CURRENT_DIR" "/home/mcpuser/" || error_exit "Failed to move the project directory."
      chown -R mcpuser:mcpuser "/home/mcpuser/$PROJECT_NAME" || error_exit "Failed to change ownership of the project directory."
      echo "✔️ Project directory moved and ownership changed."
    else
      echo "✔️ Project directory is already in the correct location."
    fi

    echo "🔄 Switching to user 'mcpuser' and continuing the installation script..."
    sudo -u mcpuser -H bash "/home/mcpuser/$PROJECT_NAME/InstallMPCServer.sh" || error_exit "Installation as 'mcpuser' failed."
    exit 0
  else
    error_exit "Installation as Root aborted."
  fi
fi

# Warning if not running as root
echo "⚠️ It is recommended not to run the installation script as the Root user."

# Check if npm is installed
echo "🔍 Checking if npm is installed..."
if ! command -v npm &> /dev/null; then
  error_exit "npm is not installed. Please install npm and try again. Installation aborted."
fi

# Install dependencies from package.json
echo "📦 Installing project dependencies..."
rm -rf node_modules package-lock.json
npm install || error_exit "npm install failed. Installation aborted."

# Install additional dependencies
echo "🔧 Installing additional dependencies..."
npm install dotenv winston moment chalk figlet express socket.io chokidar strip-ansi || error_exit "Failed to install additional dependencies. Installation aborted."

# Build the project
echo "🛠️ Building the project..."
npm run build || error_exit "Build failed. Installation aborted."

# Logfile Server
echo "🔧 Installing index.html..."
cp src/public dist/ -R

echo "✅ Setup and build complete!"

# Prompt user before executing the last two commands
if prompt_yes_no "Do you want to create SSL certificates now?"; then
  mkdir -p ~/.ssh/certs
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ~/.ssh/certs/server.key -out ~/.ssh/certs/server.crt -days 365 -subj "/CN=localhost"
  echo "✔️ SSL certificates created successfully."
else
  echo "⚠️ Skipping SSL certificate creation. You can run these commands manually later."
fi
