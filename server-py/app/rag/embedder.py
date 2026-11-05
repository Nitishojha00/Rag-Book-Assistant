"""
STEP 2 (ingest) and STEP 1 (query): turn text into dense vectors with Gemini embeddings.
Documents and queries use different task types so retrieval quality is better.
"""
import asyncio
import json

import httpx

from ..config import config
from ..errors import http_error

BASE = "https://generativelanguage.googleapis.com/v1beta"
BATCH_SIZE = 50


async def _gemini_post(endpoint: str, body: dict) -> dict:
    async with asyncio.timeout(60):
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{BASE}/{endpoint}",
                headers={"Content-Type": "application/json", "x-goog-api-key": config.gemini_key},
                content=json.dumps(body),
            )
    raw = res.text
    if not res.is_success:
        raise http_error(502, f"Gemini embedding error {res.status_code}: {raw[:400]}")
    return json.loads(raw)


async def embed_documents(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        data = await _gemini_post(
            f"models/{config.embed_model}:batchEmbedContents",
            {
                "requests": [
                    {
                        "model": f"models/{config.embed_model}",
                        "content": {"parts": [{"text": text}]},
                        "taskType": "RETRIEVAL_DOCUMENT",
                        "outputDimensionality": config.embed_dim,
                    }
                    for text in batch
                ]
            },
        )
        vectors.extend(e["values"] for e in data["embeddings"])
    return vectors


async def embed_query(text: str) -> list[float]:
    data = await _gemini_post(
        f"models/{config.embed_model}:embedContent",
        {
            "model": f"models/{config.embed_model}",
            "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_QUERY",
            "outputDimensionality": config.embed_dim,
        },
    )
    return data["embedding"]["values"]
