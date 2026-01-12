# Ensure all Python dependencies are installed
Write-Host "Ensuring that all Python dependencies are installed, please execute InstallChatBot.ps1 (Wiundows) first!"

# Execute the Python command to start the chatbot agent
Write-Host "Starting the ChatBot Agent..."
python3 -m agents.ChatBotAgent.Python.chatbot_agent
