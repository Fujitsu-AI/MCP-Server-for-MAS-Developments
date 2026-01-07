# Python/language.py

languages = {
    "en": {
        "welcome": "🎉 PGPT Agent. Type your question or 'exit' to quit.",
        "invalid_group": (
            "❌ Invalid group(s): {groups}. Please correct and restart."
        ),
        "invalid_group_error": (
            "❌ Invalid group(s) found. Terminating the agent."
        ),
        "authentication_failed": (
            "🔒 Authentication failed. Exiting."
        ),
        "goodbye": "👋 Goodbye!",
        "interrupted": "👋 Goodbye!",
        "configuration_error": "🔴 Configuration Error: {error}",
        "unexpected_error": "🔴 Unexpected Error: {error}",
        "login_attempt": "🔑 Attempting login...",
        "login_success": "✅ Login successful.",
        "login_failed": "❌ Login failed: {message}",
        "logout_attempt": "🚪 Attempting to logout...",
        "logout_success": "✅ Logout successful.",
        "logout_failed": "⚠️ Logout failed: {message}",
        "connecting_to_server": (
            "🔄 Connecting to {ip}:{port} "
            "(attempt {attempt}/{retries})..."
        ),
        "connection_established": "✅ Connection established.",
        "sending_payload": "📤 Sending payload: {payload}",
        "received_response": "📥 Received response: {response}",
        "formatted_response": "📥 Received response (formatted):",
        "personal_groups_received": (
            "📂 Personal groups from server: {groups}"
        ),
        "personal_groups": "📂 Personal groups from server: {groups}",
        "no_personal_groups": (
            "⚠️ No personal groups retrieved from the server."
        ),
        "run_failed_auth": "🔒 Authentication failed. Exiting.",
        "user_interface_started": "🗣️ User interface started.",
        "user_question": "You: ",
        "agent_answer": "Agent: {answer}",
        "agent_error": "Agent: {error}",
        "knowledge_ai": (
            "🤖 AI is a field of computer science focused "
            "on machines mimicking human intelligence."
        ),
        "knowledge_python": (
            "🐍 Python was created by Guido van Rossum and released in 1991."
        ),
        "knowledge_ml": (
            "📚 ML is a subfield of AI that aims to let machines learn "
            "from data."
        ),
        "unsupported_language_fallback": (
            "🔴 Unsupported language '{language}'. Falling back to English."
        ),
        "config_file_not_found": (
            "🔴 Config file '{config_file}' not found."
        ),
        "invalid_json_in_config": (
            "🔴 Invalid JSON in config file: {error}"
        ),
        "missing_required_fields": (
            "🔴 Missing required fields: {fields}"
        ),
        "group_validation_error": "🔴 {error}",
        "invalid_json_response": "❌ Invalid JSON response received.",
        "connection_timed_out": "⚠️ Connection timed out.",
        "connection_error": "❌ Connection error: {error}",
        "retrying_in_seconds": "🔄 Retrying in {delay} seconds...",
        "all_retries_failed": "❌ All retries failed.",
        "no_answer_received": "No answer received.",
        "unknown_error": "Unknown error.",
        "invalid_message_response": "Invalid message format received.",
        # Ergänzte Schlüssel:
        "no_server_message": "No message from server.",
        "no_data_in_response": "No data in response.",
        "list_groups_failed": "Failed to list groups: {message}",
        "knowledge_response": "Knowledge response for input: {input}",
        "session_ended": "Session ended successfully.",
        "session_interrupted": "Session interrupted.",
        "invalid_json_response": "❌ Invalid JSON response received.",
        "connection_timed_out": "⚠️ Connection timed out.",
        "connection_error": "❌ Connection error: {error}",
        "retrying_in_seconds": "🔄 Retrying in {delay} seconds...",
        "all_retries_failed": "❌ All retries failed.",
        "no_answer_received": "No answer received.",
        "unknown_error": "Unknown error.",
        "invalid_message_response": "Invalid message format received.",
        # Ergänzte Schlüssel:
        "no_server_message": "No message from server.",
        "no_data_in_response": "No data in response.",
        "list_groups_failed": "Failed to list groups: {message}",
        "knowledge_response": "Knowledge response for input: {input}",
        "session_ended": "Session ended successfully.",
        "session_interrupted": "Session interrupted.",
        "no_token_logout": "No token found for logout."
    },
    "de": {
        "welcome": (
            "🎉 PrivateGPT Agent. Bereit für Ihre Fragen "
            "oder tippen Sie 'exit', um zu beenden."
        ),
        "invalid_group": (
            "❌ Ungültige Gruppe(n): {groups}. Korrigieren und neu starten."
        ),
        "invalid_group_error": (
            "❌ Ungültige Gruppe(n) gefunden. Beende den Agenten."
        ),
        "authentication_failed": (
            "🔒 Authentifizierung fehlgeschlagen. Beende den Agenten."
        ),
        "goodbye": "👋 Auf Wiedersehen!",
        "interrupted": "👋 Auf Wiedersehen!",
        "configuration_error": "🔴 Konfigurationsfehler: {error}",
        "unexpected_error": "🔴 Unerwarteter Fehler: {error}",
        "login_attempt": (
            "🔑 Versuche, mich anzumelden..."
        ),
        "login_success": "✅ Anmeldung erfolgreich.",
        "login_failed": "❌ Anmeldung fehlgeschlagen: {message}",
        "logout_attempt": (
            "🚪 Versuche, mich abzumelden..."
        ),
        "logout_success": "✅ Abmeldung erfolgreich.",
        "logout_failed": "⚠️ Abmeldung fehlgeschlagen: {message}",
        "connecting_to_server": (
            "🔄 Verbinde zu {ip}:{port} (Versuch {attempt}/{retries})..."
        ),
        "connection_established": "✅ Verbindung hergestellt.",
        "sending_payload": "📤 Sende Payload: {payload}",
        "received_response": "📥 Empfangene Antwort: {response}",
        "formatted_response": "📥 Empfangene Antwort (formatiert):",
        "personal_groups_received": (
            "📂 Personal groups vom Server: {groups}"
        ),
        "personal_groups": "📂 Persönliche Gruppen vom Server: {groups}",
        "no_personal_groups": (
            "⚠️ Keine persönlichen Gruppen vom Server abgerufen."
        ),
        "run_failed_auth": (
            "🔒 Authentifizierung fehlgeschlagen. Beende den Agenten."
        ),
        "user_interface_started": "🗣️ Benutzeroberfläche gestartet.",
        "user_question": "Sie: ",
        "agent_answer": "Agent: {answer}",
        "agent_error": "Agent: {error}",
        "knowledge_ai": (
            "🤖 KI ist ein Bereich der Informatik, der sich "
            "darauf konzentriert, Maschinen menschliche Intelligenz "
            "nachzuahmen."
        ),
        "knowledge_python": (
            "🐍 Python wurde von Guido van Rossum entwickelt "
            "und 1991 veröffentlicht."
        ),
        "knowledge_ml": (
            "📚 ML ist ein Teilbereich der KI, der darauf abzielt, "
            "Maschinen das Lernen aus Daten zu ermöglichen."
        ),
        "unsupported_language_fallback": (
            "🔴 Nicht unterstützte Sprache '{language}'. Fallback zu Englisch."
        ),
        "config_file_not_found": (
            "🔴 Config-Datei '{config_file}' nicht gefunden."
        ),
        "invalid_json_in_config": (
            "🔴 Ungültiges JSON in der Config-Datei: {error}"
        ),
        "missing_required_fields": (
            "🔴 Fehlende erforderliche Felder: {fields}"
        ),
        "group_validation_error": "🔴 {error}",
        "invalid_json_response": "❌ Ungültige JSON-Antwort empfangen.",
        "connection_timed_out": "⚠️ Verbindung zeitlich begrenzt.",
        "connection_error": "❌ Verbindungsfehler: {error}",
        "retrying_in_seconds": "⏳ Erneuter Versuch in {delay} Sekunden...",
        "all_retries_failed": "❌ Alle Wiederholungsversuche fehlgeschlagen.",
        "no_answer_received": "Keine Antwort erhalten.",
        "unknown_error": "Unbekannter Fehler.",
        "invalid_message_response": "Ungültiges Nachrichtenformat empfangen.",
        # Ergänzte Schlüssel:
        "no_server_message": "Keine Nachricht vom Server erhalten.",
        "no_data_in_response": "Keine Daten in der Antwort enthalten.",
        "list_groups_failed": "Auflisten der Gruppen fehlgeschlagen: {message}",
        "knowledge_response": "Wissensantwort für Eingabe: {input}",
        "session_ended": "Sitzung erfolgreich beendet.",
        "session_interrupted": "Sitzung unterbrochen.",
        "no_token_logout": "Kein Token für Abmeldung gefunden."
    },
    # Weitere Sprachen können hier hinzugefügt werden
}
