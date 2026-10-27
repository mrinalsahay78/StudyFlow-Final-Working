"use strict";
require("dotenv").config();

const path = require("path");
const fs = require("fs");

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

function requiredInProd(name, devFallback) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (isProd) {
    console.error(
      `[config] FATAL: ${name} must be set in production. Refusing to start with an insecure default.`,
    );
    process.exit(1);
  }
  return devFallback;
}

const config = {
  env: NODE_ENV,
  isProd,
  port: Number(process.env.PORT || 5001),
  host: process.env.HOST || "127.0.0.1",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studyflow",
  jwtSecret: requiredInProd(
    "JWT_SECRET",
    "studyflow-local-development-secret-do-not-use-in-production",
  ),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30d",
  // Comma separated list of allowed browser origins. In production the
  // frontend is served by this same server, so CORS is only needed when the
  // frontend is hosted separately (for example a Vite dev server).
  corsOrigins: (
    process.env.CORS_ORIGINS ||
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5273,http://localhost:5273"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Where built frontend assets live (served by this server in production).
  clientDir: process.env.CLIENT_DIR
    ? path.resolve(process.env.CLIENT_DIR)
    : path.resolve(__dirname, "..", "frontend", "dist"),
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(__dirname, "uploads"),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024),
  // AI provider: "openai" (OpenAI compatible chat completions) or "none".
  ai: {
    provider: (process.env.AI_PROVIDER || "").toLowerCase(),
    apiKey: process.env.AI_API_KEY || "",
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    ),
    model: process.env.AI_MODEL || "gpt-4o-mini",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
  },
  // Password reset: when SMTP is not configured the server logs a reset link
  // to its own console instead of pretending an email was sent.
  publicUrl: (process.env.PUBLIC_URL || "http://127.0.0.1:5173").replace(
    /\/$/,
    "",
  ),
  trustProxy: process.env.TRUST_PROXY === "true",
};

config.uploadDir && fs.existsSync(config.uploadDir);

module.exports = config;
