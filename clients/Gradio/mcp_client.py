import json
import os
import sys

from typing import Optional
from contextlib import AsyncExitStack

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()  # load environment variables from .env


def generate_system_prompt(tools):
    """
    Generate a concise system prompt for the assistant.

    This prompt is internal and not displayed to the user.
    """
    prompt_generator = SystemPromptGenerator()
    tools_json = {"tools": tools}

    system_prompt = prompt_generator.generate_prompt(tools_json)
    system_prompt += """

**GENERAL GUIDELINES:**

1. Step-by-step reasoning:
   - Analyze tasks systematically.
   - Break down complex problems into smaller, manageable parts.
   - Verify assumptions at each step to avoid errors.
   - Reflect on results to improve subsequent actions.

2. Effective tool usage:
   - Explore:
     - Identify available information and verify its structure.
     - Check assumptions and understand data relationships.
   - Iterate:
     - Start with simple queries or actions.
     - Build upon successes, adjusting based on observations.
   - Handle errors:
     - Carefully analyze error messages.
     - Use errors as a guide to refine your approach.
     - Document what went wrong and suggest fixes.

3. Clear communication:
   - Explain your reasoning and decisions at each step.
   - Share discoveries transparently with the user.
   - Outline next steps or ask clarifying questions as needed.

EXAMPLES OF BEST PRACTICES:

- Working with databases:
  - Check schema before writing queries.
  - Verify the existence of columns or tables.
  - Start with basic queries and refine based on results.

- Processing data:
  - Validate data formats and handle edge cases.
  - Ensure integrity and correctness of results.

- Accessing resources:
  - Confirm resource availability and permissions.
  - Handle missing or incomplete data gracefully.

REMEMBER:
- Be thorough and systematic.
- Each tool call should have a clear and well-explained purpose.
- Make reasonable assumptions if ambiguous.
- Minimize unnecessary user interactions by providing actionable insights.

EXAMPLES OF ASSUMPTIONS:
- Default sorting (e.g., descending order) if not specified.
- Assume basic user intentions, such as fetching top results by a common metric.
"""
    return system_prompt


class MCPClient:
    def __init__(self, vllm_url, vllm_api_key):

        self.stdio = None
        self.write = None
        self._session_context = None
        self._streams_context = None
        self.name = ""

        self.server_params = None

        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.client = OpenAI(
            base_url=vllm_url,
            api_key=vllm_api_key,
            http_client=httpx.Client(verify=False)
            )

    async def connect_to_sse_server(self, server_url: str):
        """Connect to an MCP server running with SSE transport"""
        # Store the context managers so they stay alive
        self._streams_context = sse_client(url=server_url)
        streams = await self._streams_context.__aenter__()

        self._session_context = ClientSession(*streams)
        self.session: ClientSession = await self._session_context.__aenter__()

        # Initialize
        await self.session.initialize()

        # List available tools to verify connection
        print("Initialized SSE client...")
        print("Listing tools...")
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])


    async def connect_to_stdio_server(self, server_params, name):
            """Connect to an MCP server

            Args:
                server_script_path: Path to the server script (.py or .js)
            """
            self.name = name
            self.server_params = server_params
            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(self.server_params))
            self.stdio, self.write = stdio_transport
            self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))

            await self.session.initialize()


            # List available tools
            response = await self.session.list_tools()
            tools = response.tools
            print("\nConnected to server with tools:", [tool.name for tool in tools])
            return self.stdio, self.write


    async def cleanup(self):
        """Properly clean up the session and streams"""
        if self._session_context:
            await self._session_context.__aexit__(None, None, None)
        if self._streams_context:
            await self._streams_context.__aexit__(None, None, None)



async def load_config(config_path: str, server_name: str) -> StdioServerParameters:
        """Load the server configuration from a JSON file."""
        try:
            # debug
            print(f"Loading config from {config_path}")

            # Read the configuration file
            with open(config_path, "r") as config_file:
                config = json.load(config_file)

            # Retrieve the server configuration
            server_config = config.get("mcpServers", {}).get(server_name)
            if not server_config:
                error_msg = f"Server '{server_name}' not found in configuration file."
                print(error_msg)
                raise ValueError(error_msg)

            # Construct the server parameters
            result = StdioServerParameters(
                command=server_config["command"],
                args=server_config.get("args", []),
                env=server_config.get("env"),
            )

            # debug
            print(
                f"Loaded config: command='{result.command}', args={result.args}, env={result.env}"
            )

            # return result
            return result

        except FileNotFoundError:
            # error
            error_msg = f"Configuration file not found: {config_path}"
            print(error_msg)
            raise FileNotFoundError(error_msg)
        except json.JSONDecodeError as e:
            # json error
            error_msg = f"Invalid JSON in configuration file: {e.msg}"
            print(error_msg)
            raise json.JSONDecodeError(error_msg, e.doc, e.pos)
        except ValueError as e:
            # error
            print(str(e))
            raise

class SystemPromptGenerator:
    """
    A class for generating system prompts dynamically based on tools JSON and user inputs.
    """

    def __init__(self):
        """
        Initialize the SystemPromptGenerator with a default system prompt template.
        """
        self.template = """
        In this environment you have access to a set of tools you can use to answer the user's question.
        {{ FORMATTING INSTRUCTIONS }}
        String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.
        Here are the functions available in JSONSchema format:
        {{ TOOL DEFINITIONS IN JSON SCHEMA }}
        {{ USER SYSTEM PROMPT }}
        {{ TOOL CONFIGURATION }}
        """
        self.default_user_system_prompt = "You are an intelligent assistant capable of using tools to solve user queries effectively."
        self.default_tool_config = "No additional configuration is required."

    def generate_prompt(
        self, tools: dict, user_system_prompt: str = None, tool_config: str = None
    ) -> str:
        """
        Generate a system prompt based on the provided tools JSON, user prompt, and tool configuration.

        Args:
            tools (dict): The tools JSON containing definitions of the available tools.
            user_system_prompt (str): A user-provided description or instruction for the assistant (optional).
            tool_config (str): Additional tool configuration information (optional).

        Returns:
            str: The dynamically generated system prompt.
        """

        # set the user system prompt
        user_system_prompt = user_system_prompt or self.default_user_system_prompt

        # set the tools config
        tool_config = tool_config or self.default_tool_config

        # get the tools schema
        tools_json_schema = json.dumps(tools, indent=2)

        # perform replacements
        prompt = self.template.replace(
            "{{ TOOL DEFINITIONS IN JSON SCHEMA }}", tools_json_schema
        )
        prompt = prompt.replace("{{ FORMATTING INSTRUCTIONS }}", "")
        prompt = prompt.replace("{{ USER SYSTEM PROMPT }}", user_system_prompt)
        prompt = prompt.replace("{{ TOOL CONFIGURATION }}", tool_config)

        # return the prompt
        return prompt


# Default environment variables to inherit
DEFAULT_INHERITED_ENV_VARS = (
    ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"]
    if sys.platform != "win32"
    else [
        "APPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "PATH",
        "PROCESSOR_ARCHITECTURE",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "USERNAME",
        "USERPROFILE",
    ]
)


def get_default_environment() -> dict[str, str]:
    """
    Retrieve a dictionary of default environment variables to inherit.
    """

    # get the current environment
    env = {
        key: value
        for key in DEFAULT_INHERITED_ENV_VARS
        if (value := os.environ.get(key)) and not value.startswith("()")
    }

    # return the dictionary
    return env


def clean_response(response):
    # Remove artefacts from reply here
    response = response.replace("[TOOL_CALLS] ", "")
    if "```json" in response:
        response = response.replace("'''json", "").replace("'''", "")
    return response
