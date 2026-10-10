/**
 * STEP 2 (ingest) and STEP 1 (query): turn text into dense vectors with Gemini embeddings.
 * Documents and queries use different task types so retrieval quality is better.
 */
import { config } from "../config.js";
import { httpError } from "../errors.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const BATCH_SIZE = 50;

async function geminiPost(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await res.text();
  if (!res.ok) throw httpError(502, `Gemini embedding error ${res.status}: ${raw.slice(0, 400)}`);
  return JSON.parse(raw);
}

export async function embedDocuments(texts) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const data = await geminiPost(`models/${config.embedModel}:batchEmbedContents`, {
      requests: batch.map((text) => ({
        model: `models/${config.embedModel}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: config.embedDim,
      })),
    });
    vectors.push(...data.embeddings.map((e) => e.values));
  }
  return vectors;
}

export async function embedQuery(text) {
  const data = await geminiPost(`models/${config.embedModel}:embedContent`, {
    model: `models/${config.embedModel}`,
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: config.embedDim,
  });
  return data.embedding.values;
}
