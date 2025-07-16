from pathlib import Path
from time import sleep

from clients.Gradio.Api import PrivateGPTAPI
from clients.Gradio.config import Config
import time
from datetime import datetime
from rss_parser import fetch_feed


config_file = Path.absolute(Path(__file__).parent / "config.json")
# Initialize configuration with required fields
config = Config(config_file=config_file, required_fields=["base_url"])
pgpt = PrivateGPTAPI(config)

# TODO replace document id after first run
document_id = "87c6a088-6359-4585-a1da-69f70036ced6"

def init_entry(groups):
    id = pgpt.add_source("This is a test!", groups, "News Minimalist")["documentId"]
    print(pgpt.get_document_info(id))


def update_task():
    print(f"Task executed at {datetime.now()}")

    text = fetch_feed("https://rss.beehiiv.com/feeds/4aF2pGVAEN.xml")
    pgpt.update_source(document_id, text, None, "News Minimalist.md")
    print(pgpt.get_document_info(document_id))

if document_id is None:
    init_entry(["News"])

while True:
    update_task()
    time.sleep(3600)  # Sleep for 1 hour (3600 seconds)



