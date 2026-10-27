"use strict";
/**
 * Test harness: boots the real Express app against an in-memory MongoDB.
 *
 * We use the app exported by server.js (not a hand-rolled mini app) so the
 * tests exercise the same middleware chain that production runs: helmet, cors,
 * rate limiting, body parsing, auth and the error handler.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

// Must be set before config/server are required.
const TMP_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "studyflow-test-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-for-production";
process.env.UPLOAD_DIR = TMP_UPLOADS;
process.env.RATE_LIMIT_MAX = "100000";

const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongod;
let server;
let baseUrl;

async function startServer() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("studyflow-test");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const app = require("../server");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

async function stopServer() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close(false).catch(() => {});
  if (mongod) await mongod.stop();
  fs.rmSync(TMP_UPLOADS, { recursive: true, force: true });
}

/** Minimal fetch wrapper returning { status, body, headers }. */
async function req(pathname, { method = "GET", body, token, form, raw = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + pathname, { method, headers, body: payload });
  if (raw) return res;
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

let counter = 0;

/** Register a fresh user and return { token, user }. */
async function makeUser(overrides = {}) {
  counter += 1;
  const email = overrides.email || `user${counter}.${Date.now()}@studyflow.test`;
  const { status, body } = await req("/api/auth/register", {
    method: "POST",
    body: {
      name: `Test User ${counter}`,
      email,
      password: "Sup3rSecret!pass",
      ...overrides,
    },
  });
  if (status !== 201 && status !== 200) {
    throw new Error(`register failed (${status}): ${JSON.stringify(body)}`);
  }
  return { token: body.data.token, user: body.data.user, email };
}

module.exports = { startServer, stopServer, req, makeUser, TMP_UPLOADS };
