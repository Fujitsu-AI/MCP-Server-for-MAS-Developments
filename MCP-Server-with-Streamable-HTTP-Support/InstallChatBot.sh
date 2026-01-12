#!/bin/bash

# Farben für die Ausgabe
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

VENV_NAME="venv"
REQ_FILE="agents/ChatBotAgent/requirements.txt"

echo -e "${BLUE}=== Starte Installation des ChatBot Agents ===${NC}"

# 1. Systemvoraussetzungen prüfen (python3-venv)
echo -e "${BLUE}[1/4] Prüfe Systemvoraussetzungen...${NC}"
if ! dpkg -s python3-venv >/dev/null 2>&1; then
    echo -e "python3-venv fehlt. Installiere nach (Root-Rechte erforderlich)..."
    sudo apt update && sudo apt install -y python3-venv
else
    echo -e "${GREEN}python3-venv ist bereits installiert.${NC}"
fi

# 2. Virtuelles Environment 'agents' erstellen
echo -e "${BLUE}[2/4] Erstelle virtuelles Environment '${VENV_NAME}'...${NC}"
if [ -d "$VENV_NAME" ]; then
    echo -e "Environment '${VENV_NAME}' existiert bereits. Überspringe Erstellung."
else
    python3 -m venv $VENV_NAME
    echo -e "${GREEN}Environment erstellt.${NC}"
fi

# 3. Dependencies installieren
echo -e "${BLUE}[3/4] Installiere Abhängigkeiten...${NC}"

# Wir nutzen direkt den pip im Environment, um 'source' Probleme im Skript zu umgehen
./$VENV_NAME/bin/pip install --upgrade pip
./$VENV_NAME/bin/pip install requests  # Fix für den vorherigen Fehler

if [ -f "$REQ_FILE" ]; then
    ./$VENV_NAME/bin/pip install -r $REQ_FILE
    echo -e "${GREEN}Requirements erfolgreich installiert.${NC}"
else
    echo -e "${RED}FEHLER: $REQ_FILE nicht gefunden!${NC}"
    echo -e "Bitte stellen Sie sicher, dass Sie im richtigen Verzeichnis sind."
    exit 1
fi

# 4. Abschluss
echo -e "${BLUE}[4/4] Fertig!${NC}"
echo -e "--------------------------------------------------------"
echo -e "Um den Agenten zu starten, führen Sie folgende Befehle aus:"
echo -e ""
echo -e "  ${GREEN}source $VENV_NAME/bin/activate${NC}"
echo -e "  ${GREEN}python3 -m agents.ChatBotAgent.Python.chatbot_agent${NC}"
echo -e "--------------------------------------------------------"
