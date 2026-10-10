# Book RAG

A full-stack Retrieval-Augmented Generation app. Books are chunked, embedded with Gemini, stored in Qdrant, and answers are generated from the retrieved passages. The UI displays every pipeline step.

## Architecture

```
INGEST (on startup or upload)
  .txt book -> [1 Chunk] -> [2 Embed (Gemini)] -> [3 Store vectors (Qdrant)]

QUERY (on each question)
  question -> [1 Embed (Gemini)] -> [2 Vector search (Qdrant, cosine)]
           -> [3 Augment prompt] -> [4 Generate answer (Gemini)] -> answer + sources
```

| Layer     | Technology                                             |
|-----------|--------------------------------------------------------|
| Frontend  | React 18, Vite                                         |
| Backend   | Node.js 20, Express 4, multer                          |
| Vector DB | Qdrant (REST API)                                      |
| Embeddings| Gemini `gemini-embedding-001` (768 dimensions)         |
| LLM       | Gemini (`GEMINI_MODEL`)                                |
| Deploy    | Docker multi-stage build, docker-compose               |

## Project layout

```
rag-app/
├── docker-compose.yml        # Qdrant + app
├── Dockerfile                # builds React, then runs Express
├── server/
│   ├── src/
│   │   ├── index.js          # Express app, static hosting, error handling
│   │   ├── config.js         # all settings from env vars
│   │   ├── errors.js
│   │   ├── routes/api.js     # HTTP endpoints
│   │   └── rag/
│   │       ├── chunker.js    # step: chunk text
│   │       ├── embedder.js   # step: Gemini embeddings
│   │       ├── vectorStore.js# step: Qdrant store and search
│   │       ├── llm.js        # step: Gemini generation
│   │       └── pipeline.js   # orchestrates ingest and query with traces
│   ├── test/chunker.test.js
│   └── books/                # .txt books to index
└── client/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js
    │   ├── components/       # AskPanel, PipelineView, BooksPanel
    │   └── styles.css
    └── vite.config.js
```

## Run with Docker (recommended)

Requires Docker Desktop and a Gemini API key from https://aistudio.google.com/apikey.

```powershell
cd rag-app
$env:GEMINI_API_KEY="your-key"
docker compose up --build
```

Open http://localhost:8000.

## Run locally for development

1. Start Qdrant:
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
2. Start the server (terminal 1):
   ```powershell
   cd server
   npm install
   $env:GEMINI_API_KEY="your-key"
   npm run dev
   ```
3. Start the client with hot reload (terminal 2):
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Open http://localhost:5173. Vite proxies `/api` to port 8000.

Run the tests with `cd server && npm test`.

## Configuration

| Variable              | Default                    | Purpose                                      |
|-----------------------|----------------------------|----------------------------------------------|
| `GEMINI_API_KEY`      | (required)                 | Embeddings and generation                    |
| `GEMINI_MODEL`        | `gemini-3.8-flash`         | Answer generation model                      |
| `GEMINI_EMBED_MODEL`  | `gemini-embedding-001`     | Embedding model                              |
| `EMBED_DIM`           | `768`                      | Vector size (must match the collection)      |
| `QDRANT_URL`          | `http://localhost:6333`    | Vector DB location                           |
| `QDRANT_COLLECTION`   | `book_chunks`              | Collection name                              |
| `CHUNK_WORDS`         | `150`                      | Words per chunk                              |
| `OVERLAP_WORDS`       | `30`                       | Overlap between chunks                       |
| `TOP_K`               | `4`                        | Chunks retrieved per question                |

If you change `EMBED_DIM` or the embedding model after indexing, delete the Qdrant collection and restart so it is rebuilt.

## API

| Method | Path          | Description                                                  |
|--------|---------------|--------------------------------------------------------------|
| GET    | `/api/health` | Qdrant and Gemini status, model names                        |
| GET    | `/api/books`  | Indexed books and vector counts                              |
| POST   | `/api/ask`    | `{"question"}` returns `answer`, `sources`, and `trace`      |
| POST   | `/api/upload` | Multipart `.txt`; indexes it and returns the ingest `trace`  |

## Design notes

- **Idempotent ingestion.** Each book is hashed (SHA-256) and recorded in a manifest. Unchanged books are skipped on startup. Re-uploading a book deletes its old vectors before storing new ones.
- **Traced pipeline.** `pipeline.js` records timing and details for every step. The UI renders the trace so each stage is visible.
- **Separate task types.** Documents are embedded with `RETRIEVAL_DOCUMENT` and questions with `RETRIEVAL_QUERY`, which improves retrieval quality.
- **Swappable components.** The vector store, embedder, and LLM are isolated in their own modules.

## Production notes

- Add authentication before exposing `/api/upload`, since it spends API credits.
- Persist `server/data` and the Qdrant volume. docker-compose already does this with named volumes.
- Gemini free tier has rate limits. Large books take longer to index on first startup.
- Set a specific `CORS` policy if the frontend is hosted on another domain.

## Resume bullets

- Built a full-stack RAG application with a React frontend, Node.js/Express backend, and Qdrant vector database.
- Implemented ingestion with chunking, Gemini embeddings, and idempotent indexing using content hashing.
- Implemented query-time retrieval using cosine-similarity vector search, prompt augmentation, and grounded answer generation with source citations.
- Built a per-step pipeline trace exposed through the API and visualized in the UI for transparency and debugging.
- Containerized the system with a multi-stage Docker build and docker-compose orchestration of the app and vector database.
- Wrote unit tests for the chunking logic and structured the backend into modular services for embedding, storage, and generation.
