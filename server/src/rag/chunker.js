/**
 * STEP 1 (ingest): split a book into overlapping word windows.
 * Overlap keeps sentences that straddle a boundary retrievable from either side.
 */
export function chunkText(text, source, { chunkWords, overlapWords }) {
  const step = chunkWords - overlapWords;
  if (step <= 0) throw new Error("overlapWords must be smaller than chunkWords");

  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];

  for (let start = 0; start < words.length; start += step) {
    chunks.push({
      source,
      chunkIndex: chunks.length,
      text: words.slice(start, start + chunkWords).join(" "),
    });
    if (start + chunkWords >= words.length) break;
  }
  return chunks;
}
