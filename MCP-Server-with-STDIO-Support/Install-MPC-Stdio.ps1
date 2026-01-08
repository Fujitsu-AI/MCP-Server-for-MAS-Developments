<#
.SYNOPSIS
    Script to set up and build the MCP Server (Production Ready) for Windows 11.
    Emoji-free version to prevent encoding errors.
#>

$ErrorActionPreference = "Stop"

# Helper Funktion für Fehlerbehandlung
function Error-Exit {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

# 1. NODE VERSION CHECK
Write-Host "[INFO] Checking Node.js Version..." -ForegroundColor Cyan
if (Get-Command node -ErrorAction SilentlyContinue) {
    node -v
} else {
    Error-Exit "Node.js is not installed or not in PATH."
}

# 2. CLEAN & INSTALL
Write-Host "[INFO] Cleaning environment..." -ForegroundColor Cyan

# Lösche Ordner/Dateien falls vorhanden
$itemsToRemove = @("node_modules", "package-lock.json", "dist")
foreach ($item in $itemsToRemove) {
    if (Test-Path $item) {
        Remove-Item -Path $item -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Erstelle dist Ordner
New-Item -ItemType Directory -Path "dist" -Force | Out-Null

Write-Host "[INFO] Installing dependencies..." -ForegroundColor Cyan
# cmd /c wird genutzt für Kompatibilität
cmd /c "npm install"
if ($LASTEXITCODE -ne 0) { Error-Exit "npm install failed." }

# 3. SECURITY CHECK & FIX
Write-Host "[INFO] Checking for security vulnerabilities..." -ForegroundColor Cyan
cmd /c "npm audit fix"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Some vulnerabilities could not be fixed automatically." -ForegroundColor Yellow
}

# 4. BUILD LOGIC
Write-Host "[INFO] Compiling / Preparing Project..." -ForegroundColor Cyan

if (Test-Path "src/index.ts") {
    Write-Host "Found TypeScript source. Running tsc..." -ForegroundColor Green
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { Error-Exit "TypeScript compilation failed." }
} else {
    Write-Host "Preparing JavaScript modules..." -ForegroundColor Green
    if (Test-Path "src/index.js") {
        # Copy ALL necessary JS files to dist
        Copy-Item -Path "src/*.js" -Destination "dist/" -Force
        
        Write-Host "[OK] All JavaScript modules prepared in dist/" -ForegroundColor Green
    } else {
        Error-Exit "Source files (index.js) missing in src/!"
    }
}

# 5. ASSETS
Write-Host "[INFO] Finalizing distribution folders..." -ForegroundColor Cyan
if (Test-Path "src/public") {
    Copy-Item -Path "src/public" -Destination "dist/" -Recurse -Force
}

Write-Host "---"
Write-Host "[SUCCESS] Setup complete!" -ForegroundColor Green
Write-Host "To test your server we recommend to run the latest version of MCP Inspector:"
Write-Host "npx --yes @modelcontextprotocol/inspector@latest node dist/index.js" -ForegroundColor Cyan