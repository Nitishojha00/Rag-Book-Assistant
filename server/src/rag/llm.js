/** STEP 4 (query): generate a grounded answer from the augmented prompt. */
import { config } from "../config.js";
import { httpError } from "../errors.js";

const SYSTEM_PROMPT =
  "You answer questions using only the book excerpts provided. " +
  "Cite excerpts with bracketed numbers like [1]. " +
  "If the excerpts do not contain the answer, say so plainly instead of guessing.";

export async function generateAnswer(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.genModel}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const raw = await res.text();
  if (!res.ok) throw httpError(502, `Gemini generate error ${res.status}: ${raw.slice(0, 400)}`);

  const data = JSON.parse(raw);
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();

  return {
    text: text || "The model returned no text.",
    finishReason: candidate?.finishReason ?? "NONE",
  };
}
