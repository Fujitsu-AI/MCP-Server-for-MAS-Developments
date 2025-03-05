import json
from pathlib import Path

from starlette.responses import StreamingResponse

from fastapi import FastAPI, Request, HTTPException
from threading import local

from agents.OpenAI_Compatible_API_Agent.Python.open_ai_helper import ChatInstance, \
    ChatCompletionRequest, CompletionRequest, _resp_sync, _resp_async_generator, models, Message, _resp_async_generator_completions, _resp_sync_completions
from .pgpt_api import PrivateGPTAPI

from ...AgentInterface.Python.config import Config, ConfigError
import uvicorn

app = FastAPI(title="OpenAI-compatible API for PrivateGPT")
request_context = local()
instances = []

# Konfiguration laden
try:
    config_file = Path.absolute(Path(__file__).parent.parent / "pgpt_openai_api_proxy.json")
    config = Config(config_file=config_file, required_fields=["base_url"])
    default_groups = config.get("groups", [])
except ConfigError as e:
    print(f"Configuration Error: {e}")
    exit(1)



@app.middleware("http")
async def store_request_headers(request: Request, call_next):
    request_context.headers = dict(request.headers)
    response = await call_next(request)
    return response


@app.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    headers = getattr(request_context, "headers", {})
    client_api_key = str(headers['authorization']).split(" ")[1]
    groups = default_groups
    force_new_session = False

    if request.groups:
        groups = request.groups
    if request.newSession:
        force_new_session = True

    print("Groups: " + str(groups))

    if  request.messages:
        #Check if this api-key already has a running instance
        indices = [i for i, x in enumerate(instances) if
                   x.api_key == client_api_key]
        index = -1
        if len(indices) > 0:
            index = indices[0]
        if index > -1:
            # if we already have an instance, just reuse it. No need to open new connection
            if instances[index].agent.chosen_groups != groups:
                print("⚠️ New Groups requested, switching to new Chat..")
                config.set_value("groups", groups)
                instances[index].agent.chat_id = None
            elif force_new_session:
                print("⚠️ New Session Requested, switching to new Chat..")
                config.set_value("groups", groups)
                instances[index].agent.chat_id = None

            pgpt = instances[index].agent

        else:
            #otherwise connect via api-key
            config.set_value("groups", groups)
            pgpt = PrivateGPTAPI(config, client_api_key=client_api_key)
            # remember that we already have an instance for the api key
            instance = ChatInstance(client_api_key, pgpt)
            instances.append(instance)

        if pgpt.logged_in:
            response = pgpt.respond_with_context(request.messages, request.response_format, request.tools)
            if response is not None:
                if "answer" not in response:
                    response["answer"] = "No Response received"
            if response is None or ("answer" in response and response["answer"] == "error"):
                   pgpt.login()
        else:
            response = {
                "chatId": "0",
                "answer": "API Key not valid",
            }
    else:
        response = {
            "chatId": "0",
            "answer": "No Input given",
        }

    if request.stream:
        return StreamingResponse(
            _resp_async_generator(response, request), media_type="application/x-ndjson"
        )
    else:
        return _resp_sync(response, request)


# legacy completions API
@app.post("/completions")
async def completions(request: CompletionRequest):
    headers = getattr(request_context, "headers", {})
    client_api_key = str(headers['authorization']).split(" ")[1]
    groups = default_groups
    if request.groups:
        groups = request.groups
    print("Groups: " + str(groups))
    if request.prompt:

        #otherwise connect via api-key
        config.set_value("groups", groups)
        pgpt = PrivateGPTAPI(config, client_api_key=client_api_key)
        # remember that we already have an instance for the api key

        if pgpt.logged_in:
            response = pgpt.respond_with_context([Message(role="user", content=request.prompt)], request.response_format, request.tools)

            if "answer" not in response:
                response["answer"] = "No Response received"
            if "answer" in response and response["answer"] == "error":
                if pgpt.login():
                    pgpt.create_chat()
        else:
            response = {
                "chatId": "0",
                "answer": "API Key not valid",
            }
    else:
        response = {
            "chatId": "0",
            "answer": "No Input given",
        }

    if request.stream :
        return StreamingResponse(
            _resp_async_generator_completions(response, request), media_type="application/x-ndjson"
        )
    else:
        return _resp_sync_completions(response, request)



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
    api_ip = config.get("api_ip", "0.0.0.0")
    api_port = config.get("api_port", 8002)
    uvicorn.run(app, host=api_ip, port=int(api_port))



