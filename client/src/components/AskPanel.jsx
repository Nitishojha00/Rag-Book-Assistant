export default function AskPanel({ question, setQuestion, onSubmit, busy, result }) {
  return (
    <section className="card">
      <h2>Ask your books</h2>
      <form className="ask" onSubmit={onSubmit}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What does PATCH do?"
          minLength={3}
          maxLength={1000}
        />
        <button type="submit" disabled={busy || question.trim().length < 3}>
          {busy ? "Working..." : "Ask"}
        </button>
      </form>

      {result && (
        <>
          <div className="answer">{result.answer}</div>
          {result.sources.length > 0 && (
            <>
              <h3>Retrieved sources</h3>
              {result.sources.map((s, i) => (
                <div key={`${s.source}-${s.chunkIndex}`} className="source">
                  <div className="meta">
                    [{i + 1}] {s.source} · chunk {s.chunkIndex} · similarity {s.score.toFixed(3)}
                  </div>
                  <p>{s.text.slice(0, 300)}{s.text.length > 300 ? "..." : ""}</p>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
