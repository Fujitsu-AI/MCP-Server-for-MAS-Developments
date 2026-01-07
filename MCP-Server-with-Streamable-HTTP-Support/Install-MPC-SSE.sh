#!/bin/bash
set -e

# --- Fsas Technologies AI Team - Robust Installation Script (v1.5) ---

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
  echo "⚠️ Warning: Running as Root. Switching to mcpuser..."
  if ! id "mcpuser" &>/dev/null; then
      useradd -m -s /bin/bash mcpuser
  fi

  CURRENT_DIR=$(pwd)
  SCRIPT_NAME=$(basename "$0")
  PROJECT_DIR_NAME=$(basename "$CURRENT_DIR")
  NEW_PROJECT_PATH="/home/mcpuser/$PROJECT_DIR_NAME"

  mkdir -p "$NEW_PROJECT_PATH"
  cp -a "$CURRENT_DIR/." "$NEW_PROJECT_PATH/"
  chown -R mcpuser:mcpuser "/home/mcpuser"
  
  sudo -u mcpuser -H bash -c "cd $NEW_PROJECT_PATH && bash ./$SCRIPT_NAME" || error_exit "Installation failed."
  exit 0
fi

# 2. INSTALLATION (LÄUFT ALS MCPUSER)
echo "🔍 Checking Environment..."
node -v
[ -f "package.json" ] || error_exit "package.json missing!"

echo "📦 Installing dependencies..."
rm -f package-lock.json
rm -rf node_modules
npm install || error_exit "npm install failed."

# --- NEU: SECURITY AUDIT ---
echo "🛡️ Checking for security vulnerabilities..."

npm audit fix || echo "⚠️ Some vulnerabilities could not be fixed automatically. Please check 'npm audit' manually."

# 3. BUILD / PREPARE PROJECT
echo "🛠️ Building / Preparing Project..."
mkdir -p dist

if [ -f "tsconfig.json" ] && [ -d "src" ] && ls src/*.ts >/dev/null 2>&1; then
    echo "Found TypeScript files and config. Running tsc..."
    npm run build || error_exit "TypeScript build failed."
else
    echo "No TypeScript project detected. Copying JavaScript directly..."
    if [ -f "src/index.js" ]; then
        cp src/*.js dist/
        chmod 755 dist/index.js
        echo "✔️ JavaScript modules copied to dist/"
    else
        error_exit "Source files (src/index.js) not found!"
    fi
fi

if [ -d "src/public" ]; then
    echo "🔧 Installing assets..."
    cp -r src/public/* dist/ 2>/dev/null || true
fi

if prompt_yes_no "Create SSL certificates?"; then
  mkdir -p ~/.ssh/certs
  openssl req -x509 -newkey rsa:2048 -nodes -keyout ~/.ssh/certs/server.key -out ~/.ssh/certs/server.crt -days 365 -subj "/CN=localhost"
fi

echo "---"
echo "✅ Setup complete! Start with: node dist/index.js"