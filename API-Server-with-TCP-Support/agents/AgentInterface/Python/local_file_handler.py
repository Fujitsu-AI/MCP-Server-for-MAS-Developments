import os
import json

class LocalFileHandler:
    def __init__(self, base_name, local_dir, file_type, size_limit, remote_subdir, config, language_code):
        self.base_name = base_name
        self.local_dir = local_dir
        self.file_type = file_type
        self.size_limit = size_limit
        self.remote_subdir = remote_subdir
        self.config = config
        self.language_code = language_code
        self.current_file_path = self._create_new_file()

    def _create_new_file(self):
        os.makedirs(self.local_dir, exist_ok=True)
        file_path = os.path.join(self.local_dir, f"{self.base_name}.{self.file_type}")
        with open(file_path, "w", encoding="utf-8") as f:
            if self.file_type == "json":
                json.dump([], f)
        return file_path

    def append_record(self, record):
        if self.file_type != "json":
            raise ValueError("Only JSON records are supported.")
        with open(self.current_file_path, "r+", encoding="utf-8") as f:
            data = json.load(f)
            data.append(record)
            f.seek(0)
            json.dump(data, f, indent=4)

    def append_text(self, text):
        if self.file_type != "txt":
            raise ValueError("Only text files are supported.")
        with open(self.current_file_path, "a", encoding="utf-8") as f:
            f.write(text + "\n")
