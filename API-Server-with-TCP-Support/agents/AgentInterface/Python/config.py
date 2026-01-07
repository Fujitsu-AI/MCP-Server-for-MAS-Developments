# Python/config.py

import json
import os
import logging
from .language import languages


class ConfigError(Exception):
    pass


class Config:

    def __init__(self, config_file="config.json", required_fields=None):
        self.required_fields = required_fields if required_fields is not None else []
        self.config_file = config_file
        self.data = self.load_config()

        # 🔥 Sprache wird **vor** validate() gesetzt
        self.language = self.get("language", "en")
        if self.language not in languages:
            # Fallback zu Englisch, wenn die angegebene Sprache nicht unterstützt wird
            fallback_lang = "en"
            logging.warning(f"⚠️ Unsupported language '{self.language}', falling back to English.")
            self.language = fallback_lang
        self.lang = languages[self.language]  # ✅ Setzt self.lang vor validate()

        self.validate()


    def set_value(self, key, value):
        self.data[key] = value


    def set_value(self, key, value):
        self.data[key] = value

    def get_lang_message(self, key, **kwargs):
        """
        Sichere Methode zum Abrufen von Nachrichten aus dem Sprachwörterbuch.
        Wenn der Schlüssel nicht existiert, wird eine Standardnachricht zurückgegeben.
        """
        message = self.lang.get(key, "Message not defined.")
        try:
            return message.format(**kwargs)
        except KeyError as e:
            logging.error(f"Missing placeholder in language file for key '{key}': {e}")
            return message

    def load_config(self):
        if not os.path.exists(self.config_file):
            # Da die Sprache noch nicht geladen ist, verwenden wir Englisch für die Fehlermeldung
            fallback_lang = "en"
            message = languages[fallback_lang]['config_file_not_found'].format(config_file=self.config_file)
            logging.error(message)
            raise ConfigError(message)
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            fallback_lang = "en"
            message = languages[fallback_lang]['invalid_json_in_config'].format(error=str(e))
            logging.error(message)
            raise ConfigError(message)

    def validate(self):
        missing = [field for field in self.required_fields if field not in self.data]
        if missing:
            message = self.get_lang_message("missing_required_fields", fields=missing)
            logging.error(message)
            raise ConfigError(message)

    def get(self, key, default=None):
        return self.data.get(key, default)
