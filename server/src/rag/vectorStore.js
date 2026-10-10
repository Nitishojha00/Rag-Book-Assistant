/**
 * Vector database layer (Qdrant over its REST API).
 * Stores one point per chunk: a vector plus payload {source, chunkIndex, text}.
 */
import crypto from "node:crypto";
import { config } from "../config.js";
import { httpError } from "../errors.js";

const COLLECTION = `/collections/${config.collection}`;

async function qdrant(method, path, body) {
  const res = await fetch(`${config.qdrantUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404 && method === "GET") return null;
  const raw = await res.text();
  if (!res.ok) throw httpError(502, `Qdrant ${res.status} on ${method} ${path}: ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : {};
}

export async function ping() {
  try {
    await qdrant("GET", "/collections");
    return true;
  } catch {
    return false;
  }
}

export async function ensureCollection() {
  const existing = await qdrant("GET", COLLECTION);
  if (existing) return;
  await qdrant("PUT", COLLECTION, {
    vectors: { size: config.embedDim, distance: "Cosine" },
  });
}

/** Remove all vectors belonging to one book so re-ingestion never leaves duplicates. */
export async function deleteBook(source) {
  await qdrant("POST", `${COLLECTION}/points/delete?wait=true`, {
    filter: { must: [{ key: "source", match: { value: source } }] },
  });
}

export async function upsertChunks(chunks, vectors) {
  const points = chunks.map((c, i) => ({
    id: crypto.randomUUID(),
    vector: vectors[i],
    payload: { source: c.source, chunkIndex: c.chunkIndex, text: c.text },
  }));
  for (let i = 0; i < points.length; i += 256) {
    await qdrant("PUT", `${COLLECTION}/points?wait=true`, { points: points.slice(i, i + 256) });
  }
}

/** STEP 3 (query): nearest-neighbour search by cosine similarity. */
export async function search(vector, limit) {
  const data = await qdrant("POST", `${COLLECTION}/points/search`, {
    vector,
    limit,
    with_payload: true,
  });
  return data.result.map((r) => ({ score: r.score, ...r.payload }));
}

export async function listSources() {
  const counts = new Map();
  let offset = null;
  do {
    const data = await qdrant("POST", `${COLLECTION}/points/scroll`, {
      limit: 512,
      with_payload: ["source"],
      with_vector: false,
      offset,
    });
    for (const p of data.result.points) {
      counts.set(p.payload.source, (counts.get(p.payload.source) ?? 0) + 1);
    }
    offset = data.result.next_page_offset;
  } while (offset);

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, chunks]) => ({ title, chunks }));
}
