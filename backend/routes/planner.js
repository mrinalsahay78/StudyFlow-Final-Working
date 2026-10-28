"use strict";
/**
 * Smart study planner.
 *
 * Generates a day-by-day study schedule from the student's real data:
 *   - open topics (syllabus not finished), prioritised by priority, difficulty,
 *     whether they are flagged important, and how close the subject's exam is
 *   - overdue / upcoming tasks and assignments
 *   - the student's available hours per weekday and preferred session length
 *
 * Rules are explicit and configurable; nothing is random and nothing is faked.
 */
const express = require("express");
const mongoose = require("mongoose");
const { PlannerEntry, Topic, Subject, Task, Exam, StudySession } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { plannerCreate, plannerUpdate, plannerGenerate } = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");
const { dayKey, addDays } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const DIFFICULTY_WEIGHT = { hard: 3, medium: 2, easy: 1 };

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = String(req.query.from);
      if (req.query.to) filter.date.$lte = String(req.query.to);
    }
    const items = await PlannerEntry.find(filter).sort({ date: 1, start: 1 }).limit(600).lean();
    ok(res, { items, total: items.length });
  }),
);

/** Availability + conflict report for a date range. */
router.get(
  "/insights",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from || dayKey());
    const to = String(req.query.to || dayKey(addDays(new Date(), 6)));
    const entries = await PlannerEntry.find({
      userId: req.user._id,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1, start: 1 })
      .lean();
    const conflicts = [];
    const byDate = new Map();
    entries.forEach((e) => {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    });
    byDate.forEach((list, date) => {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          if (overlaps(toMinutes(list[i].start), toMinutes(list[i].end), toMinutes(list[j].start), toMinutes(list[j].end))) {
            conflicts.push({
              date,
              a: { id: list[i]._id, title: list[i].title, start: list[i].start, end: list[i].end },
              b: { id: list[j]._id, title: list[j].title, start: list[j].start, end: list[j].end },
            });
          }
        }
      }
    });
    const now = new Date();
    const today = dayKey(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const missed = entries
      .filter(
        (e) =>
          !e.completed &&
          (e.date < today ||
            (e.date === today && toMinutes(e.end) < nowMinutes)),
      )
      .map((e) => ({ id: e._id, title: e.title, date: e.date, start: e.start, end: e.end }));

    const days = [];
    let cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (cursor <= end) {
      const key = dayKey(cursor);
      const list = byDate.get(key) || [];
      days.push({
        date: key,
        plannedMinutes: list.reduce((a, e) => a + (e.minutes || 0), 0),
        completedMinutes: list.filter((e) => e.completed).reduce((a, e) => a + (e.minutes || 0), 0),
        sessions: list.length,
      });
      cursor = addDays(cursor, 1);
    }
    ok(res, { conflicts, missed, days, from, to });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = plannerCreate.parse(req.body);
    if (toMinutes(body.end) <= toMinutes(body.start)) {
      return fail(res, 400, "End time must be after start time", "BAD_TIME");
    }
    const clash = await PlannerEntry.findOne({
      userId: req.user._id,
      date: body.date,
      start: { $lt: body.end },
      end: { $gt: body.start },
    }).lean();
    if (clash && !(req.body && req.body.allowOverlap)) {
      return fail(
        res,
        409,
        `This overlaps "${clash.title}" (${clash.start}–${clash.end}).`,
        "CONFLICT",
      );
    }
    const minutes = toMinutes(body.end) - toMinutes(body.start);
    const doc = await PlannerEntry.create({
      ...body,
      minutes,
      ...completion(body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid id", "BAD_ID");
    const body = plannerUpdate.parse(req.body);
    const existing = await PlannerEntry.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();
    if (!existing) return fail(res, 404, "Entry not found", "NOT_FOUND");
    const date = body.date || existing.date;
    const start = body.start || existing.start;
    const end = body.end || existing.end;
    if (toMinutes(end) <= toMinutes(start)) {
      return fail(res, 400, "End time must be after start time", "BAD_TIME");
    }
    const clash = await PlannerEntry.findOne({
      userId: req.user._id,
      date,
      _id: { $ne: existing._id },
      start: { $lt: end },
      end: { $gt: start },
    }).lean();
    if (clash && !(req.body && req.body.allowOverlap)) {
      return fail(res, 409, `This overlaps "${clash.title}" (${clash.start}–${clash.end}).`, "CONFLICT");
    }
    const doc = await PlannerEntry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      {
        ...body,
        date,
        start,
        end,
        minutes: toMinutes(end) - toMinutes(start),
        ...completion(body.completed),
      },
      { new: true, runValidators: true },
    );
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid id", "BAD_ID");
    const doc = await PlannerEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Entry not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/** Push a missed session to the next free slot without touching deadlines. */
router.post(
  "/:id/reschedule",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid id", "BAD_ID");
    const entry = await PlannerEntry.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!entry) return fail(res, 404, "Entry not found", "NOT_FOUND");
    const duration = toMinutes(entry.end) - toMinutes(entry.start);
    let cursor = new Date(`${entry.date}T00:00:00`);
    let placed = null;
    for (let attempt = 0; attempt < 14 && !placed; attempt += 1) {
      cursor = addDays(cursor, 1);
      const key = dayKey(cursor);
      const existing = await PlannerEntry.find({
        userId: req.user._id,
        date: key,
      })
        .sort({ start: 1 })
        .lean();
      let startMinutes = toMinutes(req.user.prefs?.dayStart || "09:00");
      const dayEnd = toMinutes(req.user.prefs?.dayEnd || "22:00");
      for (const item of existing) {
        if (startMinutes + duration <= toMinutes(item.start)) break;
        startMinutes = Math.max(startMinutes, toMinutes(item.end));
      }
      if (startMinutes + duration <= dayEnd) {
        placed = { date: key, start: toHHMM(startMinutes), end: toHHMM(startMinutes + duration) };
      }
    }
    if (!placed) {
      return fail(res, 409, "No free slot found in the next two weeks.", "NO_SLOT");
    }
    entry.date = placed.date;
    entry.start = placed.start;
    entry.end = placed.end;
    entry.missed = false;
    entry.completed = false;
    entry.completedAt = null;
    await entry.save();
    ok(res, entry.toObject());
  }),
);

/**
 * Generate a schedule.
 *
 * Algorithm (deterministic, rule based):
 *  1. Build a candidate pool: unfinished topics + open tasks (assignments,
 *     practicals, exam prep) with a computed score.
 *  2. For each day: if it is a configured study day, take the free window
 *     between dayStart and dayEnd minus existing planner entries and split it
 *     into sessions of `sessionMinutes` with a 5 minute gap.
 *  3. Fill slots in score order, one session per candidate, splitting topics
 *     that need more time across multiple days.
 *  4. Exam days are blocked out; anything that does not fit is reported.
 */
router.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const body = plannerGenerate.parse(req.body || {});
    const startDate = body.startDate || dayKey();
    const days = body.days || 7;
    const dailyMinutes = body.dailyMinutes || req.user.prefs?.dailyGoalMinutes || 120;
    const sessionMinutes = body.sessionMinutes || 45;
    const gap = 5;
    const studyDays = req.user.prefs?.studyDays || [1, 2, 3, 4, 5, 6];
    const dayStart = body.dayStart || req.user.prefs?.dayStart || "09:00";

    const [topics, subjects, tasks, exams] = await Promise.all([
      Topic.find({ userId: req.user._id, completed: false }).lean(),
      Subject.find({ userId: req.user._id }).lean(),
      Task.find({ userId: req.user._id, status: { $ne: "done" } }).lean(),
      Exam.find({ userId: req.user._id, status: "upcoming" }).lean(),
    ]);

    const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
    const examBySubject = new Map();
    exams.forEach((e) => {
      if (!e.subjectId) return;
      const key = String(e.subjectId);
      const prev = examBySubject.get(key);
      if (!prev || e.date < prev.date) examBySubject.set(key, e);
    });

    const today = new Date(`${startDate}T00:00:00`);
    const daysAhead = (dateStr) =>
      Math.round((new Date(`${dateStr}T00:00:00`) - today) / 86400000);

    const candidates = [];
    topics.forEach((t) => {
      const subject = subjectById.get(String(t.subjectId));
      const exam = examBySubject.get(String(t.subjectId));
      const urgency = exam ? Math.max(0, 14 - daysAhead(exam.date)) : 0;
      candidates.push({
        kind: "study",
        title: `${subject ? subject.name : "Study"} — ${t.title}`,
        subjectId: t.subjectId,
        topicId: t._id,
        remaining: Math.max(20, t.estimatedMinutes || 45),
        score:
          (PRIORITY_WEIGHT[t.priority] || 2) * 3 +
          (DIFFICULTY_WEIGHT[t.difficulty] || 2) * 2 +
          (t.isImportant ? 6 : 0) +
          urgency * 1.5 +
          (t.status === "in_progress" ? 4 : 0),
      });
    });
    tasks.forEach((t) => {
      const overdue = t.dueDate && t.dueDate < dayKey();
      const dueSoon = t.dueDate && daysAhead(t.dueDate) <= 3;
      candidates.push({
        kind: t.type === "assignment" ? "assignment" : t.type === "practical" ? "practical" : "study",
        title: t.title,
        subjectId: t.subjectId,
        taskId: t._id,
        remaining: Math.max(20, t.estimatedMinutes || 45),
        score:
          (PRIORITY_WEIGHT[t.priority] || 2) * 3 +
          (overdue ? 12 : 0) +
          (dueSoon ? 7 : 0) +
          (t.type === "assignment" ? 3 : 0),
      });
    });
    candidates.sort((a, b) => b.score - a.score);

    if (!candidates.length) {
      return ok(res, {
        created: 0,
        message:
          "Nothing to schedule yet. Add subjects with syllabus topics, or tasks with due dates, then generate again.",
        entries: [],
      });
    }

    if (body.replaceGenerated) {
      await PlannerEntry.deleteMany({
        userId: req.user._id,
        generated: true,
        date: { $gte: startDate },
        completed: false,
      });
    }

    const created = [];
    let cursorIndex = 0;
    for (let d = 0; d < days; d += 1) {
      const date = dayKey(addDays(today, d));
      const weekday = addDays(today, d).getDay();
      const examToday = exams.some((e) => e.date === date);
      if (!studyDays.includes(weekday) || examToday) continue;

      const existing = await PlannerEntry.find({ userId: req.user._id, date }).lean();
      const busy = existing.map((e) => [toMinutes(e.start), toMinutes(e.end)]);
      const dayEnd = toMinutes(req.user.prefs?.dayEnd || "22:00");
      let windowStart = toMinutes(dayStart);
      let usedToday = 0;
      while (usedToday + sessionMinutes <= dailyMinutes) {
        let slotStart = windowStart;
        let blocked = busy.find(([s, e]) => overlaps(slotStart, slotStart + sessionMinutes, s, e));
        while (blocked && slotStart + sessionMinutes < dayEnd) {
          slotStart = blocked[1] + gap;
          blocked = busy.find(([s, e]) => overlaps(slotStart, slotStart + sessionMinutes, s, e));
        }
        if (slotStart + sessionMinutes > dayEnd) break;
        const candidate = candidates[cursorIndex % candidates.length];
        cursorIndex += 1;
        if (!candidate || candidate.remaining <= 0) continue;
        // Never round a session down to zero minutes: every other write path
        // enforces "end must be after start", and a 0-minute entry breaks it.
        const length = Math.max(5, Math.min(sessionMinutes, Math.ceil(candidate.remaining)));
        const doc = await PlannerEntry.create({
          userId: req.user._id,
          title: candidate.title,
          date,
          start: toHHMM(slotStart),
          end: toHHMM(slotStart + length),
          minutes: length,
          subjectId: candidate.subjectId || null,
          topicId: candidate.topicId || null,
          taskId: candidate.taskId || null,
          kind: candidate.kind,
          generated: true,
        });
        created.push(doc.toObject());
        candidate.remaining -= length;
        busy.push([slotStart, slotStart + length]);
        windowStart = slotStart + length + gap;
        usedToday += length;
      }
    }

    ok(res, {
      created: created.length,
      days: new Set(created.map((c) => c.date)).size,
      minutes: created.reduce((a, c) => a + c.minutes, 0),
      entries: created,
      message: created.length
        ? `Scheduled ${created.length} sessions across ${new Set(created.map((c) => c.date)).size} days.`
        : "No free slots were found in the selected range. Widen your study hours or reduce existing entries.",
    });
  }),
);

/** Planned vs completed study time for the planner range. */
router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from || dayKey(addDays(new Date(), -6)));
    const to = String(req.query.to || dayKey());
    const [entries, sessions] = await Promise.all([
      PlannerEntry.find({ userId: req.user._id, date: { $gte: from, $lte: to } }).lean(),
      StudySession.find({ userId: req.user._id, date: { $gte: from, $lte: to } }).lean(),
    ]);
    ok(res, {
      plannedMinutes: entries.reduce((a, e) => a + (e.minutes || 0), 0),
      completedPlannedMinutes: entries
        .filter((e) => e.completed)
        .reduce((a, e) => a + (e.minutes || 0), 0),
      actualMinutes: sessions.reduce((a, s) => a + (s.minutes || 0), 0),
      sessions: entries.length,
      from,
      to,
    });
  }),
);

module.exports = router;
