"""
STEP 1 (ingest): split a book into overlapping word windows.
Overlap keeps sentences that straddle a boundary retrievable from either side.
"""
import re

# JavaScript's \s class, spelled out. Python's str.split() / \s differ slightly
# (e.g. they split on \x1c-\x1f and \x85, but not on the BOM \ufeff), and we want
# chunk boundaries identical to the Node version.
_JS_WHITESPACE = re.compile(
    "[\t\n\u000b\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+"
)


def chunk_text(text: str, source: str, chunk_words: int, overlap_words: int) -> list[dict]:
    step = chunk_words - overlap_words
    if step <= 0:
        raise ValueError("overlapWords must be smaller than chunkWords")

    words = [w for w in _JS_WHITESPACE.split(text) if w]
    chunks: list[dict] = []

    for start in range(0, len(words), step):
        chunks.append(
            {
                "source": source,
                "chunkIndex": len(chunks),
                "text": " ".join(words[start : start + chunk_words]),
            }
        )
        if start + chunk_words >= len(words):
            break
    return chunks
