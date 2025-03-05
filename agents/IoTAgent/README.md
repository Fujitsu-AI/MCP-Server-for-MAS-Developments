# Fujitsu PrivateGPT MQTT IoT Agent
The **IoT MQTT Agent** is a Python application that connects to an MQTT broker, processes vehicle data, and logs messages as JSON records. In addition, it communicates with a Chatbot Agent to generate human-readable, logical sentences from raw data. This communication is performed using the standardized FIPA ACL (Agent Communication Language) protocol, ensuring interoperability in multi-agent environments.

---

## Features
- **MQTT Communication:**  
  Connects to an MQTT broker to subscribe to topics and receive vehicle data.

- **Data Logging:**  
  Records incoming messages as JSON records with timestamps, vehicle details, and parameter values. Data is saved locally and rotated based on file size limits.

- **Multi-Language Support:**  
  Processes messages in multiple languages (e.g., German and English) and stores generated sentences accordingly.

- **Chatbot Agent Integration:**  
  Utilizes a Chatbot Agent to generate logical sentences from incoming MQTT data. The request to the Chatbot Agent is structured as a FIPA ACL message.

- **FIPA ACL Standard:**  
  The agent leverages FIPA ACL for structured multi-agent communication. Each message includes standardized fields such as:
  - **Performative:** (`request` or `failure`)
  - **Sender:** (`IoT_MQTT_Agent`)
  - **Receiver:** (`Chatbot_Agent`)
  - **Language:** (`fipa-sl`)
  - **Ontology:** (`fujitsu-iot-ontology`)
  - **Content:** (The JSON parameters used to generate a logical sentence)

- **SFTP File Transfer:**  
  When log files exceed a size threshold, they are automatically uploaded to a remote SFTP server, connected to Private GPT bulk upload services, and archived locally.

---

## How It Works
1. **Configuration Loading:**  
   The agent loads its settings from a JSON configuration file (default: `pgpt_iot_agent.json`), which includes details for MQTT, SFTP, file handling, and the Chatbot Agent.

2. **MQTT Subscription:**  
   Once connected to the MQTT broker, the agent subscribes to a pre-defined topic to receive data from vehicles.

3. **Message Processing & Logging:**  
   Incoming MQTT messages are parsed, timestamped, and saved locally as JSON records. Additionally, the agent displays and logs these records.

4. **Interpreting Data via the Chatbot Agent:**  
   - The agent prepares a prompt based on the received data.
   - It then sends a **FIPA ACL** request to the Chatbot Agent with the necessary details.
   - If the Chatbot Agent returns a failure (e.g., due to a connectivity issue), the IoT Agent waits and retries the request until a successful response is received.
   - Upon receiving an OK response, the agent logs the generated sentence and saves it to a language-specific text file.

5. **File Management:**  
   Files are automatically rotated when they reach a configured size limit, ensuring continuous logging without manual intervention.

---

## Requirements
- **Python 3.x**

- **Python Libraries:**  
  The required libraries are listed in `requirements.txt` and include:
  - `paho-mqtt`
  - `paramiko`
  - `requests`
  - Plus standard libraries such as `json`, `logging`, `datetime`, etc.

---

## License
This project is licensed under the MIT License - see the LICENSE file for details.