
/** STEP 4 (query): generate a grounded answer from the augmented prompt. */
import { config } from "../config.js";
import { httpError } from "../errors.js";

const SYSTEM_PROMPT =
  "You answer questions using only the book excerpts provided. " +
  "Cite excerpts with bracketed numbers like [1]. " +
  "If the excerpts do not contain the answer, say so plainly instead of guessing.";

const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function generateAnswer(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.genModel}:generateContent`;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.geminiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.2,
      },
    }),
  };

  let res;
  let raw = "";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60_000),
      });

      raw = await res.text();

      // Success, or an error that should not be retried.
      if (
        res.ok ||
        !RETRYABLE_STATUSES.includes(res.status) ||
        attempt === MAX_RETRIES
      ) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s.
      const delay = 1000 * 2 ** attempt;

      console.warn(
        `Gemini returned ${res.status}. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms.`
      );

      await sleep(delay);
    } catch (error) {
      // Retry network failures and request timeouts.
      if (attempt === MAX_RETRIES) {
        throw httpError(
          502,
          `Gemini request failed after ${MAX_RETRIES + 1} attempts: ${error.message}`
        );
      }

      const delay = 1000 * 2 ** attempt;

      console.warn(
        `Gemini request failed. ` +
        `Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms.`
      );

      await sleep(delay);
    }
  }

  if (!res.ok) {
    throw httpError(
      502,
      `Gemini generate error ${res.status}: ${raw.slice(0, 400)}`
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw httpError(502, "Gemini returned invalid JSON.");
  }

  const candidate = data.candidates?.[0];

  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  return {
    text: text || "The model returned no text.",
    finishReason: candidate?.finishReason ?? "NONE",
  };
}
