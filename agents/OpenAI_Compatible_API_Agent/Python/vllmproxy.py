import argparse
import asyncio
import json
import time
import httpx
from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam, ChatCompletionAssistantMessageParam, \
    ChatCompletionSystemMessageParam, ChatCompletionToolParam
from starlette.responses import StreamingResponse

from fastapi import FastAPI, Request, HTTPException
from threading import local

from agents.OpenAI_Compatible_API_Agent.Python.open_ai_helper import ChatCompletionRequest, models, Message, num_tokens
import uvicorn


app = FastAPI(title="OpenAI-compatible API for PrivateGPT")
request_context = local()


@app.middleware("http")
async def store_request_headers(request: Request, call_next):
    request_context.headers = dict(request.headers)
    response = await call_next(request)
    return response

@app.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    parser = argparse.ArgumentParser(description="Provide an API key to connect to OpenAI-compatible API.")
    parser.add_argument("--api_key", required=True, help="API key for login")
    parser.add_argument("--base_url", required=True, help="The base url of the VLLM server")
    args = parser.parse_args()


    client = OpenAI(
        base_url=args.base_url,
        api_key=args.api_key,
        http_client=httpx.Client(verify=False)
    )


    msgs = []
    for message in request.messages:
        if message.role == "system":
            msgs.append(ChatCompletionSystemMessageParam(role="system", content=message.content))
        elif message.role == "user":
            msgs.append(ChatCompletionUserMessageParam(role="user", content=message.content))
        elif message.role == "assistant":
            msgs.append(ChatCompletionAssistantMessageParam(role="assistant", content=message.content))



    tools = []
    #tools_json = json.loads(json.dumps(request.tools))
    #for tool in tools_json:
    #    tools.append(json.loads(str(tool)))

    #if len(tools) == 0:
    #    tools = None

    response = client.chat.completions.create(
        model="/models/mistral-nemo-12b",
        temperature=request.temperature,
        top_p=request.top_p,
        stream=True,
        tools=tools or None,
        messages=msgs
    )

    if request.stream:

        return StreamingResponse(
            _resp_async_generator_vllm(response, request), media_type="application/x-ndjson"
        )

    else:
        return {
            "id": response.id,
            "object": "chat.completion",
            "created": time.time(),
            "model": request.model,
            "choices": [{"message": Message(role="assistant", content="Response", tool_calls=[])}],
            "citations": [],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 10,
                "total_tokens": 20
            }
        }


async def _resp_async_generator_vllm(response, request):
    partial_message = ""
    user_input = ""
    for message in request.messages:
        user_input += json.dumps({'role': message.role, 'content': message.content})

    i = 0
    for chunk in response:
        num_tokens_request, num_tokens_reply, num_tokens_overall = num_tokens(user_input, chunk.choices[0].delta.content)
        chunk = {
            "id": i,
            "object": "chat.completion.chunk",
            "created": time.time(),
            "model": request.model,
            "choices": [{"delta": {"content": chunk.choices[0].delta.content}}],
            "usage": {
                "prompt_tokens": num_tokens_request,
                "completion_tokens": num_tokens_reply,
                "total_tokens": num_tokens_overall
            }
        }
        i = i+1
        yield f"data: {json.dumps(chunk)}\n\n"
        await asyncio.sleep(0.05)
    yield "data: [DONE]\n\n"


@app.get("/models")
def return_models():
    return {
        "object": "list",
        "data": models
    }


@app.get('/models/{model_id}')
async def get_model(model_id: str):
    filtered_entries = list(filter(lambda item: item["id"] == model_id, models))
    entry = filtered_entries[0] if filtered_entries else None
    print(entry)
    if entry is None:
            raise HTTPException(status_code=404, detail="Model not found")
    return entry


if __name__ == "__main__":
    api_ip = "0.0.0.0"
    api_port = 8002
    uvicorn.run(app, host=api_ip, port=int(api_port))



