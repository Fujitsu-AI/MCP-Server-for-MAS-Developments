import argparse
import asyncio
import json
import os
import uuid
from typing import Optional
from contextlib import AsyncExitStack


from mcp import ClientSession
from mcp.client.sse import sse_client

from dotenv import load_dotenv
from openai import OpenAI

from mcpcli.chat_handler import generate_system_prompt

load_dotenv()  # load environment variables from .env


class MCPClient:
    def __init__(self):

        self._session_context = None
        self._streams_context = None
        PGPT_API_KEY = os.getenv("PGPT_API_KEY")
        PGPT_OAI_BASE_URL = os.getenv("PGPT_OAI_BASE_URL")


        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.client = OpenAI(
                api_key=PGPT_API_KEY,
                base_url=PGPT_OAI_BASE_URL  # change the default port if needed
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

    async def cleanup(self):
        """Properly clean up the session and streams"""
        if self._session_context:
            await self._session_context.__aexit__(None, None, None)
        if self._streams_context:
            await self._streams_context.__aexit__(None, None, None)

    def convert_to_openai_tools(self, tools):
        """Convert tools into OpenAI-compatible function definitions."""
        openai_tools = []
        for tool in tools:

            inputScheme = tool.get("inputSchema", {})

            entry = {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": inputScheme
                },
            }

            openai_tools.append(entry)

        return openai_tools

    async def process_query(self, query: str) -> str:
        """Process a query using PGPT and available tools"""

        response = await self.session.list_tools()
        available_tools = [{
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.inputSchema
        } for tool in response.tools]

        tools = self.convert_to_openai_tools(available_tools)

        #system_prompt = generate_system_prompt(tools)
        messages = []

        messages.append(
            {
                "role": "user",
                "content": query
            }
        )

        # Initial PGPT API call
        response = self.client.chat.completions.create(
            model="pgpt-mistral-nemo-12b",
            messages=messages,
            tools=tools or None,
            extra_body={
                "groups": [],
                "newSession": False
            },
            stream=False

        )
        # Process response and handle tool calls
        tool_results = []
        final_text = []

        message = response.choices[0].message
        print(message)
        tool_calls = []

        # Convert Ollama tool calls to OpenAI format
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool in message.tool_calls:
                print(tool.function.arguments)
                tool_calls.append(
                    {
                        "id": str(uuid.uuid4()),  # Generate unique ID
                        "type": "function",
                        "function": {
                            "name": tool.function.name,
                            "arguments":tool.function.arguments,
                        },
                    }
                )



        if tool_calls:
            for tool_call in tool_calls:
                # Extract tool_name and raw_arguments as before
                tool_call_id = str(uuid.uuid4())
                if hasattr(tool_call, "id"):
                    tool_call_id = str(tool_call.id)

                if hasattr(tool_call, "function"):
                    print(tool_call.function)
                    tool_name = getattr(tool_call.function, "name", "unknown tool")
                    raw_arguments = getattr(tool_call.function, "arguments", {})

                elif isinstance(tool_call, dict) and "function" in tool_call:
                    fn_info = tool_call["function"]
                    tool_name = fn_info.get("name", "unknown tool")
                    raw_arguments = fn_info.get("arguments", {})
                else:
                    tool_name = "unknown tool"
                    raw_arguments = {}



                # If raw_arguments is a string, try to parse it as JSON
                if isinstance(raw_arguments, str):
                    try:
                        raw_arguments = json.loads(raw_arguments)
                    except json.JSONDecodeError:
                        # If it's not valid JSON, just display as is
                        pass

                # Now raw_arguments should be a dict or something we can pretty-print as JSON
                tool_args_str = json.dumps(raw_arguments, indent=2)

                tool_md = f"**Tool Call:** {tool_name}\n\n```json\n{tool_args_str}\n```"
                print(
                   tool_md
                )
                meta = await self.session.call_tool(tool_name, raw_arguments)
                print("Tool " + tool_name + " reply: " + str(meta.content[0]))


                tool_results.append({"call": str(tool_name), "result": meta.content})
                #final_text.append(f"[Calling tool {tool_name} with args {raw_arguments}]")

                messages.append(
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": tool_call_id,
                                "type": "function",
                                "function": {
                                    "name": tool_name,
                                    "arguments": json.dumps(raw_arguments)
                                    if isinstance(raw_arguments, dict)
                                    else raw_arguments,
                                },
                            }
                        ],
                    }
                )

                # Continue conversation with tool results
                if hasattr(meta.content[0], 'text') and meta.content[0].text:
                    messages.append(
                        {
                            "role": "tool",
                            "name": tool_name,
                            "content": str(meta.content[0].text),
                            "tool_call_id": tool_call_id,
                        }
                    )




                # Get next response from Claude
                response = self.client.chat.completions.create(
                    model="pgpt-mistral-nemo-12b",
                    messages=messages,
                    extra_body={
                        "groups": [],
                        "newSession": False
                    },
                    stream=False

                )
                final_text.append("LLM reply: " +response.choices[0].message.content)

            return "\n".join(final_text)

        else:
            # Kein Tool-Aufruf, also gib die LLM-Antwort direkt zurück
            return message.content or ""


    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")

        while True:
            try:
                query = input("\nQuery: ").strip()

                if query.lower() == 'quit':
                    break

                response = await self.process_query(query)
                print("\n" + response)

            except Exception as e:
                print(f"\nError: {str(e)}")


async def main():
    parser = argparse.ArgumentParser(description="MCP Client")
    parser.add_argument(
        "--server",
        help=(
            "SSE Server to listen to'"),
    )

    args = parser.parse_args()
    server_url = args.server or (
         "http://127.0.0.1:3001/sse"
    )

    client = MCPClient()
    try:
        server_url = server_url
        await client.connect_to_sse_server(server_url=server_url)
        await client.chat_loop()
    finally:
        await client.cleanup()


if __name__ == "__main__":
    import sys

    asyncio.run(main())