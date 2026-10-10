import express from "express";
import multer from "multer";
import { config } from "../config.js";
import * as pipeline from "../rag/pipeline.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

// Express 4 does not forward async errors, so wrap async handlers.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/health", wrap(async (req, res) => {
  res.json({
    status: "ok",
    collection: config.collection,
    models: { embed: config.embedModel, generate: config.genModel, dims: config.embedDim },
    ...(await pipeline.status()),
  });
}));

router.get("/books", wrap(async (req, res) => {
  res.json({ books: await pipeline.listBooks() });
}));

router.post("/ask", wrap(async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (question.length < 3 || question.length > 1000) {
    return res.status(422).json({ detail: "Question must be 3 to 1000 characters." });
  }
  res.json(await pipeline.ask(question));
}));

router.post("/upload", upload.single("file"), wrap(async (req, res) => {
  const file = req.file;
  if (!file || !file.originalname.toLowerCase().endsWith(".txt")) {
    return res.status(400).json({ detail: "Only .txt files are supported." });
  }
  res.json(await pipeline.ingestUpload(file.originalname, file.buffer.toString("utf8")));
}));

export default router;
