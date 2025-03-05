import logging
import os
import uuid
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv
from openai import OpenAI


# Load environment variables
load_dotenv()


class LLMClient:
    def __init__(self, provider="pgpt", model="pgpt-mistral-nemo-12b", api_key=None):
        # set the provider, model and api key
        self.provider = provider
        self.model = model



    def create_completion(
        self, messages: List[Dict], tools: List = None
    ) -> Dict[str, Any]:
        """Create a chat completion using the specified LLM provider."""
        if self.provider == "pgpt":
            return self._pgpt_completion(messages, tools)

        else:
            # unsupported providers
            raise ValueError(f"Unsupported provider: {self.provider}")



    def _pgpt_completion(self, messages: List[Dict], tools: List) -> Dict[str, Any]:
        vllm = os.getenv("USE_VLLM", "False")

        try:
            if vllm == "True":
                base_url = os.getenv("PGPT_OAI_BASE_URL_VLLM")
                if not base_url:
                    raise ValueError("The PGPT_OAI_BASE_URL_VLLM environment variable is not set.")
                api_key = os.getenv("PGPT_API_KEY_VLLM")
                if not api_key:
                    raise ValueError("The PGPT_API_KEY_VLLM environment variable is not set.")


                http_client = httpx.Client(verify=False, http2=True)

                client = OpenAI(
                    base_url=base_url,
                    api_key=api_key,
                    http_client=http_client
                )

                logging.info(f"Amount of messages: {len(messages)}")

                response = client.chat.completions.create(
                    model="/models/mistral-nemo-12b",
                    temperature=0.8,
                    top_p=0.8,
                    messages=messages,
                    tools = tools or None,
                    stream = False
                )
            else:
                newSession = False
                if len(messages) % 2:  # system prompt and user prompt
                    newSession = True

                base_url = os.getenv("PGPT_OAI_BASE_URL")
                if not base_url:
                    raise ValueError("The PGPT_OAI_BASE_URL environment variable is not set.")
                api_key = os.getenv("PGPT_API_KEY")
                if not api_key:
                    raise ValueError("The PGPT_API_KEY environment variable is not set.")

                client = OpenAI(
                    api_key=api_key,
                    base_url=base_url  # change the default port if needed
                )
                response = client.chat.completions.create(
                    model="pgpt-mistral-nemo-12b",
                    messages=messages,
                    tools=tools or None,
                    extra_body={
                        "groups": [],
                        "newSession": newSession
                    },
                    stream = False)


            logging.info(f"PGPT raw response: {response}")

            # Extract the message and tool calls
            try:
                message = response.choices[0].message
            except:
                message = response
            tool_calls = []

            # Convert Ollama tool calls to OpenAI format
            if hasattr(message, "tool_calls") and message.tool_calls:
                for tool in message.tool_calls:
                    tool_calls.append(
                        {
                            "id": str(uuid.uuid4()),  # Generate unique ID
                            "type": "function",
                            "function": {
                                "name": tool.function.name,
                                "arguments": tool.function.arguments,
                            },
                        }
                    )

            return {
                "response": message.content if message else "No response",
                "tool_calls": tool_calls,
            }

        except Exception as e:
            # error
            logging.error(f"PGPT API Error: {str(e)}")
            raise ValueError(f"PGPT API Error: {str(e)}")
