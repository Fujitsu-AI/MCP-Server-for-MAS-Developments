import json
import os
import uuid
from typing import Optional
from contextlib import AsyncExitStack

import httpx
from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client

from dotenv import load_dotenv
from openai import OpenAI

from mcpcli.chat_handler import generate_system_prompt

load_dotenv()  # load environment variables from .env

class MCPClient:
    def __init__(self, vllm_url, vllm_api_key):

        self._session_context = None
        self._streams_context = None

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


    async def connect_to_stdio_server(self, server_script_path: str):
            """Connect to an MCP server

            Args:
                server_script_path: Path to the server script (.py or .js)
            """
            is_python = server_script_path.endswith('.py')
            is_js = server_script_path.endswith('.js')
            if not (is_python or is_js):
                raise ValueError("Server script must be a .py or .js file")

            command = "python" if is_python else "node"
            self.server_params = StdioServerParameters(
                command=command,
                args=[server_script_path],
                env=None
            )

            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(self.server_params))
            self.stdio, self.write = stdio_transport
            self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))

            await self.session.initialize()


            # List available tools
            response = await self.session.list_tools()
            tools = response.tools
            print("\nConnected to server with tools:", [tool.name for tool in tools])

    async def cleanup(self):
        """Properly clean up the session and streams"""
        if self._session_context:
            await self._session_context.__aexit__(None, None, None)
        if self._streams_context:
            await self._streams_context.__aexit__(None, None, None)

    async def call_tool(self, tool_name, raw_arguments):
        print("calling tool")
        try:
            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(self.server_params))
            self.stdio, self.write = stdio_transport
            self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))
            result = await self.session.call_tool(tool_name, raw_arguments)
            return result
        except Exception as e:
            print(e)
            return "Error receiving result"

    def generate_system_prompt(self, tools):
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


