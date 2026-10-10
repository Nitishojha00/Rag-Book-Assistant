import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT || 8000),
  booksDir: process.env.BOOKS_DIR || path.join(root, "books"),
  dataDir: process.env.DATA_DIR || path.join(root, "data"),
  clientDir: process.env.CLIENT_DIR || path.resolve(root, "../client/dist"),

  qdrantUrl: (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/$/, ""),
  collection: process.env.QDRANT_COLLECTION || "book_chunks",

  geminiKey: (process.env.GEMINI_API_KEY || "").trim(),
  embedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  genModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  embedDim: Number(process.env.EMBED_DIM || 768),

  chunkWords: Number(process.env.CHUNK_WORDS || 150),
  overlapWords: Number(process.env.OVERLAP_WORDS || 30),
  topK: Number(process.env.TOP_K || 4),

  maxUploadBytes: 10 * 1024 * 1024,
};
