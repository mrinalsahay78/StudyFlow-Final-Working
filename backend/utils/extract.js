"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Best-effort plain text extraction. Never throws for unknown types. */
async function extractText(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") {
    // macOS ships a tiny PDF-to-text helper; fall back to raw stream decoding.
    const text = await tryPdftotext(filePath);
    if (text) return text;
    return rawStrings(filePath);
  }
  if (
    mimeType.startsWith("text/") ||
    [".txt", ".md", ".csv", ".json"].includes(ext)
  ) {
    const buf = await fs.promises.readFile(filePath);
    return buf.toString("utf8").slice(0, 200000);
  }
  return "";
}

function tryPdftotext(filePath) {
  return new Promise((resolve) => {
    execFile(
      "/usr/bin/mdls",
      ["-name", "kMDItemTextContent", filePath],
      { timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve("");
        const value = String(stdout || "").trim();
        if (!value || value === "(null)") return resolve("");
        resolve(value.slice(0, 200000));
      },
    );
  });
}

/** Pull readable ASCII runs out of a PDF stream when no text extractor exists. */
async function rawStrings(filePath) {
  try {
    const buf = await fs.promises.readFile(filePath);
    const text = buf
      .toString("latin1")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    return text.slice(0, 100000);
  } catch (err) {
    return "";
  }
}

module.exports = { extractText, ALLOWED_MIME };
