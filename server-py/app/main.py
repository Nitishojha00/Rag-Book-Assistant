import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from .config import config
from .errors import HttpError
from .rag.pipeline import startup
from .routes.api import router as api_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("rag")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Same as index.js: a failed startup (e.g. Qdrant down) is logged, not fatal.
    try:
        await startup()
    except Exception as err:
        logger.error("Startup problem (is Qdrant running?): %s", err)
    logger.info("Book RAG running on http://localhost:%s", config.port)
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(api_router, prefix="/api")


# Central error handlers -> {"detail": message}
@app.exception_handler(HttpError)
async def http_error_handler(request: Request, err: HttpError):
    if err.status >= 500:
        logger.error("%s", err.message)
    return JSONResponse(status_code=err.status, content={"detail": err.message})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, err: Exception):
    logger.error("Unhandled error", exc_info=err)
    return JSONResponse(
        status_code=500, content={"detail": str(err) or type(err).__name__}
    )


# Serve the built React app in production.
if config.client_dir.exists():
    _client_root = config.client_dir.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        candidate = (_client_root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(_client_root):
            return FileResponse(candidate)
        return FileResponse(_client_root / "index.html")
