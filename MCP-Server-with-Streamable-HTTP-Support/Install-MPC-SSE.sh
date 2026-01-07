#!/bin/bash
set -e

# Script to set up and build the MCP Server for MAS Developments (Fsas Technologies AI Team)

error_exit() {
  echo "❌ $1" >&2
  exit 1
}

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

if [[ $EUID -eq 0 ]]; then
  echo "⚠️ Warning: You are running the installation script as the Root user."
  echo "Installing as Root can lead to permission issues and potential security risks."

  if prompt_yes_no "Do you want to create a new user 'mcpuser' and continue the installation as this user?"; then
    if id "mcpuser" &>/dev/null; then
      echo "✔️ User 'mcpuser' already exists."
    else
      echo "Creating user 'mcpuser'..."
      useradd -m -s /bin/bash mcpuser || error_exit "Failed to create user 'mcpuser'."
      echo "✔️ User 'mcpuser' has been created."
    fi

    CURRENT_DIR=$(pwd)
    SCRIPT_NAME=$(basename "$0")
    PROJECT_NAME=$(basename "$CURRENT_DIR")
    NEW_PROJECT_PATH="/home/mcpuser/$PROJECT_NAME"

    if [[ "$CURRENT_DIR" != "$NEW_PROJECT_PATH" ]]; then
      echo "📁 Moving directory to '$NEW_PROJECT_PATH'..."
      mkdir -p "/home/mcpuser"
      cp -r "$CURRENT_DIR" "/home/mcpuser/"
      chown -R mcpuser:mcpuser "$NEW_PROJECT_PATH"
      echo "✔️ Directory moved and ownership changed."
    fi

    echo "🔄 Switching to user 'mcpuser' to continue installation..."
    # FIX: Hier wird nun der korrekte Dateiname verwendet
    sudo -u mcpuser -H bash "$NEW_PROJECT_PATH/$SCRIPT_NAME" || error_exit "Installation as 'mcpuser' failed."
    exit 0
  else
    error_exit "Installation as Root aborted."
  fi
fi

echo "🔍 Checking Node.js Version..."
node -v || error_exit "Node.js is not installed."

echo "📦 Installing project dependencies..."
rm -rf node_modules package-lock.json
npm install || error_exit "npm install failed."

echo "🛠️ Building the project..."
npm run build || error_exit "Build failed."

if [ -d "src/public" ]; then
    echo "🔧 Installing assets..."
    mkdir -p dist
    cp -r src/public/* dist/ 2>/dev/null || true
fi

if prompt_yes_no "Do you want to create SSL certificates now?"; then
  mkdir -p ~/.ssh/certs
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ~/.ssh/certs/server.key -out ~/.ssh/certs/server.crt -days 365 -subj "/CN=localhost"
  echo "✔️ SSL certificates created successfully."
fi

echo "✅ Setup and build complete!"