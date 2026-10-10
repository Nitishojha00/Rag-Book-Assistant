/**
 * The RAG pipeline, with every step recorded in a trace the UI can display.
 *
 * INGEST:  load -> chunk -> embed -> store in vector DB
 * QUERY:   embed question -> vector search -> augment prompt -> generate answer
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { httpError } from "../errors.js";
import { chunkText } from "./chunker.js";
import { embedDocuments, embedQuery } from "./embedder.js";
import { generateAnswer } from "./llm.js";
import * as store from "./vectorStore.js";

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const manifestPath = () => path.join(config.dataDir, "manifest.json");

function safeFilename(name) {
  const stem = path.parse(name).name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${stem || "book"}.txt`;
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveManifestEntry(name, hash) {
  const manifest = loadManifest();
  manifest[name] = hash;
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2));
}

function listBookFiles() {
  return fs.readdirSync(config.booksDir).filter((f) => f.toLowerCase().endsWith(".txt")).sort();
}

/** INGEST steps for one book. Returns a trace of what happened. */
async function ingestBook(name, text) {
  const trace = [];

  // Step 1: chunk
  const chunks = chunkText(text, name, config);
  trace.push({
    step: "chunk",
    book: name,
    chunks: chunks.length,
    chunkWords: config.chunkWords,
    overlapWords: config.overlapWords,
  });

  // Step 2: embed every chunk into a vector
  let t = Date.now();
  const vectors = await embedDocuments(chunks.map((c) => c.text));
  trace.push({
    step: "embed_documents",
    model: config.embedModel,
    count: vectors.length,
    dims: config.embedDim,
    ms: Date.now() - t,
  });

  // Step 3: replace any old vectors for this book and store the new ones
  t = Date.now();
  await store.deleteBook(name);
  await store.upsertChunks(chunks, vectors);
  trace.push({
    step: "store_vectors",
    collection: config.collection,
    book: name,
    count: chunks.length,
    ms: Date.now() - t,
  });

  return { book: name, chunks: chunks.length, trace };
}

/** Called on server start: index new or changed books, skip the rest. */
export async function startup() {
  fs.mkdirSync(config.booksDir, { recursive: true });
  await store.ensureCollection();

  if (!config.geminiKey) {
    console.warn("GEMINI_API_KEY is not set: books will not be indexed and /api/ask is disabled.");
    return;
  }

  const manifest = loadManifest();
  const indexed = new Set((await store.listSources()).map((s) => s.title));

  for (const name of listBookFiles()) {
    const text = fs.readFileSync(path.join(config.booksDir, name), "utf8");
    const hash = sha256(text);
    if (manifest[name] === hash && indexed.has(path.parse(name).name)) {
      console.log(`Up to date: ${name}`);
      continue;
    }
    const result = await ingestBook(name, text);
    saveManifestEntry(name, hash);
    console.log(`Indexed ${name}: ${result.chunks} chunks`);
  }
}

/** Called when a user uploads a book from the UI. */
export async function ingestUpload(originalName, text) {
  if (!config.geminiKey) throw httpError(503, "GEMINI_API_KEY is not set on the server.");

  const name = safeFilename(originalName);
  fs.writeFileSync(path.join(config.booksDir, name), text, "utf8");
  const result = await ingestBook(name, text);
  saveManifestEntry(name, sha256(text));
  return { saved_as: name, ...result };
}

function buildPrompt(question, hits) {
  const excerpts = hits
    .map((h, i) => `[${i + 1}] (from "${h.source}", chunk ${h.chunkIndex})\n${h.text}`)
    .join("\n\n");
  return `Excerpts:\n\n${excerpts}\n\nQuestion: ${question}\n\nAnswer using only the excerpts above and cite them like [1].`;
}

/** QUERY steps. Returns the answer, the sources used, and the full trace. */
export async function ask(question) {
  if (!config.geminiKey) throw httpError(503, "GEMINI_API_KEY is not set on the server.");

  const trace = [];

  // Step 1: embed the question with the same model used for documents
  let t = Date.now();
  const queryVector = await embedQuery(question);
  trace.push({
    step: "embed_query",
    model: config.embedModel,
    dims: queryVector.length,
    ms: Date.now() - t,
  });

  // Step 2: vector search for the closest chunks
  t = Date.now();
  const hits = await store.search(queryVector, config.topK);
  trace.push({
    step: "vector_search",
    collection: config.collection,
    top_k: config.topK,
    hits: hits.map((h) => ({ source: h.source, chunkIndex: h.chunkIndex, score: Number(h.score.toFixed(3)) })),
    ms: Date.now() - t,
  });

  if (!hits.length) {
    return {
      answer: "Nothing relevant was found in the indexed books.",
      sources: [],
      trace,
      llmUsed: false,
    };
  }

  // Step 3: augment the prompt with the retrieved context
  const prompt = buildPrompt(question, hits);
  trace.push({ step: "augment", excerpts: hits.length, prompt_chars: prompt.length });

  // Step 4: generate the grounded answer
  t = Date.now();
  const generated = await generateAnswer(prompt);
  trace.push({
    step: "generate",
    model: config.genModel,
    finishReason: generated.finishReason,
    ms: Date.now() - t,
  });

  return { answer: generated.text, sources: hits, trace, llmUsed: true };
}

export async function status() {
  return {
    vectorDb: await store.ping(),
    geminiConfigured: Boolean(config.geminiKey),
  };
}

export const listBooks = () => store.listSources();
