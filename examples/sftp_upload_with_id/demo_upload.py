from pathlib import Path

from clients.Gradio.Api import PrivateGPTAPI
from clients.Gradio.config import Config

config_file = Path.absolute(Path(__file__).parent / "config_ftp.json")
# Initialize configuration with required fields
config = Config(config_file=config_file, required_fields=["base_url"])

target_groups = ["PrivateGPT"] #make sure group(s) exist in PrivateGPT

pgpt = PrivateGPTAPI(config)

pgpt.upload_sftp("path_to_file.pdf")
documents = pgpt.get_sources_from_group("temp")
first_document_id = documents[0]["sourceId"]
print(first_document_id)

pgpt.update_source(first_document_id, groups=target_groups)
print(pgpt.get_document_info(first_document_id))


