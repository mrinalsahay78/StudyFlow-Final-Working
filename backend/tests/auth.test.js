"use strict";
/**
 * Auth contract tests: registration, login, session guards, logout, password
 * change. These cover the flows a user hits first and the ones that must never
 * leak across accounts.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, req, makeUser } = require("./helpers");

let baseUrl;

test.before(async () => {
  baseUrl = await startServer();
});
test.after(stopServer);

test("health endpoint reports ok and a database connection", async () => {
  const { status, body } = await req("/api/health");
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.database, true);
});

test("register returns 201 with a token and no password hash", async () => {
  const email = `reg.${Date.now()}@studyflow.test`;
  const { status, body } = await req("/api/auth/register", {
    method: "POST",
    body: { name: "Reg User", email, password: "Sup3rSecret!pass" },
  });
  assert.equal(status, 201);
  assert.equal(body.ok, true);
  assert.ok(body.data.token, "token expected");
  assert.equal(body.data.user.email, email);
  assert.equal(body.data.user.password, undefined);
  assert.equal(body.data.user.passwordHash, undefined);
});

test("duplicate email is rejected with 409 EMAIL_TAKEN", async () => {
  const email = `dupe.${Date.now()}@studyflow.test`;
  const payload = { name: "Dupe", email, password: "Sup3rSecret!pass" };
  const first = await req("/api/auth/register", { method: "POST", body: payload });
  assert.equal(first.status, 201);
  const second = await req("/api/auth/register", { method: "POST", body: payload });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "EMAIL_TAKEN");
});

test("register validates weak passwords", async () => {
  const { status, body } = await req("/api/auth/register", {
    method: "POST",
    body: { name: "X", email: "not-an-email", password: "short" },
  });
  assert.equal(status, 400);
  assert.equal(body.ok, false);
});

test("login accepts correct credentials and rejects wrong ones", async () => {
  const { email } = await makeUser();
  const good = await req("/api/auth/login", {
    method: "POST",
    body: { email, password: "Sup3rSecret!pass" },
  });
  assert.equal(good.status, 200);
  assert.ok(good.body.data.token);

  const bad = await req("/api/auth/login", {
    method: "POST",
    body: { email, password: "WrongPassword1!" },
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.ok, false);
});

test("protected routes reject missing and forged tokens", async () => {
  const none = await req("/api/tasks");
  assert.equal(none.status, 401);

  const forged = await req("/api/tasks", { token: "not.a.jwt" });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.code, "INVALID_SESSION");
});

test("me reflects the authenticated user and profile edits persist", async () => {
  const { token } = await makeUser();
  const me = await req("/api/auth/me", { token });
  assert.equal(me.status, 200);

  const updated = await req("/api/auth/profile", {
    method: "PUT",
    token,
    body: { name: "Renamed Person", semester: 4 },
  });
  assert.equal(updated.status, 200);
  const after = await req("/api/auth/me", { token });
  assert.equal(after.body.data.user.name, "Renamed Person");
  assert.equal(after.body.data.user.semester, 4);
});

test("logout clears the session cookie", async () => {
  const { token } = await makeUser();
  const res = await req("/api/auth/logout", { method: "POST", token, raw: true });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("set-cookie") || "";
  assert.match(setCookie, /sf_token=/);
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970|Max-Age=0/i);
});

test("password change requires the current password", async () => {
  const { token, email } = await makeUser();
  const wrong = await req("/api/auth/password", {
    method: "PUT",
    token,
    body: { currentPassword: "Nope1234!", newPassword: "An0ther!pass" },
  });
  assert.ok(wrong.status >= 400 && wrong.status < 500, `expected 4xx, got ${wrong.status}`);

  const right = await req("/api/auth/password", {
    method: "PUT",
    token,
    body: { currentPassword: "Sup3rSecret!pass", newPassword: "An0ther!pass" },
  });
  assert.equal(right.status, 200);

  const relogin = await req("/api/auth/login", {
    method: "POST",
    body: { email, password: "An0ther!pass" },
  });
  assert.equal(relogin.status, 200);
});
