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
            print(result)
            return result
        except Exception as e:
            print(e)
            return "Error receiving result"
