#!/bin/bash
set -e

# Script to set up and build the MCP Server (Production Ready)

error_exit() {
  echo "❌ $1" >&2
  exit 1
}

# 1. NODE VERSION CHECK
echo "🔍 Checking Node.js Version..."
node -v || error_exit "Node.js is not installed."

# 2. CLEAN & INSTALL
echo "📦 Cleaning environment..."
rm -rf node_modules package-lock.json dist
mkdir -p dist

echo "📥 Installing dependencies..."
npm install || error_exit "npm install failed."

# 3. SECURITY CHECK & FIX
echo "🛡️ Checking for security vulnerabilities..."
npm audit fix || echo "⚠️ Some vulnerabilities could not be fixed automatically."

# 4. BUILD LOGIC
echo "🛠️ Compiling / Preparing Project..."

if [ -f "src/index.ts" ]; then
    echo "Found TypeScript source. Running tsc..."
    npm run build || error_exit "TypeScript compilation failed."
else
    echo "Preparing JavaScript modules..."
    if [ -f "src/index.js" ]; then
        # Copy ALL necessary JS files to dist
        cp src/*.js dist/
        chmod 755 dist/index.js
        echo "✔️ All JavaScript modules prepared in dist/"
    else
        error_exit "Source files (index.js) missing in src/!"
    fi
fi

# 5. ASSETS
echo "📂 Finalizing distribution folders..."
[ -d "src/public" ] && cp -r src/public dist/

echo "---"
echo "✅ Setup complete!"
echo "🚀 To test your server: npx @modelcontextprotocol/inspector node dist/index.js"
