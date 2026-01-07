# Ensure all Python dependencies are installed
Write-Host "Ensuring that all Python dependencies are installed."
#pip install -r <directory> requirements.txt

# Execute the Python command with the specified config file
Write-Host "Starting the IoT MQTT Agent..."
python -m agents.IoTAgent.Python.iot_mqtt_agent --config agents\IoTAgent\config.json
