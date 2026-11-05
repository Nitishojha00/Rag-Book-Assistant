"""
Vector database layer (Qdrant over its REST API).
Stores one point per chunk: a vector plus payload {source, chunkIndex, text}.
"""
import asyncio
import json
import uuid

import httpx

from ..config import config
from ..errors import http_error

COLLECTION = f"/collections/{config.collection}"


async def _qdrant(method: str, path: str, body: dict | None = None):
    async with asyncio.timeout(30):
        async with httpx.AsyncClient() as client:
            res = await client.request(
                method,
                f"{config.qdrant_url}{path}",
                headers={"Content-Type": "application/json"},
                content=json.dumps(body) if body is not None else None,
            )
    if res.status_code == 404 and method == "GET":
        return None
    raw = res.text
    if not res.is_success:
        raise http_error(502, f"Qdrant {res.status_code} on {method} {path}: {raw[:300]}")
    return json.loads(raw) if raw else {}


async def ping() -> bool:
    try:
        await _qdrant("GET", "/collections")
        return True
    except Exception:
        return False


async def ensure_collection() -> None:
    existing = await _qdrant("GET", COLLECTION)
    if existing:
        return
    await _qdrant(
        "PUT",
        COLLECTION,
        {"vectors": {"size": config.embed_dim, "distance": "Cosine"}},
    )


async def delete_book(source: str) -> None:
    """Remove all vectors belonging to one book so re-ingestion never leaves duplicates."""
    await _qdrant(
        "POST",
        f"{COLLECTION}/points/delete?wait=true",
        {"filter": {"must": [{"key": "source", "match": {"value": source}}]}},
    )


async def upsert_chunks(chunks: list[dict], vectors: list[list[float]]) -> None:
    points = [
        {
            "id": str(uuid.uuid4()),
            "vector": vectors[i],
            "payload": {"source": c["source"], "chunkIndex": c["chunkIndex"], "text": c["text"]},
        }
        for i, c in enumerate(chunks)
    ]
    for i in range(0, len(points), 256):
        await _qdrant("PUT", f"{COLLECTION}/points?wait=true", {"points": points[i : i + 256]})


async def search(vector: list[float], limit: int) -> list[dict]:
    """STEP 3 (query): nearest-neighbour search by cosine similarity."""
    data = await _qdrant(
        "POST",
        f"{COLLECTION}/points/search",
        {"vector": vector, "limit": limit, "with_payload": True},
    )
    return [{"score": r["score"], **r["payload"]} for r in data["result"]]


async def list_sources() -> list[dict]:
    counts: dict[str, int] = {}
    offset = None
    while True:
        data = await _qdrant(
            "POST",
            f"{COLLECTION}/points/scroll",
            {"limit": 512, "with_payload": ["source"], "with_vector": False, "offset": offset},
        )
        for p in data["result"]["points"]:
            src = p["payload"]["source"]
            counts[src] = counts.get(src, 0) + 1
        offset = data["result"].get("next_page_offset")
        if not offset:
            break

    # JS used localeCompare (case-insensitive-ish); casefold is the closest simple equivalent.
    return [
        {"title": title, "chunks": n}
        for title, n in sorted(counts.items(), key=lambda kv: (kv[0].casefold(), kv[0]))
    ]
