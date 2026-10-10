import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../src/rag/chunker.js";

test("chunks are the right size and overlap correctly", () => {
  const text = Array.from({ length: 300 }, (_, i) => `w${i}`).join(" ");
  const chunks = chunkText(text, "book", { chunkWords: 120, overlapWords: 30 });

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].text.split(" ").length, 120);
  assert.equal(chunks[1].text.split(" ")[0], "w90");
  assert.equal(chunks[2].chunkIndex, 2);
});

test("rejects overlap that is not smaller than chunk size", () => {
  assert.throws(() => chunkText("a b c", "book", { chunkWords: 10, overlapWords: 10 }));
});
