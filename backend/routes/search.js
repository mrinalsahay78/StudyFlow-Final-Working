"use strict";
const express = require("express");
const mongoose = require("mongoose");
const { Subject, Task, Exam, Note } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, ok, fail } = require("../utils/http");
const { escapeRegex } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

/** Cross-entity search: subjects, topics, tasks, exams, notes, files. */
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return ok(res, { query: q, results: [] });
    const rx = new RegExp(escapeRegex(q.slice(0, 80)), "i");
    const uid = req.user._id;
    const { Topic, File } = require("../models");

    const [subjects, topics, tasks, exams, notes, files] = await Promise.all([
      Subject.find({ userId: uid, $or: [{ name: rx }, { code: rx }] })
        .limit(6)
        .lean(),
      Topic.find({ userId: uid, $or: [{ title: rx }, { notes: rx }] })
        .limit(8)
        .lean(),
      Task.find({ userId: uid, $or: [{ title: rx }, { description: rx }, { tags: rx }] })
        .limit(8)
        .lean(),
      Exam.find({ userId: uid, $or: [{ title: rx }, { location: rx }] })
        .limit(5)
        .lean(),
      Note.find({ userId: uid, $or: [{ title: rx }, { body: rx }, { tags: rx }] })
        .select("title updatedAt subjectId")
        .limit(6)
        .lean(),
      File.find({ userId: uid, originalName: rx })
        .select("originalName size mimeType createdAt")
        .limit(5)
        .lean(),
    ]);

    const results = [
      ...subjects.map((s) => ({
        type: "subject",
        id: s._id,
        title: s.name,
        subtitle: s.code || "Subject",
        href: `#subjects?id=${s._id}`,
      })),
      ...topics.map((t) => ({
        type: "topic",
        id: t._id,
        title: t.title,
        subtitle: `Topic · ${t.status.replace("_", " ")}`,
        href: `#subjects?id=${t.subjectId}`,
      })),
      ...tasks.map((t) => ({
        type: "task",
        id: t._id,
        title: t.title,
        subtitle: `${t.type} · ${t.status.replace("_", " ")}${t.dueDate ? ` · due ${t.dueDate}` : ""}`,
        href: "#tasks",
      })),
      ...exams.map((e) => ({
        type: "exam",
        id: e._id,
        title: e.title,
        subtitle: `Exam · ${e.date}`,
        href: "#exams",
      })),
      ...notes.map((n) => ({
        type: "note",
        id: n._id,
        title: n.title,
        subtitle: "Note",
        href: `#notes?id=${n._id}`,
      })),
      ...files.map((f) => ({
        type: "file",
        id: f._id,
        title: f.originalName,
        subtitle: `File · ${Math.round(f.size / 1024)} KB`,
        href: "#library",
      })),
    ];
    ok(res, { query: q, results });
  }),
);

/** Notifications: derived from real deadlines, due cards and unlocked badges. */
router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const uid = req.user._id;
    const { Flashcard, Achievement, PlannerEntry } = require("../models");
    const { dayKey, addDays } = require("../utils/date");
    const today = dayKey();
    const in3 = dayKey(addDays(new Date(), 3));

    const [overdueTasks, dueSoonExams, dueCards, newBadges, todayPlan] = await Promise.all([
      Task.find({ userId: uid, status: { $ne: "done" }, dueDate: { $ne: "", $lt: today } })
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
      // Any upcoming exam inside the window, whatever its kind (internal,
      // practical, viva, end semester, mock) and even if it has no subject.
      Exam.find({ userId: uid, status: "upcoming", date: { $gte: today, $lte: in3 } })
        .sort({ date: 1 })
        .limit(5)
        .lean(),
      Flashcard.countDocuments({ userId: uid, $or: [{ dueDate: "" }, { dueDate: { $lte: today } }] }),
      Achievement.find({ userId: uid })
        .sort({ unlockedAt: -1 })
        .limit(3)
        .lean(),
      PlannerEntry.find({ userId: uid, date: today, completed: false }).sort({ start: 1 }).lean(),
    ]);

    const items = [
      ...overdueTasks.map((t) => ({
        id: `task-${t._id}`,
        kind: "overdue",
        title: "Overdue",
        body: `${t.title} was due ${t.dueDate}`,
        href: "#tasks",
        at: t.dueDate,
      })),
      ...dueSoonExams.map((e) => ({
        id: `exam-${e._id}`,
        kind: "exam",
        title: "Exam soon",
        body: `${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ""}`,
        href: "#exams",
        at: e.date,
      })),
      ...(dueCards
        ? [
            {
              id: "cards-due",
              kind: "revision",
              title: "Revision due",
              body: `${dueCards} flashcard${dueCards === 1 ? "" : "s"} waiting for review`,
              href: "#flashcards",
              at: today,
            },
          ]
        : []),
      ...todayPlan.slice(0, 3).map((p) => ({
        id: `plan-${p._id}`,
        kind: "plan",
        title: "Today",
        body: `${p.start}–${p.end} ${p.title}`,
        href: "#planner",
        at: today,
      })),
      ...newBadges.map((b) => ({
        id: `badge-${b._id}`,
        kind: "achievement",
        title: "Achievement unlocked",
        body: `${b.icon} ${b.title}`,
        href: "#achievements",
        at: b.unlockedAt,
      })),
    ];
    ok(res, { items, count: items.length });
  }),
);

module.exports = router;
