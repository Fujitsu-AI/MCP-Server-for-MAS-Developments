#!/bin/bash

# Ensure all Python dependencies are installed
echo "Ensuring that all Python dependencies are installed."
#pip install -r <directory> requirements.txt

# Execute the Python command to start the chatbot agent
echo "Starting the ChatBot Agent..."
python -m agents.ChatBotAgent.Python.chatbot_agent
