import asyncio
import json
import re
import time

import tiktoken
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

from agents.AgentInterface.Python.agent import PrivateGPTAgent
from agents.OpenAI_Compatible_API_Agent.Python.pgpt_api import PrivateGPTAPI


class ChatInstance:
    def __init__(self, api_key: str, agent: PrivateGPTAgent | PrivateGPTAPI):
        self.api_key = api_key
        self.agent = agent


# data models
class Message(BaseModel):
    role: str
    content: str | None
    tool_calls: Optional[object] = None
    name: Optional[str] = None
    tool_call_id: Optional[str] = None


class Function(BaseModel):
    arguments: str | dict
    name: str
    parsed_arguments: Optional[object] = None

class ChatCompletionMessageToolCall(BaseModel):
    id: str
    type: str = "function"
    function: Function

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "PGPT - Mistral NeMo 12B"
    messages: List[Message]
    max_tokens: Optional[int] = 64000
    temperature: Optional[float] = 0
    top_p: Optional[float] = 0
    stream: Optional[bool] = False
    response_format: Optional[object] = None
    tools: Optional[object] = None
    groups: Optional[object] = None
    newSession: Optional[bool] = False




class CompletionRequest(BaseModel):
    model: Optional[str] = "PGPT - Mistral NeMo 12B"
    max_tokens: Optional[int] = 64000
    temperature: Optional[float] = 0
    top_p: Optional[float] = 0
    stream: Optional[bool] = False
    response_format: Optional[object] = None
    tools: Optional[object] = None
    groups: Optional[object] = None
    prompt: str = ""
    messages: Optional[List[Message]] = None




def num_tokens(user_input, answer):
    """
    Calculate the number of tokens used by the user input and the assistant's answer.

    Args:
        user_input (str): The user's input.
        answer (str): The assistant's response.

    Returns:
        tuple: A tuple containing the number of tokens used by the user input,
               the assistant's answer, and the total number of tokens.
    """
    num_tokens_request = num_tokens_from_string(user_input, "o200k_base")
    num_tokens_reply = num_tokens_from_string(answer, "o200k_base")
    num_tokens_overall = num_tokens_request + num_tokens_reply

    return num_tokens_request, num_tokens_reply, num_tokens_overall


def num_tokens_from_string(string: str, encoding_name: str) -> int:
    """Returns the number of tokens in a text string."""
    return len(tiktoken.get_encoding(encoding_name).encode(string))


def _resp_sync(response: json, request):
    user_input = ""
    reply = {}
    for message in request.messages:
        user_input += json.dumps({'role': message.role, 'content': message.content})
    num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input, response["answer"])
    id = response.get("chatId", "0")
    citations = []
    if "sources" in response:
        citations = response["sources"]

    tool_calls= None
    if "tool_call" in response:
        try:
            print(response["tool_call"])
            tool= json.loads(response["tool_call"])
            if "arguments" in tool:
                arguments = tool["arguments"] #  '{"operation":"multiply","a":"123","b":"4324"}'
                parsed_arguments = json.loads(json.dumps(arguments).strip("\""))
                print("found arguments")
                print(parsed_arguments)
            elif "params" in tool:
                parsed_arguments =  json.loads(json.dumps(tool["params"]).strip("\""))
                print("found params")
                print(parsed_arguments)
            else:
                try:
                    parsed_arguments = tool["params"]
                except:
                    try:
                        parsed_arguments = json.loads(tool)
                    except:
                        parsed_arguments = tool
            name = "tool"
            if "name" in tool:
                name = tool["name"] #'calculator'
            if "method" in tool:
                name = tool["method"] #'calculator'

            function = Function(arguments=json.dumps(parsed_arguments), name=name, parsed_arguments=parsed_arguments)
            tool_call = ChatCompletionMessageToolCall(id=id, function=function, type="function")
            print("Tool Call: " + str(tool_call))
            if tool_calls is None:
                tool_calls = []
            tool_calls.append(tool_call)

        except Exception as e:
            print("Tool Call error: " + str(e))



           
    return {
        "id": id,
        "object": "chat.completion",
        "created": time.time(),
        "model": request.model,
        "choices": [{"message": Message(role="assistant", content=clean_response(str(response["answer"])), tool_calls=tool_calls)}],
        "citations": citations,
        "usage": {
            "prompt_tokens": num_tokens_request,
            "completion_tokens": num_tokens_reply,
            "total_tokens": num_tokens_overall
        }
    }


def clean_response(response):
    # Remove artefacts from reply here
    response = response.replace("[TOOL_CALLS] ", "")
    if "```json" in response:
        response = response.replace("'''json", "").replace("'''", "")
    return response

async def _resp_async_generator(response: json, request):
    user_input = ""
    for message in request.messages:
            user_input += json.dumps({'role': message.role, 'content': message.content})


    num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input, response["answer"])

    tokens = response["answer"].split(" ")
    citations = []
    if "sources" in response:
        citations = response["sources"]

    for i, token in enumerate(tokens):
        chunk = {
            "id": i,
            "object": "chat.completion.chunk",
            "created": time.time(),
            "model": request.model,
            "choices": [{"delta": {"content": token + " "}}],
            "citations": citations,
            "usage": {
                "prompt_tokens": num_tokens_request,
                "completion_tokens": num_tokens_reply,
                "total_tokens": num_tokens_overall
            }
        }
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(0.05)
    yield "data: [DONE]\n\n"



# Legacy Completions API
def _resp_sync_completions(response: json, request):
    user_input = request.prompt
    reply = [{"text": response["answer"],
            "index": 0,
            "logprobs": None,
            "finish_reason": "length"}]

    num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input, response["answer"])

    citations = []
    if "sources" in response:
        citations = response["sources"]



    return {
        "id": response["chatId"],
        "object": "text_completion",
        "created": time.time(),
        "model": request.model,
        "choices": reply,
        "citations": citations,
        "usage": {
            "prompt_tokens": num_tokens_request,
            "completion_tokens": num_tokens_reply,
            "total_tokens": num_tokens_overall
        }
    }

async def _resp_async_generator_completions(response: json, request):

    user_input = request.prompt
    num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input, response["answer"])

    tokens = response["answer"].split(" ")
    citations = []
    if "sources" in response:
        citations = response["sources"]


    for i, token in enumerate(tokens):
        chunk = {
            "id": i,
            "object": "text_completion",
            "created": time.time(),
            "model": request.model,
            "choices": [
                {
                  "text": token + " ",
                  "index": 0,
                  "logprobs": None,
                  "finish_reason": None
                }
            ],

            "citations": citations,
            "usage": {
                "prompt_tokens": num_tokens_request,
                "completion_tokens": num_tokens_reply,
                "total_tokens": num_tokens_overall
            }
        }
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(0.05)
    yield "data: [DONE]\n\n"


models = [
    {
        "id": "/models/mistral-nemo-12b",
        "object": "model",
        "owned_by": "fujitsu",
        "created": 1609459200,
        "root": "mistral",
        "parent": None,
        "ready": True,
        "permissions": [
            {
                "id": "model-permission-1",
                "object": "model_permission",
                "created": 1612876732,
                "allow_create_engine": True,
                "allow_fine_tuning": False,
                "allow_sampling": True,
                "allow_search_indices": True,
                "allow_view": True,
                "organization": "*"
            }
        ]
    }
]
