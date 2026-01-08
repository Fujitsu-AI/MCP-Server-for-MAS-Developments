<#
.SYNOPSIS
    Fsas Technologies AI Team - Robust Installation Script (v1.5) for Windows.
    Ported from Bash to PowerShell.
#>

$ErrorActionPreference = "Stop"

# --- HELPER FUNCTIONS ---

function Error-Exit {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Prompt-YesNo {
    param([string]$Question)
    while ($true) {
        $UserIn = Read-Host "$Question [y/n]"
        if ($UserIn -match "^[yY]") { return $true }
        if ($UserIn -match "^[nN]") { return $false }
        Write-Host "Please answer with y (yes) or n (no)." -ForegroundColor Yellow
    }
}

# --- 1. ENVIRONMENT CHECK (Root/User Switch removed for Windows) ---
# Hinweis: Der automatische User-Switch (mcpuser) wurde entfernt, 
# da dies unter Windows unüblich ist und komplexe Rechteverwaltung erfordert.
Write-Host "[INFO] Running as current Windows user: $env:USERNAME" -ForegroundColor Cyan

# --- 2. INSTALLATION ---
Write-Host "[INFO] Checking Environment..." -ForegroundColor Cyan

if (Get-Command node -ErrorAction SilentlyContinue) {
    node -v
} else {
    Error-Exit "Node.js is not installed or not in PATH."
}

if (-not (Test-Path "package.json")) {
    Error-Exit "package.json missing!"
}

Write-Host "[INFO] Installing dependencies..." -ForegroundColor Cyan
# Clean old files
$cleanup = @("package-lock.json", "node_modules")
foreach ($item in $cleanup) {
    if (Test-Path $item) { Remove-Item -Path $item -Recurse -Force -ErrorAction SilentlyContinue }
}

# Install
cmd /c "npm install"
if ($LASTEXITCODE -ne 0) { Error-Exit "npm install failed." }

# --- SECURITY AUDIT ---
Write-Host "[INFO] Checking for security vulnerabilities..." -ForegroundColor Cyan
cmd /c "npm audit fix"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Some vulnerabilities could not be fixed automatically. Please check 'npm audit' manually." -ForegroundColor Yellow
}

# --- 3. BUILD / PREPARE PROJECT ---
Write-Host "[INFO] Building / Preparing Project..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "dist" -Force | Out-Null

$hasTsConfig = Test-Path "tsconfig.json"
$hasSrc = Test-Path "src"
$hasTsFiles = $false
if ($hasSrc) { $hasTsFiles = (Get-ChildItem "src/*.ts" -ErrorAction SilentlyContinue).Count -gt 0 }

if ($hasTsConfig -and $hasSrc -and $hasTsFiles) {
    Write-Host "Found TypeScript files and config. Running tsc..." -ForegroundColor Green
    cmd /c "npm run build"
    if ($LASTEXITCODE -ne 0) { Error-Exit "TypeScript build failed." }
} else {
    Write-Host "No TypeScript project detected. Copying JavaScript directly..." -ForegroundColor Green
    if (Test-Path "src/index.js") {
        Copy-Item "src/*.js" -Destination "dist/" -Force
        # chmod ist unter Windows nicht notwendig
        Write-Host "[OK] JavaScript modules copied to dist/" -ForegroundColor Green
    } else {
        Error-Exit "Source files (src/index.js) not found!"
    }
}

# Assets
if (Test-Path "src/public") {
    Write-Host "[INFO] Installing assets..." -ForegroundColor Cyan
    Copy-Item "src/public" -Destination "dist/" -Recurse -Force
}

# --- SSL CERTIFICATES ---
if (Prompt-YesNo "Create SSL certificates?") {
    # Check if OpenSSL is available (z.B. durch Git Bash)
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        $certDir = "$env:USERPROFILE\.ssh\certs"
        if (-not (Test-Path $certDir)) {
            New-Item -ItemType Directory -Path $certDir -Force | Out-Null
        }
        
        Write-Host "Generating certificates in $certDir..." -ForegroundColor Cyan
        
        # Hinweis: MSYS/GitBash braucht manchmal "//" für Subjects, native binary "/"
        # Wir versuchen den Standardaufruf.
        try {
            openssl req -x509 -newkey rsa:2048 -nodes -keyout "$certDir\server.key" -out "$certDir\server.crt" -days 365 -subj "/CN=localhost"
            Write-Host "[OK] Certificates created." -ForegroundColor Green
        } catch {
            Write-Host "[ERROR] OpenSSL command failed. Ensure OpenSSL is configured correctly." -ForegroundColor Red
        }
    } else {
        Write-Host "[WARN] 'openssl' command not found." -ForegroundColor Yellow
        Write-Host "Please install Git for Windows (which includes OpenSSL) or install OpenSSL manually to generate certificates."
    }
}

Write-Host "---"
Write-Host "[SUCCESS] Setup complete! Start with: node dist/index.js" -ForegroundColor Green
Write-Host "To test your server, run the MCP Inspector on your local PC:"
Write-Host "npx --yes @modelcontextprotocol/inspector@latest" -ForegroundColor Cyan