"use strict";
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { ZodError } = require("zod");

const config = require("./config");

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1);

/* ------------------------------------------------------------- security */

app.use(
  helmet({
    contentSecurityPolicy: false, // the SPA ships its own CSP-safe assets
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      // Any *.vercel.app preview/production domain is accepted: preview URLs are
      // random per deployment and blocking them breaks the deployed frontend.
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.isProd ? 600 : 5000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health",
});
app.use("/api", apiLimiter);

/* --------------------------------------------------------------- routes */

const { router: authRouter } = require("./routes/auth");

app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    version: "8.0.0",
    service: "studyflow-api",
    env: config.env,
    database: mongoose.connection.readyState === 1,
    time: new Date().toISOString(),
  }),
);

app.use("/api/auth", authRouter);
app.use("/api/subjects", require("./routes/subjects"));
app.use("/api/syllabus", require("./routes/syllabus"));
app.use("/api/tasks", require("./routes/tasks"));
const sessionRoutes = require("./routes/sessions");
app.use("/api/study", sessionRoutes);
app.use("/api", sessionRoutes);
app.use("/api/planner", require("./routes/planner"));
const academicRoutes = require("./routes/academics");
app.use("/api/academics", academicRoutes);
app.use("/api", academicRoutes);
const noteRoutes = require("./routes/notes");
app.use("/api/library", noteRoutes);
app.use("/api", noteRoutes);
const quizRoutes = require("./routes/quizzes");
// Quizzes/flashcards are exposed on both the grouped (/api/quiz/...) and the
// flat (/api/quizzes, /api/flashcards) paths so both documented shapes work.
app.use("/api", quizRoutes);
app.use("/api/engineering", require("./routes/engineering"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api", require("./routes/search"));
// Mounted last: provides /api/dashboard, /api/analytics, /api/achievements.
// (search.js above provides /api/search and /api/notifications.)
app.use("/api", require("./routes/dashboard"));

/* ------------------------------------------------------- static frontend */

const clientDir = config.clientDir;
const indexHtml = path.join(clientDir, "index.html");

if (fs.existsSync(indexHtml)) {
  app.use(
    express.static(clientDir, {
      index: false,
      maxAge: "1h",
      setHeaders(res, filePath) {
        if (/\.(js|css|woff2?)$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  // SPA fallback: everything that is not an API route serves the app shell.
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(indexHtml));
} else {
  app.get("/", (req, res) =>
    res
      .status(200)
      .type("html")
      .send(
        `<!doctype html><title>StudyFlow API</title><body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
         <h1>StudyFlow API is running</h1>
         <p>The frontend build was not found at <code>${clientDir}</code>.</p>
         <p>Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>, or start the Vite dev server with <code>npm run dev</code>.</p>
         <p>API health: <a href="/api/health">/api/health</a></p></body>`,
      ),
  );
}

/* ------------------------------------------------------- error handling */

app.use("/api", (req, res) =>
  res.status(404).json({ ok: false, message: "Endpoint not found", code: "NOT_FOUND" }),
);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // A validation failure is the caller's input being wrong, not a server
  // fault: answer 400 with per-field messages instead of a generic 500.
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join(".") || "_",
      message: issue.message,
    }));
    const message = details.length
      ? `${details[0].message}${details.length > 1 ? ` (and ${details.length - 1} more)` : ""}`
      : "Please check the values you entered.";
    console.warn(`[api] ${req.method} ${req.originalUrl} -> 400 validation: ${message}`);
    if (res.headersSent) return;
    return res.status(400).json({ ok: false, message, code: "VALIDATION", details });
  }

  // Multer reports upload problems (too large, too many files, aborted) as its
  // own error type with a code but no status: map them to 4xx so a bad upload
  // never looks like a server crash.
  if (err.name === "MulterError") {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `That file is too large. The limit is ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.`
        : `Upload rejected: ${err.message}`;
    console.warn(`[api] ${req.method} ${req.originalUrl} -> ${status}: ${err.code}`);
    if (res.headersSent) return;
    return res.status(status).json({ ok: false, message, code: err.code });
  }

  const status = err.status || err.statusCode || 500;
  // Never log secrets: only method, path, status and message.
  console.error(
    `[api] ${req.method} ${req.originalUrl} -> ${status}: ${String(err.message).slice(0, 300)}`,
  );
  if (res.headersSent) return;
  const payload = {
    ok: false,
    message:
      status >= 500 && config.isProd
        ? "Something went wrong on the server. Please try again."
        : err.message || "Request failed",
    code: err.code || undefined,
  };
  if (err.details) payload.details = err.details;
  res.status(status).json(payload);
});

/* --------------------------------------------------------------- boot */

async function start() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
    console.log(`[db] connected to ${config.mongoUri.replace(/\/\/[^@]*@/, "//***@")}`);
  } catch (err) {
    console.error(
      `[db] could not connect to MongoDB at ${config.mongoUri}: ${err.message}`,
    );
    console.error(
      "[db] Start MongoDB (brew services start mongodb-community) or set MONGO_URI in backend/.env",
    );
    process.exit(1);
  }

  const server = app.listen(config.port, config.host, () => {
    console.log(
      `[api] StudyFlow API ${config.env} listening on http://${config.host}:${config.port}`,
    );
    if (!config.isProd) {
      console.log(`[api] allowed browser origins: ${config.corsOrigins.join(", ")}`);
    }
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, closing server`);
    server.close(() => mongoose.connection.close(false).then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) start();

module.exports = app;
