import asyncio
import re
from datetime import timedelta
from pathlib import Path

from mcp.server.fastmcp import FastMCP, Context
from Api import PrivateGPTAPI
from config import Config, ConfigError

mcp = FastMCP("PGPT", description="Interact with PrivateGPT.", dependencies=[])



def load_config():
    # Load configuration file
    try:
        # Get the absolute path to the config.json file
        config_file = Path.absolute(Path(__file__).parent / "config.json")
        # Initialize configuration with required fields
        config = Config(config_file=config_file, required_fields=["base_url"])
        return config
    except ConfigError as e:
        print(f"Configuration Error: {e}")
        return None



@mcp.tool()
async def chat_test(message: str) -> str:
    """Interact with a Knowledge database about """
    config = load_config()
    pgpt = PrivateGPTAPI(config)
    print(pgpt.chosen_groups)

    result = pgpt.create_chat(message)
    return result["data"]["answer"]

async def add_user(userName:str, userEmail:str, userPassword:str, userGroups: list) -> str:
    """Add a user to PrivateGPT """
    config = load_config()
    pgpt = PrivateGPTAPI(config)

    result = pgpt.add_user(userName, userEmail, userPassword,userGroups)
    return result




if __name__ == "__main__":
    #result = asyncio.run(chat_test("What do I need to enter the PrivateGPT testdrive?"))
    #print(result)

    result2 = asyncio.run(add_user("test", "test@test.com","Test1234!", []))
    print(result2)
