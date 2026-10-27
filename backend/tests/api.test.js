"use strict";
/**
 * Data contract tests: CRUD on the core resources plus the isolation rule that
 * matters most — one user must never be able to read, mutate or delete another
 * user's documents by guessing an id.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, req, makeUser } = require("./helpers");

test.before(async () => {
  await startServer();
});
test.after(stopServer);

/* ------------------------------------------------------------- subjects */

test("subject CRUD round-trip", async () => {
  const { token } = await makeUser();

  const created = await req("/api/subjects", {
    method: "POST",
    token,
    body: { name: "Operating Systems", code: "CS-401", color: "#4f8cff", credits: 4 },
  });
  assert.equal(created.status, 201);
  const id = created.body.data._id;

  const list = await req("/api/subjects", { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.items.length, 1);

  const patched = await req(`/api/subjects/${id}`, {
    method: "PUT",
    token,
    body: { name: "Operating Systems II" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.name, "Operating Systems II");

  const removed = await req(`/api/subjects/${id}`, { method: "DELETE", token });
  assert.equal(removed.status, 200);

  const after = await req("/api/subjects", { token });
  assert.equal(after.body.data.items.length, 0);
});

test("subject rejects malformed ids and invalid bodies", async () => {
  const { token } = await makeUser();
  const badId = await req("/api/subjects/not-an-id", { token });
  assert.equal(badId.status, 400);

  const badBody = await req("/api/subjects", { method: "POST", token, body: { name: "" } });
  assert.equal(badBody.status, 400);
});

/* ---------------------------------------------------------------- tasks */

test("tasks support create, filter, complete and delete", async () => {
  const { token } = await makeUser();

  const a = await req("/api/tasks", {
    method: "POST",
    token,
    body: { title: "Read chapter 3", priority: "high", dueDate: "2026-01-05" },
  });
  const b = await req("/api/tasks", {
    method: "POST",
    token,
    body: { title: "Finish lab report", priority: "low" },
  });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);

  const open = await req("/api/tasks", { token });
  assert.equal(open.body.data.items.length, 2);

  const done = await req(`/api/tasks/${a.body.data._id}`, {
    method: "PUT",
    token,
    body: { status: "done" },
  });
  assert.equal(done.status, 200);
  assert.equal(done.body.data.status, "done");
  assert.ok(done.body.data.completedAt, "completedAt should be stamped");

  const filtered = await req("/api/tasks?status=done", { token });
  assert.equal(filtered.body.data.items.length, 1);
  assert.equal(filtered.body.data.items[0].title, "Read chapter 3");

  const deleted = await req(`/api/tasks/${b.body.data._id}`, { method: "DELETE", token });
  assert.equal(deleted.status, 200);
  const remaining = await req("/api/tasks", { token });
  assert.equal(remaining.body.data.items.length, 1);
});

test("task search filters by title", async () => {
  const { token } = await makeUser();
  await req("/api/tasks", { method: "POST", token, body: { title: "Discrete maths assignment" } });
  await req("/api/tasks", { method: "POST", token, body: { title: "Buy groceries" } });

  const found = await req("/api/tasks?q=maths", { token });
  assert.equal(found.body.data.items.length, 1);
  assert.match(found.body.data.items[0].title, /maths/i);
});

/* ---------------------------------------------------------------- notes */

test("library notes CRUD round-trip", async () => {
  const { token } = await makeUser();
  const created = await req("/api/library/notes", {
    method: "POST",
    token,
    body: { title: "Deadlock notes", body: "Four conditions...", tags: ["os"] },
  });
  assert.equal(created.status, 201);
  const id = created.body.data._id;

  const one = await req(`/api/library/notes/${id}`, { token });
  assert.equal(one.status, 200);
  assert.equal(one.body.data.title, "Deadlock notes");

  const patched = await req(`/api/library/notes/${id}`, {
    method: "PUT",
    token,
    body: { pinned: true },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.pinned, true);

  const removed = await req(`/api/library/notes/${id}`, { method: "DELETE", token });
  assert.equal(removed.status, 200);
  const gone = await req(`/api/library/notes/${id}`, { token });
  assert.equal(gone.status, 404);
});

/* ------------------------------------------------------------ isolation */

test("a user cannot read or mutate another user's documents", async () => {
  const alice = await makeUser();
  const bob = await makeUser();

  const task = await req("/api/tasks", {
    method: "POST",
    token: alice.token,
    body: { title: "Alice private task" },
  });
  const taskId = task.body.data._id;
  const subject = await req("/api/subjects", {
    method: "POST",
    token: alice.token,
    body: { name: "Alice subject" },
  });
  const subjectId = subject.body.data._id;

  // Bob sees none of it.
  const bobTasks = await req("/api/tasks", { token: bob.token });
  assert.equal(bobTasks.body.data.items.length, 0);
  const bobSubjects = await req("/api/subjects", { token: bob.token });
  assert.equal(bobSubjects.body.data.items.length, 0);

  // Bob cannot fetch, update or delete by id.
  assert.equal((await req(`/api/tasks/${taskId}`, { token: bob.token })).status, 404);
  assert.equal(
    (await req(`/api/tasks/${taskId}`, { method: "PUT", token: bob.token, body: { title: "hijack" } }))
      .status,
    404,
  );
  assert.equal(
    (await req(`/api/tasks/${taskId}`, { method: "DELETE", token: bob.token })).status,
    404,
  );
  assert.equal(
    (await req(`/api/subjects/${subjectId}`, { method: "DELETE", token: bob.token })).status,
    404,
  );

  // Alice's data is untouched.
  const stillThere = await req(`/api/tasks/${taskId}`, { token: alice.token });
  assert.equal(stillThere.status, 200);
  assert.equal(stillThere.body.data.title, "Alice private task");
});

/* ---------------------------------------------------------- dashboard */

test("dashboard aggregates without leaking another user's counts", async () => {
  const alice = await makeUser();
  const bob = await makeUser();
  await req("/api/tasks", { method: "POST", token: alice.token, body: { title: "A1" } });
  await req("/api/tasks", { method: "POST", token: alice.token, body: { title: "A2" } });

  const aliceDash = await req("/api/dashboard", { token: alice.token });
  assert.equal(aliceDash.status, 200);

  const bobDash = await req("/api/dashboard", { token: bob.token });
  assert.equal(bobDash.status, 200);
  assert.notDeepEqual(aliceDash.body.data, bobDash.body.data);
});

/* -------------------------------------------------------- validation */

test("invalid payloads answer 400 with per-field details, never 500", async () => {
  const { token } = await makeUser();

  const task = await req("/api/tasks", { method: "POST", token, body: { title: "" } });
  assert.equal(task.status, 400);
  assert.equal(task.body.code, "VALIDATION");
  assert.ok(Array.isArray(task.body.details) && task.body.details.length > 0);
  assert.equal(task.body.details[0].field, "title");

  const subject = await req("/api/subjects", {
    method: "POST",
    token,
    body: { name: "Ok name", credits: 999 },
  });
  assert.equal(subject.status, 400);
  assert.equal(subject.body.code, "VALIDATION");

  const session = await req("/api/study/sessions", {
    method: "POST",
    token,
    body: { date: "not-a-date", minutes: -5 },
  });
  assert.equal(session.status, 400);
  assert.equal(session.body.code, "VALIDATION");
});
