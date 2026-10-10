import { useState } from "react";

export default function BooksPanel({ books, busy, onUpload }) {
  const [file, setFile] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    await onUpload(file);
    setFile(null);
    e.target.reset();
  }

  return (
    <section className="card">
      <h2>Books in vector DB</h2>
      {books.length === 0 ? (
        <p className="muted">No books indexed yet.</p>
      ) : (
        <ul>
          {books.map((b) => (
            <li key={b.title}>
              {b.title} <span className="muted">({b.chunks} vectors)</span>
            </li>
          ))}
        </ul>
      )}
      <form className="upload" onSubmit={handleSubmit}>
        <input type="file" accept=".txt" onChange={(e) => setFile(e.target.files[0] ?? null)} />
        <button type="submit" disabled={busy || !file}>Upload and index</button>
      </form>
    </section>
  );
}
