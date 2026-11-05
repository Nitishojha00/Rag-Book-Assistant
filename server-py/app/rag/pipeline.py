"""
The RAG pipeline, with every step recorded in a trace the UI can display.

INGEST:  load -> chunk -> embed -> store in vector DB
QUERY:   embed question -> vector search -> augment prompt -> generate answer
"""
import hashlib
import json
import logging
import re
import time
from pathlib import PurePosixPath

from ..config import config
from ..errors import http_error
from . import vector_store as store
from .chunker import chunk_text
from .embedder import embed_documents, embed_query
from .llm import generate_answer

logger = logging.getLogger("rag")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _now_ms() -> float:
    return time.time() * 1000


def _manifest_path():
    return config.data_dir / "manifest.json"


def _safe_filename(name: str) -> str:
    stem = PurePosixPath(name).stem
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", stem)
    stem = re.sub(r"^_+|_+$", "", stem)
    return f"{stem or 'book'}.txt"


def _load_manifest() -> dict:
    try:
        return json.loads(_manifest_path().read_bytes().decode("utf-8", errors="replace"))
    except Exception:
        return {}


def _save_manifest_entry(name: str, file_hash: str) -> None:
    manifest = _load_manifest()
    manifest[name] = file_hash
    config.data_dir.mkdir(parents=True, exist_ok=True)
    _manifest_path().write_bytes(json.dumps(manifest, indent=2).encode("utf-8"))


def _list_book_files() -> list[str]:
    return sorted(p.name for p in config.books_dir.iterdir() if p.name.lower().endswith(".txt"))


def _read_text(path) -> str:
    # Read bytes + decode so line endings are untouched (like Node's readFileSync).
    return path.read_bytes().decode("utf-8", errors="replace")


async def _ingest_book(name: str, text: str) -> dict:
    """INGEST steps for one book. Returns a trace of what happened."""
    trace = []

    # Step 1: chunk
    chunks = chunk_text(text, name, config.chunk_words, config.overlap_words)
    trace.append(
        {
            "step": "chunk",
            "book": name,
            "chunks": len(chunks),
            "chunkWords": config.chunk_words,
            "overlapWords": config.overlap_words,
        }
    )

    # Step 2: embed every chunk into a vector
    t = _now_ms()
    vectors = await embed_documents([c["text"] for c in chunks])
    trace.append(
        {
            "step": "embed_documents",
            "model": config.embed_model,
            "count": len(vectors),
            "dims": config.embed_dim,
            "ms": int(_now_ms() - t),
        }
    )

    # Step 3: replace any old vectors for this book and store the new ones
    t = _now_ms()
    await store.delete_book(name)
    await store.upsert_chunks(chunks, vectors)
    trace.append(
        {
            "step": "store_vectors",
            "collection": config.collection,
            "book": name,
            "count": len(chunks),
            "ms": int(_now_ms() - t),
        }
    )

    return {"book": name, "chunks": len(chunks), "trace": trace}


async def startup() -> None:
    """Called on server start: index new or changed books, skip the rest."""
    config.books_dir.mkdir(parents=True, exist_ok=True)
    await store.ensure_collection()

    if not config.gemini_key:
        logger.warning(
            "GEMINI_API_KEY is not set: books will not be indexed and /api/ask is disabled."
        )
        return

    manifest = _load_manifest()
    indexed = {s["title"] for s in await store.list_sources()}

    for name in _list_book_files():
        text = _read_text(config.books_dir / name)
        file_hash = _sha256(text)
        if manifest.get(name) == file_hash and PurePosixPath(name).stem in indexed:
            logger.info("Up to date: %s", name)
            continue
        result = await _ingest_book(name, text)
        _save_manifest_entry(name, file_hash)
        logger.info("Indexed %s: %s chunks", name, result["chunks"])


async def ingest_upload(original_name: str, text: str) -> dict:
    """Called when a user uploads a book from the UI."""
    if not config.gemini_key:
        raise http_error(503, "GEMINI_API_KEY is not set on the server.")

    name = _safe_filename(original_name)
    (config.books_dir / name).write_bytes(text.encode("utf-8"))
    result = await _ingest_book(name, text)
    _save_manifest_entry(name, _sha256(text))
    return {"saved_as": name, **result}


def _build_prompt(question: str, hits: list[dict]) -> str:
    excerpts = "\n\n".join(
        '[{n}] (from "{source}", chunk {idx})\n{text}'.format(
            n=i + 1, source=h["source"], idx=h["chunkIndex"], text=h["text"]
        )
        for i, h in enumerate(hits)
    )
    return (
        f"Excerpts:\n\n{excerpts}\n\nQuestion: {question}\n\n"
        "Answer using only the excerpts above and cite them like [1]."
    )


async def ask(question: str) -> dict:
    """QUERY steps. Returns the answer, the sources used, and the full trace."""
    if not config.gemini_key:
        raise http_error(503, "GEMINI_API_KEY is not set on the server.")

    trace = []

    # Step 1: embed the question with the same model used for documents
    t = _now_ms()
    query_vector = await embed_query(question)
    trace.append(
        {
            "step": "embed_query",
            "model": config.embed_model,
            "dims": len(query_vector),
            "ms": int(_now_ms() - t),
        }
    )

    # Step 2: vector search for the closest chunks
    t = _now_ms()
    hits = await store.search(query_vector, config.top_k)
    trace.append(
        {
            "step": "vector_search",
            "collection": config.collection,
            "top_k": config.top_k,
            "hits": [
                {
                    "source": h["source"],
                    "chunkIndex": h["chunkIndex"],
                    "score": round(h["score"], 3),
                }
                for h in hits
            ],
            "ms": int(_now_ms() - t),
        }
    )

    if not hits:
        return {
            "answer": "Nothing relevant was found in the indexed books.",
            "sources": [],
            "trace": trace,
            "llmUsed": False,
        }

    # Step 3: augment the prompt with the retrieved context
    prompt = _build_prompt(question, hits)
    trace.append({"step": "augment", "excerpts": len(hits), "prompt_chars": len(prompt)})

    # Step 4: generate the grounded answer
    t = _now_ms()
    generated = await generate_answer(prompt)
    trace.append(
        {
            "step": "generate",
            "model": config.gen_model,
            "finishReason": generated["finishReason"],
            "ms": int(_now_ms() - t),
        }
    )

    return {"answer": generated["text"], "sources": hits, "trace": trace, "llmUsed": True}


async def status() -> dict:
    return {
        "vectorDb": await store.ping(),
        "geminiConfigured": bool(config.gemini_key),
    }


async def list_books() -> list[dict]:
    return await store.list_sources()
