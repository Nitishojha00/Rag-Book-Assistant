import os
from dataclasses import dataclass
from pathlib import Path

# server-py/ (this file lives in server-py/app/)
ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Config:
    port: int
    books_dir: Path
    data_dir: Path
    client_dir: Path

    qdrant_url: str
    collection: str

    gemini_key: str
    embed_model: str
    gen_model: str
    embed_dim: int

    chunk_words: int
    overlap_words: int
    top_k: int

    max_upload_bytes: int


def _env(name: str, default):
    # Same semantics as JS `process.env.X || default` (empty string falls back too).
    return os.environ.get(name) or default


config = Config(
    port=int(_env("PORT", 8000)),
    books_dir=Path(_env("BOOKS_DIR", ROOT / "books")),
    data_dir=Path(_env("DATA_DIR", ROOT / "data")),
    client_dir=Path(_env("CLIENT_DIR", (ROOT / ".." / "client" / "dist").resolve())),

    qdrant_url=str(_env("QDRANT_URL", "http://localhost:6333")).rstrip("/"),
    collection=_env("QDRANT_COLLECTION", "book_chunks"),

    gemini_key=(os.environ.get("GEMINI_API_KEY") or "").strip(),
    embed_model=_env("GEMINI_EMBED_MODEL", "gemini-embedding-001"),
    gen_model=_env("GEMINI_MODEL", "gemini-3.8-flash"),
    embed_dim=int(_env("EMBED_DIM", 768)),

    chunk_words=int(_env("CHUNK_WORDS", 150)),
    overlap_words=int(_env("OVERLAP_WORDS", 30)),
    top_k=int(_env("TOP_K", 4)),

    max_upload_bytes=10 * 1024 * 1024,
)
