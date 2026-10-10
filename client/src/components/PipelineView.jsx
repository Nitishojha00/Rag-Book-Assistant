const TITLES = {
  chunk: "Chunk text",
  embed_documents: "Embed chunks (Gemini embeddings)",
  store_vectors: "Store vectors (Qdrant)",
  embed_query: "Embed question (Gemini embeddings)",
  vector_search: "Vector search (Qdrant, cosine similarity)",
  augment: "Augment prompt with retrieved excerpts",
  generate: "Generate answer (Gemini)",
};

function StepDetails({ step }) {
  switch (step.step) {
    case "chunk":
      return <p>Split "{step.book}" into {step.chunks} chunks ({step.chunkWords} words, {step.overlapWords} overlap).</p>;
    case "embed_documents":
      return <p>Converted {step.count} chunks into {step.dims}-dimensional vectors with {step.model}.</p>;
    case "store_vectors":
      return <p>Stored {step.count} vectors for "{step.book}" in collection "{step.collection}".</p>;
    case "embed_query":
      return <p>Converted the question into a {step.dims}-dimensional vector with {step.model}.</p>;
    case "vector_search":
      return (
        <>
          <p>Top {step.top_k} nearest chunks in "{step.collection}":</p>
          <ul>
            {step.hits.map((h, i) => (
              <li key={i}>{h.source} · chunk {h.chunkIndex} · similarity {h.score}</li>
            ))}
          </ul>
        </>
      );
    case "augment":
      return <p>Built a prompt with {step.excerpts} excerpts ({step.prompt_chars} characters).</p>;
    case "generate":
      return <p>Sent the prompt to {step.model}. Finish reason: {step.finishReason}.</p>;
    default:
      return null;
  }
}

export default function PipelineView({ title, trace }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {!trace?.length ? (
        <p className="muted">Steps will appear here.</p>
      ) : (
        <ol className="steps">
          {trace.map((s, i) => (
            <li key={i} className="step">
              <div className="step-head">
                <span className="badge">{i + 1}</span>
                <strong>{TITLES[s.step] ?? s.step}</strong>
                {s.ms !== undefined && <span className="ms">{s.ms} ms</span>}
              </div>
              <StepDetails step={s} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
