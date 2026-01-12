# InstallChatBot.ps1

# Konfiguration
$VenvName = "venv"
$ReqFile = "agents\ChatBotAgent\requirements.txt"

# Hilfsfunktion für Farben (ähnlich wie echo -e mit Farben)
function Log-Blue { param($Msg); Write-Host $Msg -ForegroundColor Cyan }
function Log-Green { param($Msg); Write-Host $Msg -ForegroundColor Green }
function Log-Red { param($Msg); Write-Host $Msg -ForegroundColor Red }
function Log-Yellow { param($Msg); Write-Host $Msg -ForegroundColor Yellow }

Log-Blue "=== Starte Installation des ChatBot Agents (Windows) ==="

# 1. Systemvoraussetzungen prüfen (Python allgemein)
Log-Blue "[1/4] Prüfe Systemvoraussetzungen..."
try {
    $pyVersion = python --version 2>&1
    Log-Green "Python gefunden: $pyVersion"
}
catch {
    Log-Red "FEHLER: Python konnte nicht gefunden werden."
    Log-Red "Bitte installieren Sie Python für Windows und fügen Sie es dem PATH hinzu."
    exit 1
}

# 2. Virtuelles Environment erstellen
Log-Blue "[2/4] Erstelle virtuelles Environment '$VenvName'..."
if (Test-Path $VenvName) {
    Log-Yellow "Environment '$VenvName' existiert bereits. Überspringe Erstellung."
}
else {
    python -m venv $VenvName
    if ($LASTEXITCODE -eq 0) {
        Log-Green "Environment erstellt."
    } else {
        Log-Red "Fehler beim Erstellen des Environments."
        exit 1
    }
}

# 3. Dependencies installieren
Log-Blue "[3/4] Installiere Abhängigkeiten..."

# Pfad zu Pip unter Windows (im Scripts Ordner)
$PipExe = ".\$VenvName\Scripts\pip.exe"

if (-not (Test-Path $PipExe)) {
    Log-Red "FEHLER: pip wurde nicht in $PipExe gefunden."
    exit 1
}

# Upgrade pip
& $PipExe install --upgrade pip

# Requests fixen (wie im Bash Script gefordert)
& $PipExe install requests

# Requirements installieren
if (Test-Path $ReqFile) {
    & $PipExe install -r $ReqFile
    if ($LASTEXITCODE -eq 0) {
        Log-Green "Requirements erfolgreich installiert."
    } else {
        Log-Red "Fehler bei der Installation der Requirements."
    }
}
else {
    Log-Red "FEHLER: $ReqFile nicht gefunden!"
    Log-Red "Bitte stellen Sie sicher, dass Sie im richtigen Verzeichnis sind."
    exit 1
}

# 4. Abschluss
Log-Blue "[4/4] Fertig!"
Write-Host "--------------------------------------------------------"
Write-Host "Um den Agenten zu starten, führen Sie folgende Befehle aus:"
Write-Host ""
# Hinweis: In PowerShell aktiviert man das Env anders als in Bash
Log-Green "  .\$VenvName\Scripts\Activate.ps1"
Log-Green "  python -m agents.ChatBotAgent.Python.chatbot_agent"
Write-Host "--------------------------------------------------------"