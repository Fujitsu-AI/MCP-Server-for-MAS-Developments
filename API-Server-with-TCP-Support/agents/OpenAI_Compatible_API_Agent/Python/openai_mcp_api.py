import asyncio
import logging
import time
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, Request, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

# Prometheus-Client importieren
from prometheus_client import (
    Counter, Histogram, Gauge,
    generate_latest, CONTENT_TYPE_LATEST
)

# ------------------------------------------------------------------
#   1) Logging: Log-Level konfigurierbar, Minimalkonfiguration
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,  # Für Produktion ggf. WARNING oder ERROR
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
#   2) Konfiguration laden
# ------------------------------------------------------------------
try:
    from ...AgentInterface.Python.config import Config, ConfigError

    config_file = Path(__file__).parent.parent / "pgpt_openai_api_mcp.json"
    config_file = Path.absolute(config_file)
    config = Config(config_file=config_file, required_fields=["email", "password", "mcp_server"])
    logger.info(f"Configuration loaded: {config}")
except ConfigError as e:
    logger.error(f"Configuration Error: {e}")
    exit(1)

# ------------------------------------------------------------------
#   3) Globaler Agent (nur eine Instanz)
# ------------------------------------------------------------------
try:
    from ...AgentInterface.Python.agent import PrivateGPTAgent
    GLOBAL_AGENT = PrivateGPTAgent(config)
    logger.info("Global PrivateGPTAgent instance initialized.")
except Exception as e:
    logger.error(f"Error initializing global agent: {e}")
    exit(1)

# ------------------------------------------------------------------
#   4) Benötigte Klassen/Modelle
# ------------------------------------------------------------------
class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "PGPT - Mistral NeMo 12B"
    messages: List[Message]
    max_tokens: Optional[int] = 2048
    temperature: Optional[float] = 0.1
    stream: Optional[bool] = False

# (Optional) CompletionRequest, falls benötigt
from agents.OpenAI_Compatible_API_Agent.Python.open_ai_helper import (
    CompletionRequest,
    _resp_sync,
    _resp_async_generator,
    _resp_async_generator_completions,
    _resp_sync_completions,
    models
)

# ------------------------------------------------------------------
#   5) Asynchroner Aufruf des Agenten via Thread-Pool
# ------------------------------------------------------------------
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

async def async_respond(agent: PrivateGPTAgent, messages: List[Message]) -> dict:
    """
    Führt den blockierenden respond_with_context-Aufruf in einem Threadpool aus,
    um den Haupt-Eventloop nicht zu blockieren.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, agent.respond_with_context, messages)

# ------------------------------------------------------------------
#   6) FastAPI-App erstellen
# ------------------------------------------------------------------
app = FastAPI(title="OpenAI-Compatible API for PrivateGPT using MCP")

# ------------------------------------------------------------------
#   7) Prometheus-Metriken definieren
# ------------------------------------------------------------------

# Anzahl eingehender Requests pro Method + Endpoint
REQUEST_COUNT = Counter(
    "request_count",
    "Number of requests received",
    ["method", "endpoint"]
)

# Latenz der Requests (Histogram)
REQUEST_LATENCY = Histogram(
    "request_latency_seconds",
    "Request latency in seconds",
    ["method", "endpoint"]
)

# Zähler, wie oft Chat-/Completion-Aufrufe erfolgreich waren
CHAT_COMPLETION_COUNT = Counter(
    "chat_completion_count",
    "Number of successful ChatCompletion requests"
)

COMPLETION_COUNT = Counter(
    "completion_count",
    "Number of successful Completions requests"
)

# Ggf. ein Gauge für "laufende Threads" oder "Queue-Länge", falls relevant
# (Beispiel: wir nehmen hier einen Dummy-Gauge für aktive Worker)
ACTIVE_WORKER = Gauge(
    "active_worker",
    "Number of active threads in the ThreadPoolExecutor"
)

# (Optional) Counter für Token, wenn du das aus dem Agent extrahieren kannst:
TOKEN_USAGE = Counter(
    "token_usage",
    "Count of tokens used",
    ["model"]
)

# ------------------------------------------------------------------
#   8) Middleware zum Messen und Zählen der Requests
# ------------------------------------------------------------------
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Zähle Request
    REQUEST_COUNT.labels(request.method, request.url.path).inc()
    
    # Schätze aktive Worker
    #   (Im ThreadPool ist das nicht exakt; man könnte hier "max_workers - free" ermitteln.)
    ACTIVE_WORKER.set(executor._work_queue.qsize())

    try:
        response = await call_next(request)
    except Exception as exc:
        raise exc
    finally:
        resp_time = time.time() - start_time
        # Latenz messen
        REQUEST_LATENCY.labels(request.method, request.url.path).observe(resp_time)

    return response

# ------------------------------------------------------------------
#   9) Whitelist-Prüfung via Dependency
#       -> Gibt bei invalidem Key sofort HTTPException (401) zurück
# ------------------------------------------------------------------
def verify_api_key(authorization: str = Header(None)) -> str:
    if not authorization:
        # Kein Authorization-Header
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Authorization scheme must be 'Bearer'")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    # Ggf. Whitelisting
    whitelist_keys = config.get("whitelist_keys", [])
    if len(whitelist_keys) > 0 and token not in whitelist_keys:
        # Key ist nicht in der Whitelist
        logger.warning(f"Invalid API key: {token}")
        raise HTTPException(status_code=401, detail="API Key not valid")

    return token

# ------------------------------------------------------------------
#   10) Chat-Completions Endpoint
# ------------------------------------------------------------------
@app.post("/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    client_api_key: str = Depends(verify_api_key)
):
    """
    Beispielhafter Endpoint für Chat Completion.
    Nutzt GLOBAL_AGENT und führt die Logik asynchron aus.
    """
    logger.info(f"[/chat/completions] Request received with API key: {client_api_key}")

    # Kein messages-Array => Fehler/Leere Antwort
    if not request.messages:
        response = {"chatId": "0", "answer": "No input provided"}
        logger.warning("No messages provided.")
        return _resp_sync(response, request)

    # Asynchrone Agent-Antwort
    response = await async_respond(GLOBAL_AGENT, request.messages)
    if "answer" not in response:
        response["answer"] = "No Response received"

    # Metrik hochzählen
    CHAT_COMPLETION_COUNT.inc()

    # (Optional) Token-Usage-Tracking, falls du im response-Dict Token-Infos hast
    # Hier beispielhaft: response["usage"]["tokens"] (falls existiert)
    # if "usage" in response and "tokens" in response["usage"]:
    #     TOKEN_USAGE.labels(request.model or "unknown_model").inc(response["usage"]["tokens"])

    preview_len = 80
    logger.info(f"💡 Response (preview): {response['answer'][:preview_len]}...")

    # Streaming?
    if request.stream:
        return StreamingResponse(
            _resp_async_generator(response, request),
            media_type="application/x-ndjson"
        )
    else:
        return _resp_sync(response, request)

# ------------------------------------------------------------------
#   11) Text-Completions Endpoint
# ------------------------------------------------------------------
@app.post("/completions")
async def completions(
    request: CompletionRequest,
    client_api_key: str = Depends(verify_api_key)
):
    logger.info(f"[/completions] Request received with API key: {client_api_key}")

    if not request.prompt:
        response = {"chatId": "0", "answer": "No input provided"}
        logger.warning("No prompt provided.")
        return _resp_sync(response, request)

    # Asynchrone Agent-Antwort
    response = await async_respond(GLOBAL_AGENT, [Message(role="user", content=request.prompt)])
    if "answer" not in response:
        response["answer"] = "No Response received"

    # Completion-Metrik hochzählen
    COMPLETION_COUNT.inc()

    # (Optional) Token-Usage-Tracking
    # if "usage" in response and "tokens" in response["usage"]:
    #     TOKEN_USAGE.labels("some_model").inc(response["usage"]["tokens"])

    logger.info(f"💡 Response (preview): {response['answer'][:80]}...")

    if request.stream:
        return StreamingResponse(
            _resp_async_generator_completions(response, request),
            media_type="application/x-ndjson"
        )
    else:
        return _resp_sync_completions(response, request)

# ------------------------------------------------------------------
#   12) Modelle abfragen
# ------------------------------------------------------------------
@app.get("/models")
def return_models():
    return {"object": "list", "data": models}

@app.get("/models/{model_id}")
async def get_model(model_id: str):
    filtered_entries = [m for m in models if m["id"] == model_id]
    if not filtered_entries:
        raise HTTPException(status_code=404, detail="Model not found")
    return filtered_entries[0]

# ------------------------------------------------------------------
#   13) /metrics Endpoint für Prometheus
# ------------------------------------------------------------------
@app.get("/metrics")
def metrics():
    """
    Endpoint, der die Prometheus-Metriken zurückgibt.
    Von Prometheus unter http://<host>:<port>/metrics abgefragt.
    """
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

# ------------------------------------------------------------------
#   14) App-Start via uvicorn.run()
# ------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    api_ip = config.get("api_ip", "0.0.0.0")
    api_port = config.get("api_port", 8002)
    logger.info(f"Starting API on http://{api_ip}:{api_port}")
    # workers=4, wenn man mehrere Prozesse möchte (Skalierung)
    uvicorn.run(app, host=api_ip, port=int(api_port))
