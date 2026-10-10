const BASE = "/api";

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

export const getHealth = () => fetch(`${BASE}/health`).then(parse);
export const getBooks = () => fetch(`${BASE}/books`).then(parse);

export const ask = (question) =>
  fetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  }).then(parse);

export const upload = (file) => {
  const form = new FormData();
  form.append("file", file);
  return fetch(`${BASE}/upload`, { method: "POST", body: form }).then(parse);
};
