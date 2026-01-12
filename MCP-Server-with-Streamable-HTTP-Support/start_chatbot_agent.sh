#!/bin/bash

# Ensure all Python dependencies are installed
Write-Host "Ensuring that all Python dependencies are installed, please execute InstallChatBot.sh (Linux) first!"

# Execute the Python command to start the chatbot agent
echo "Starting the ChatBot Agent..."
python -m agents.ChatBotAgent.Python.chatbot_agent
