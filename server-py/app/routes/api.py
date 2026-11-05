import json

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

from ..config import config
from ..errors import http_error
from ..rag import pipeline

router = APIRouter()

JSON_BODY_LIMIT = 100 * 1024  # express.json({ limit: "100kb" })


def _detail(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message})


def _js_string(value) -> str:
    """Mimic JS String(value ?? "") for JSON values."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


async def _read_json_body(request: Request) -> dict:
    """Same behaviour as express.json(): only parses application/json, 100kb cap."""
    if not request.headers.get("content-type", "").lower().startswith("application/json"):
        return {}
    raw = await request.body()
    if len(raw) > JSON_BODY_LIMIT:
        raise http_error(413, "request entity too large")
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        raise http_error(400, "Invalid JSON in request body.")
    return data if isinstance(data, dict) else {}


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "collection": config.collection,
        "models": {
            "embed": config.embed_model,
            "generate": config.gen_model,
            "dims": config.embed_dim,
        },
        **(await pipeline.status()),
    }


@router.get("/books")
async def books():
    return {"books": await pipeline.list_books()}


@router.post("/ask")
async def ask(request: Request):
    body = await _read_json_body(request)
    question = _js_string(body.get("question")).strip()
    if len(question) < 3 or len(question) > 1000:
        return _detail(422, "Question must be 3 to 1000 characters.")
    return await pipeline.ask(question)


@router.post("/upload")
async def upload(file: UploadFile | None = File(default=None)):
    data = b""
    if file is not None:
        # multer: limits.fileSize -> LIMIT_FILE_SIZE -> 413
        data = await file.read(config.max_upload_bytes + 1)
        if len(data) > config.max_upload_bytes:
            return _detail(413, "File too large (10 MB max).")

    if file is None or not (file.filename or "").lower().endswith(".txt"):
        return _detail(400, "Only .txt files are supported.")

    return await pipeline.ingest_upload(file.filename, data.decode("utf-8", errors="replace"))
