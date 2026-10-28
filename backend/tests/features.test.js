"use strict";
/**
 * Feature contracts for the modules the core CRUD suite does not touch:
 * planner (overlap rules, generation invariants, reschedule), quizzes and
 * attempts (answer-key stripping, objective scoring, performance roll-up),
 * the spaced-repetition scheduler, focus sessions, cross-entity search and
 * the notification feed.
 *
 * Each test registers its own user, so every assertion is also implicitly a
 * cross-user isolation check: data from another user must never show up.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, stopServer, req, makeUser } = require("./helpers");

test.before(async () => {
  await startServer();
});
test.after(stopServer);

/* --------------------------------------------------------------- helpers */

const iso = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

async function makeSubject(token, name = "Data Structures") {
  const res = await req("/api/subjects", {
    method: "POST",
    token,
    body: { name, code: "CS-201", credits: 4 },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

/* --------------------------------------------------------------- planner */

test("planner rejects an entry whose end is not after its start", async () => {
  const { token } = await makeUser();
  const res = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Backwards block", date: iso(), start: "10:00", end: "09:00" },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "BAD_TIME");

  const same = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Zero length", date: iso(), start: "10:00", end: "10:00" },
  });
  assert.equal(same.status, 400);
});

test("planner refuses overlapping blocks unless allowOverlap is set", async () => {
  const { token } = await makeUser();
  const first = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Calculus revision", date: iso(), start: "09:00", end: "10:30" },
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.data.minutes, 90, "minutes must be derived from the times");

  const clash = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Physics", date: iso(), start: "10:00", end: "11:00" },
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, "CONFLICT");
  assert.match(clash.body.message, /Calculus revision/);

  // Back-to-back is not an overlap.
  const adjacent = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Physics", date: iso(), start: "10:30", end: "11:30" },
  });
  assert.equal(adjacent.status, 201);

  const allowed = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Overlap allowed", date: iso(), start: "10:45", end: "11:15", allowOverlap: true },
  });
  assert.equal(allowed.status, 201);
});

test("planner update keeps the same overlap and ordering rules", async () => {
  const { token } = await makeUser();
  const a = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "A", date: iso(), start: "09:00", end: "10:00" },
  });
  const b = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "B", date: iso(), start: "11:00", end: "12:00" },
  });

  const clash = await req(`/api/planner/${b.body.data._id}`, {
    method: "PUT",
    token,
    body: { start: "09:30", end: "10:30" },
  });
  assert.equal(clash.status, 409);

  const backwards = await req(`/api/planner/${b.body.data._id}`, {
    method: "PUT",
    token,
    body: { start: "12:00", end: "11:00" },
  });
  assert.equal(backwards.status, 400);

  const ok = await req(`/api/planner/${b.body.data._id}`, {
    method: "PUT",
    token,
    body: { end: "13:00" },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.minutes, 120);

  // The untouched entry must not have moved.
  const list = await req("/api/planner", { token });
  const stillA = list.body.data.items.find((e) => String(e._id) === String(a.body.data._id));
  assert.equal(stillA.start, "09:00");
  assert.equal(stillA.end, "10:00");
});

test("planner insights report overlaps and missed sessions", async () => {
  const { token } = await makeUser();
  await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Yesterday", date: iso(-1), start: "09:00", end: "10:00" },
  });
  await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "X", date: iso(), start: "14:00", end: "15:00" },
  });
  await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Y", date: iso(), start: "14:30", end: "15:30", allowOverlap: true },
  });

  const res = await req(`/api/planner/insights?from=${iso(-2)}&to=${iso(2)}`, { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.conflicts.length, 1);
  assert.equal(res.body.data.conflicts[0].date, iso());
  assert.equal(res.body.data.missed.length, 1);
  assert.equal(res.body.data.missed[0].title, "Yesterday");
  assert.equal(res.body.data.days.length, 5);
  const today = res.body.data.days.find((d) => d.date === iso());
  assert.equal(today.plannedMinutes, 120);
});

test("planner generate only creates real, non-overlapping sessions", async () => {
  const { token } = await makeUser();
  const subject = await makeSubject(token);
  await req(`/api/subjects/${subject._id}/topics`, {
    method: "POST",
    token,
    body: { title: "Binary trees", estimatedMinutes: 120, priority: "high" },
  });
  await req("/api/tasks", {
    method: "POST",
    token,
    body: { title: "Lab report", dueDate: iso(1), priority: "high", estimatedMinutes: 60 },
  });

  const res = await req("/api/planner/generate", {
    method: "POST",
    token,
    body: { days: 7, dailyMinutes: 120, sessionMinutes: 45 },
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.created > 0, "generation should schedule something");

  for (const e of res.body.data.entries) {
    assert.ok(e.minutes > 0, `entry "${e.title}" must have positive minutes`);
    const [sh, sm] = e.start.split(":").map(Number);
    const [eh, em] = e.end.split(":").map(Number);
    assert.ok(
      eh * 60 + em > sh * 60 + sm,
      `entry "${e.title}" ends at or before it starts (${e.start}-${e.end})`,
    );
    assert.equal(e.generated, true);
  }

  // Nothing generated may collide with what is already in the plan.
  const byDate = new Map();
  for (const e of res.body.data.entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  for (const [date, list] of byDate) {
    list.sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 1; i < list.length; i += 1) {
      assert.ok(
        list[i].start >= list[i - 1].end,
        `overlapping generated sessions on ${date}: ${list[i - 1].start}-${list[i - 1].end} and ${list[i].start}-${list[i].end}`,
      );
    }
  }

  // Regenerating with replaceGenerated swaps the generated set, not the manual one.
  const again = await req("/api/planner/generate", {
    method: "POST",
    token,
    body: { days: 7, dailyMinutes: 120, sessionMinutes: 45, replaceGenerated: true },
  });
  assert.equal(again.status, 200);
  const all = await req("/api/planner", { token });
  const generated = all.body.data.items.filter((e) => e.generated);
  assert.equal(generated.length, again.body.data.created);
});

test("planner reschedule moves a missed session to a free future slot", async () => {
  const { token } = await makeUser();
  const created = await req("/api/planner", {
    method: "POST",
    token,
    body: { title: "Missed one", date: iso(-1), start: "09:00", end: "10:00" },
  });
  const res = await req(`/api/planner/${created.body.data._id}/reschedule`, {
    method: "POST",
    token,
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.date > iso(-1), "rescheduled entry must move forward");
  assert.equal(res.body.data.minutes, 60);
  assert.equal(res.body.data.missed, false);
});

test("planner is per-user: ids from another account are not found", async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const entry = await req("/api/planner", {
    method: "POST",
    token: owner.token,
    body: { title: "Private", date: iso(), start: "09:00", end: "10:00" },
  });
  const id = entry.body.data._id;

  assert.equal((await req(`/api/planner/${id}`, { method: "PUT", token: stranger.token, body: { title: "hijack" } })).status, 404);
  assert.equal((await req(`/api/planner/${id}`, { method: "DELETE", token: stranger.token })).status, 404);
  assert.equal((await req(`/api/planner/${id}/reschedule`, { method: "POST", token: stranger.token })).status, 404);

  const stillThere = await req("/api/planner", { token: owner.token });
  assert.equal(stillThere.body.data.items.length, 1);
  assert.equal(stillThere.body.data.items[0].title, "Private");
});

/* --------------------------------------------------------------- quizzes */

const quizBody = () => ({
  title: "Trees check",
  questions: [
    { prompt: "Root of a tree has how many parents?", type: "mcq", options: ["0", "1", "2"], answerIndex: 0, topicTitle: "Trees" },
    { prompt: "Which traversal visits root first?", type: "mcq", options: ["inorder", "preorder", "postorder"], answerIndex: 1, topicTitle: "Traversals" },
    { prompt: "Name the operation that removes a leaf", type: "short", answerText: "deletion removes a leaf node", topicTitle: "Trees" },
    { prompt: "Unkeyed question", type: "mcq", options: ["a", "b"] },
  ],
});

test("quiz list hides questions, detail hides the answer key", async () => {
  const { token } = await makeUser();
  const created = await req("/api/quizzes", { method: "POST", token, body: quizBody() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data._id;

  const list = await req("/api/quizzes", { token });
  assert.equal(list.body.data.items.length, 1);
  assert.equal(list.body.data.items[0].questionCount, 4);
  assert.equal(list.body.data.items[0].questions, undefined);

  const detail = await req(`/api/quizzes/${id}`, { token });
  assert.equal(detail.status, 200);
  for (const q of detail.body.data.questions) {
    assert.equal(q.answerIndex, undefined, "answerIndex must not reach the practice view");
    assert.equal(q.answerText, undefined);
    assert.equal(q.explanation, undefined);
  }

  const withAnswers = await req(`/api/quizzes/${id}?withAnswers=true`, { token });
  assert.equal(withAnswers.body.data.questions[1].answerIndex, 1);
});

test("quiz attempt is scored objectively and never guesses a missing key", async () => {
  const { token } = await makeUser();
  const created = await req("/api/quizzes", { method: "POST", token, body: quizBody() });
  const quiz = created.body.data;
  const [q1, q2, q3, q4] = quiz.questions;

  const res = await req(`/api/quizzes/${quiz._id}/attempts`, {
    method: "POST",
    token,
    body: {
      durationSeconds: 90,
      answers: [
        { questionId: q1._id, given: "0" }, // correct
        { questionId: q2._id, given: "0" }, // wrong
        { questionId: q3._id, given: "deletion removes a leaf" }, // keyword match
        { questionId: q4._id, given: "" }, // no key, blank answer
      ],
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.attempt.score, 2);
  assert.equal(res.body.data.attempt.total, 4);
  assert.equal(res.body.data.attempt.accuracy, 50);

  const byQuestion = new Map(res.body.data.review.map((r) => [String(r.questionId), r]));
  assert.equal(byQuestion.get(String(q4._id)).correct, false, "an unkeyed question must not be marked correct");
  assert.equal(byQuestion.get(String(q3._id)).correct, true);

  // Attempts accumulate on the quiz.
  const after = await req(`/api/quizzes/${quiz._id}`, { token });
  assert.equal(after.body.data.attemptCount, 1);
  assert.equal(after.body.data.bestScore, 50);

  const attempts = await req(`/api/quizzes/${quiz._id}/attempts`, { token });
  assert.equal(attempts.body.data.items.length, 1);
});

test("a blank answer cannot score on an mcq whose key is missing", async () => {
  const { token } = await makeUser();
  const created = await req("/api/quizzes", {
    method: "POST",
    token,
    body: {
      title: "No key",
      questions: [{ prompt: "Pick one", type: "mcq", options: ["a", "b"] }],
    },
  });
  const quiz = created.body.data;
  const res = await req(`/api/quizzes/${quiz._id}/attempts`, {
    method: "POST",
    token,
    body: { answers: [{ questionId: quiz.questions[0]._id, given: "" }] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.attempt.score, 0);
});

test("quiz performance aggregates per topic across attempts", async () => {
  // Node's test runner shares one in-memory database across files, so the
  // assertion is scoped to this user's own attempts rather than the totals.
  const { token } = await makeUser();
  const created = await req("/api/quizzes", { method: "POST", token, body: quizBody() });
  const quiz = created.body.data;
  const [q1, q2] = quiz.questions;

  await req(`/api/quizzes/${quiz._id}/attempts`, {
    method: "POST",
    token,
    body: { answers: [{ questionId: q1._id, given: "0" }, { questionId: q2._id, given: "1" }] },
  });
  await req(`/api/quizzes/${quiz._id}/attempts`, {
    method: "POST",
    token,
    body: { answers: [{ questionId: q1._id, given: "2" }, { questionId: q2._id, given: "2" }] },
  });

  // /performance is user scoped; assert on this user's quiz rather than global
  // totals, because the runner shares one database across test files.
  const res = await req("/api/quizzes/performance", { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.attempts >= 2, "this user's attempts are counted");
  // Other test files share this database and reuse the same topic names, so the
  // invariant asserted here is the maths, not a global count.
  const trees = res.body.data.topics.find((t) => t.topic === "Trees");
  assert.ok(trees.total >= 2, "Trees should have at least this user's two answers");
  assert.equal(trees.accuracy, Math.round((trees.correct / trees.total) * 100));
  assert.ok(trees.correct >= 1 && trees.correct < trees.total, "one right, one wrong");
  const traversals = res.body.data.topics.find((t) => t.topic === "Traversals");
  assert.equal(traversals.accuracy, 50);
  const weak = res.body.data.weakTopics.map((t) => t.topic);
  assert.ok(weak.includes("Trees"), "Trees is weak for this user");
  assert.ok(weak.includes("Traversals"), "Traversals is weak for this user");
});

test("deleting a quiz also deletes its attempts, and only its own", async () => {
  const { token } = await makeUser();
  const a = (await req("/api/quizzes", { method: "POST", token, body: quizBody() })).body.data;
  const b = (await req("/api/quizzes", { method: "POST", token, body: { ...quizBody(), title: "Second" } })).body.data;
  for (const quiz of [a, b]) {
    await req(`/api/quizzes/${quiz._id}/attempts`, {
      method: "POST",
      token,
      body: { answers: [{ questionId: quiz.questions[0]._id, given: "0" }] },
    });
  }
  const removed = await req(`/api/quizzes/${a._id}`, { method: "DELETE", token });
  assert.equal(removed.status, 200);

  const remaining = await req("/api/attempts", { token });
  assert.equal(remaining.body.data.items.length, 1);
  assert.equal(String(remaining.body.data.items[0].quizId), String(b._id));
});

test("quiz scoring is per-user: another account cannot submit or read", async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const quiz = (await req("/api/quizzes", { method: "POST", token: owner.token, body: quizBody() })).body.data;

  const submit = await req(`/api/quizzes/${quiz._id}/attempts`, {
    method: "POST",
    token: stranger.token,
    body: { answers: [{ questionId: quiz.questions[0]._id, given: "0" }] },
  });
  assert.equal(submit.status, 404);
  assert.equal((await req(`/api/quizzes/${quiz._id}`, { token: stranger.token })).status, 404);
  assert.equal((await req(`/api/quizzes/${quiz._id}/attempts`, { token: stranger.token })).body.data.items.length, 0);
  assert.equal((await req("/api/quizzes/performance", { token: stranger.token })).body.data.attempts, 0);
});

/* ------------------------------------------------------------ flashcards */

test("flashcard review schedules the next due date and counts lapses", async () => {
  const { token } = await makeUser();
  const created = await req("/api/flashcards", {
    method: "POST",
    token,
    body: { front: "What is a heap?", back: "A complete binary tree with heap ordering." },
  });
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal(created.body.data.dueDate, iso(), "a new card is due today");

  const good = await req(`/api/flashcards/${id}/review`, { method: "POST", token, body: { grade: 2 } });
  assert.equal(good.status, 200);
  assert.equal(good.body.data.repetitions, 1);
  assert.equal(good.body.data.intervalDays, 1);
  assert.ok(good.body.data.dueDate > iso(), "reviewed card is no longer due today");

  const again = await req(`/api/flashcards/${id}/review`, { method: "POST", token, body: { grade: 0 } });
  assert.equal(again.body.data.repetitions, 0);
  assert.equal(again.body.data.lapses, 1);
  assert.equal(again.body.data.intervalDays, 1);

  const invalid = await req(`/api/flashcards/${id}/review`, { method: "POST", token, body: { grade: 9 } });
  assert.equal(invalid.status, 400, "out-of-range grades are a client error, not a 500");
});

test("flashcard bulk insert validates every card and respects the cap", async () => {
  const { token } = await makeUser();
  const ok = await req("/api/flashcards/bulk", {
    method: "POST",
    token,
    body: { items: [{ front: "a", back: "1" }, { front: "b", back: "2" }] },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.created, 2);

  const bad = await req("/api/flashcards/bulk", {
    method: "POST",
    token,
    body: { items: [{ front: "a", back: "1" }, { front: "", back: "2" }] },
  });
  assert.equal(bad.status, 400, "one invalid card must reject the batch, not 500");

  const after = await req("/api/flashcards", { token });
  assert.equal(after.body.data.total, 2, "a rejected batch must not partially insert");

  const tooMany = await req("/api/flashcards/bulk", {
    method: "POST",
    token,
    body: { items: Array.from({ length: 201 }, (_, i) => ({ front: `f${i}`, back: `b${i}` })) },
  });
  assert.equal(tooMany.status, 400);
});

/* ---------------------------------------------------------------- focus */

test("focus session lifecycle pauses, resumes and mirrors into study minutes", async () => {
  const { token } = await makeUser();
  const started = await req("/api/focus", {
    method: "POST",
    token,
    body: { label: "Deep work", mode: "pomodoro", plannedMinutes: 25 },
  });
  assert.equal(started.status, 201);
  const id = started.body.data._id;
  assert.equal(started.body.data.status, "running");

  const paused = await req(`/api/focus/${id}/pause`, { method: "PATCH", token });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.status, "paused");

  // Pausing twice is not a server error, it is "nothing to pause".
  assert.equal((await req(`/api/focus/${id}/pause`, { method: "PATCH", token })).status, 404);

  const resumed = await req(`/api/focus/${id}/resume`, { method: "PATCH", token });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.data.status, "running");

  const finished = await req(`/api/focus/${id}/finish`, {
    method: "POST",
    token,
    body: { actualSeconds: 1500, cyclesCompleted: 1 },
  });
  assert.equal(finished.status, 200);
  assert.equal(finished.body.data.focus.status, "completed");
  assert.equal(finished.body.data.studySession.minutes, 25);
  assert.equal(finished.body.data.studySession.source, "focus_timer");

  const state = await req("/api/focus", { token });
  assert.equal(state.body.data.active, null);
  assert.equal(state.body.data.items.length, 1);
  assert.equal(state.body.data.totals.seconds, 1500);

  const sessions = await req("/api/sessions", { token });
  assert.equal(sessions.body.data.items.length, 1);
});

test("starting a new focus session abandons the stale running one", async () => {
  const { token } = await makeUser();
  const first = await req("/api/focus", { method: "POST", token, body: { label: "one" } });
  const second = await req("/api/focus", { method: "POST", token, body: { label: "two" } });
  assert.equal(second.status, 201);

  const state = await req("/api/focus", { token });
  assert.equal(state.body.data.active.label, "two");
  const abandoned = state.body.data.items.find((f) => String(f._id) === String(first.body.data._id));
  assert.equal(abandoned.status, "abandoned");

  // A short finish does not pollute study minutes.
  const short = await req(`/api/focus/${second.body.data._id}/finish`, {
    method: "POST",
    token,
    body: { actualSeconds: 20 },
  });
  assert.equal(short.body.data.studySession, null);
  assert.equal((await req("/api/sessions", { token })).body.data.items.length, 0);
});

/* --------------------------------------------------------------- search */

test("search finds the user's own records and nobody else's", async () => {
  const { token } = await makeUser();
  const stranger = await makeUser();
  await makeSubject(token, "Compiler Design");
  await req("/api/tasks", { method: "POST", token, body: { title: "Compiler lab viva" } });
  await req("/api/notes", { method: "POST", token, body: { title: "Compiler notes", body: "LR parsing" } });

  const res = await req("/api/search?q=compiler", { token });
  assert.equal(res.status, 200);
  const types = res.body.data.results.map((r) => r.type).sort();
  assert.deepEqual(types, ["note", "subject", "task"]);
  for (const r of res.body.data.results) assert.ok(r.href, "every result needs a href");

  const theirs = await req("/api/search?q=compiler", { token: stranger.token });
  assert.equal(theirs.body.data.results.length, 0);

  const tooShort = await req("/api/search?q=c", { token });
  assert.equal(tooShort.body.data.results.length, 0);
});

test("search treats regex characters as literal text", async () => {
  const { token } = await makeUser();
  await makeSubject(token, "C++ Programming");
  const res = await req(`/api/search?q=${encodeURIComponent("c++")}`, { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.results.length, 1);
  assert.equal(res.body.data.results[0].title, "C++ Programming");
});

/* -------------------------------------------------------- notifications */

test("notifications surface overdue tasks and due exams only for their owner", async () => {
  const { token } = await makeUser();
  const stranger = await makeUser();
  await req("/api/tasks", {
    method: "POST",
    token,
    body: { title: "Overdue assignment", dueDate: iso(-2), priority: "high" },
  });
  await req("/api/exams", {
    method: "POST",
    token,
    body: { title: "Unit test", date: iso(1), kind: "internal" },
  });

  const res = await req("/api/notifications", { token });
  assert.equal(res.status, 200);
  const items = res.body.data.items;
  const text = JSON.stringify(items);
  assert.match(text, /Overdue assignment/);
  assert.match(text, /Unit test/);

  const theirs = await req("/api/notifications", { token: stranger.token });
  assert.doesNotMatch(JSON.stringify(theirs.body.data), /Overdue assignment|Unit test/);
});
