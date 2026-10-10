import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import apiRouter from "./routes/api.js";
import { startup } from "./rag/pipeline.js";

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiRouter);

// Serve the built React app in production.
if (fs.existsSync(config.clientDir)) {
  app.use(express.static(config.clientDir));
  app.get("*", (req, res) => res.sendFile(path.join(config.clientDir, "index.html")));
}

// Central error handler.
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ detail: "File too large (10 MB max)." });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ detail: err.message });
});

try {
  await startup();
} catch (err) {
  console.error("Startup problem (is Qdrant running?):", err.message);
}

app.listen(config.port, () => {
  console.log(`Book RAG running on http://localhost:${config.port}`);
});
