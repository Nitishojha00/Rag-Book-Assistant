import { useCallback, useEffect, useState } from "react";
import { ask, getBooks, getHealth, upload } from "./api.js";
import AskPanel from "./components/AskPanel.jsx";
import PipelineView from "./components/PipelineView.jsx";
import BooksPanel from "./components/BooksPanel.jsx";

export default function App() {
  const [health, setHealth] = useState(null);
  const [books, setBooks] = useState([]);
  const [question, setQuestion] = useState("");
  const [askResult, setAskResult] = useState(null);
  const [ingestResult, setIngestResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [h, b] = await Promise.all([getHealth(), getBooks()]);
      setHealth(h);
      setBooks(b.books);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAsk(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setAskResult(await ask(question.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file) {
    setBusy(true);
    setError("");
    try {
      setIngestResult(await upload(file));
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Book RAG</h1>
        <p className="muted">
          Retrieval-Augmented Generation with Gemini embeddings, Qdrant vector search, and Gemini answers.
        </p>
        {health && (
          <div className="status">
            <span className={`dot ${health.vectorDb ? "ok" : "bad"}`} />
            Qdrant {health.vectorDb ? "connected" : "unreachable"}
            <span className={`dot ${health.geminiConfigured ? "ok" : "bad"}`} />
            Gemini {health.geminiConfigured ? "key set" : "key missing"}
          </div>
        )}
      </header>

      {error && <div className="error">{error}</div>}

      <div className="grid">
        <AskPanel
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleAsk}
          busy={busy}
          result={askResult}
        />
        <aside>
          <PipelineView title="Query pipeline" trace={askResult?.trace} />
          <PipelineView title="Ingestion pipeline (last upload)" trace={ingestResult?.trace} />
          <BooksPanel books={books} busy={busy} onUpload={handleUpload} />
        </aside>
      </div>
    </div>
  );
}
