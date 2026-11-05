"""STEP 4 (query): generate a grounded answer from the augmented prompt."""
import asyncio
import json
import logging

import httpx

from ..config import config
from ..errors import http_error

logger = logging.getLogger("rag")

SYSTEM_PROMPT = (
    "You answer questions using only the book excerpts provided. "
    "Cite excerpts with bracketed numbers like [1]. "
    "If the excerpts do not contain the answer, say so plainly instead of guessing."
)

MAX_RETRIES = 3
RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504]


async def generate_answer(prompt: str) -> dict:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.gen_model}:generateContent"
    )
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": config.gemini_key,
    }
    body = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 800, "temperature": 0.2},
        }
    )

    res = None
    raw = ""

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with asyncio.timeout(60):
                async with httpx.AsyncClient() as client:
                    res = await client.post(url, headers=headers, content=body)
                    raw = res.text

            # Success, or an error that should not be retried.
            if (
                res.is_success
                or res.status_code not in RETRYABLE_STATUSES
                or attempt == MAX_RETRIES
            ):
                break

            # Exponential backoff: 1s, 2s, 4s.
            delay = 1000 * 2**attempt
            logger.warning(
                "Gemini returned %s. Retry %s/%s in %sms.",
                res.status_code, attempt + 1, MAX_RETRIES, delay,
            )
            await asyncio.sleep(delay / 1000)
        except Exception as error:  # Retry network failures and request timeouts.
            if attempt == MAX_RETRIES:
                raise http_error(
                    502,
                    f"Gemini request failed after {MAX_RETRIES + 1} attempts: "
                    f"{str(error) or type(error).__name__}",
                )

            delay = 1000 * 2**attempt
            logger.warning(
                "Gemini request failed. Retry %s/%s in %sms.", attempt + 1, MAX_RETRIES, delay
            )
            await asyncio.sleep(delay / 1000)

    if not res.is_success:
        raise http_error(502, f"Gemini generate error {res.status_code}: {raw[:400]}")

    try:
        data = json.loads(raw)
    except ValueError:
        raise http_error(502, "Gemini returned invalid JSON.")

    candidates = data.get("candidates") or []
    candidate = candidates[0] if candidates else None

    parts = ((candidate or {}).get("content") or {}).get("parts") or []
    text = "".join((part.get("text") or "") for part in parts).strip()

    return {
        "text": text or "The model returned no text.",
        "finishReason": (candidate or {}).get("finishReason") or "NONE",
    }
