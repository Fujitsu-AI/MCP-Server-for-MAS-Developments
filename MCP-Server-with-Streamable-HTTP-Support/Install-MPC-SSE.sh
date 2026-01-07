#!/bin/bash
set -e

# --- Fsas Technologies AI Team - MCP Installation Script (v1.5) ---

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

# 1. ROOT-CHECK & USER-SWITCH
if [[ $EUID -eq 0 ]]; then
  echo "⚠️ Warning: You are running the installation script as the Root user."
  
  if prompt_yes_no "Do you want to create/use user 'mcpuser' and continue as this user?"; then
    if ! id "mcpuser" &>/dev/null; then
      echo "Creating user 'mcpuser'..."
      useradd -m -s /bin/bash mcpuser || error_exit "Failed to create user."
    fi

    CURRENT_DIR=$(pwd)
    SCRIPT_NAME=$(basename "$0")
    PROJECT_DIR_NAME=$(basename "$CURRENT_DIR")
    NEW_PROJECT_PATH="/home/mcpuser/$PROJECT_DIR_NAME"

    echo "📁 Preparing directory '$NEW_PROJECT_PATH'..."
    mkdir -p "$NEW_PROJECT_PATH"
    # Kopiere den INHALT des aktuellen Ordners in das neue Ziel
    cp -a "$CURRENT_DIR/." "$NEW_PROJECT_PATH/"
    chown -R mcpuser:mcpuser "/home/mcpuser"
    
    echo "🔄 Switching to user 'mcpuser' to continue installation..."
    # Wechselt explizit in das neue Home-Verzeichnis und startet dort das Skript
    sudo -u mcpuser -H bash -c "cd $NEW_PROJECT_PATH && bash ./$SCRIPT_NAME" || error_exit "Installation as 'mcpuser' failed."
    exit 0
  else
    error_exit "Installation as Root aborted."
  fi
fi

# 2. INSTALLATION (LÄUFT ALS MCPUSER)
echo "🔍 Checking Environment..."
node -v || error_exit "Node.js is not installed."
[ -f "package.json" ] || error_exit "package.json not found in $(pwd)!"

echo "📦 Installing project dependencies..."
rm -f package-lock.json
rm -rf node_modules
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
echo "🚀 Start with: node dist/index.js"