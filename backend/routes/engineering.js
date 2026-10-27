"use strict";
const express = require("express");
const mongoose = require("mongoose");
const {
  Project,
  CodingLog,
  JournalEntry,
  Subject,
  Exam,
  Task,
  Goal,
  Unit,
  Topic,
} = require("../models");
const { requireAuth } = require("../middleware/auth");
const {
  projectCreate,
  projectUpdate,
  codingLogCreate,
  codingLogUpdate,
  journalCreate,
  journalUpdate,
  goalCreate,
  goalUpdate,
} = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");
const { dayKey, addDays } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/* --------------------------------------------------------------- projects */

router.get(
  "/projects",
  asyncHandler(async (req, res) => {
    const items = await Project.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/projects",
  asyncHandler(async (req, res) => {
    const body = projectCreate.parse(req.body);
    const doc = await Project.create({ ...body, userId: req.user._id });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = projectUpdate.parse(req.body);
    const doc = await Project.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Project not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Project.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Project not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ------------------------------------------------------------ coding log */

router.get(
  "/coding",
  asyncHandler(async (req, res) => {
    const items = await CodingLog.find({ userId: req.user._id })
      .sort({ solvedAt: -1 })
      .limit(500)
      .lean();
    const byDifficulty = { easy: 0, medium: 0, hard: 0 };
    const byTopic = {};
    items.forEach((i) => {
      if (i.solved) byDifficulty[i.difficulty] = (byDifficulty[i.difficulty] || 0) + 1;
      if (i.topic) byTopic[i.topic] = (byTopic[i.topic] || 0) + 1;
    });
    const since = dayKey(addDays(new Date(), -29));
    const last30 = items.filter((i) => i.solved && dayKey(new Date(i.solvedAt)) >= since).length;
    ok(res, {
      items,
      total: items.length,
      stats: {
        solved: items.filter((i) => i.solved).length,
        byDifficulty,
        byTopic,
        last30,
      },
    });
  }),
);

router.post(
  "/coding",
  asyncHandler(async (req, res) => {
    const body = codingLogCreate.parse(req.body);
    const doc = await CodingLog.create({ ...body, userId: req.user._id });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/coding/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = codingLogUpdate.parse(req.body);
    const doc = await CodingLog.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Entry not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/coding/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await CodingLog.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Entry not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ---------------------------------------------------------- lab journal */

router.get(
  "/journal",
  asyncHandler(async (req, res) => {
    const items = await JournalEntry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    ok(res, {
      items,
      total: items.length,
      summary: {
        pending: items.filter((i) => i.status === "pending").length,
        written: items.filter((i) => i.status === "written").length,
        checked: items.filter((i) => i.status === "checked").length,
      },
    });
  }),
);

router.post(
  "/journal",
  asyncHandler(async (req, res) => {
    const body = journalCreate.parse(req.body);
    const doc = await JournalEntry.create({ ...body, userId: req.user._id });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/journal/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = journalUpdate.parse(req.body);
    const doc = await JournalEntry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Journal entry not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/journal/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await JournalEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Journal entry not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ------------------------------------------------------------ dashboard */

/** Semester / credit overview computed from the student's own configuration. */
router.get(
  "/semester",
  asyncHandler(async (req, res) => {
    const [subjects, units, topics, exams, tasks] = await Promise.all([
      Subject.find({ userId: req.user._id }).lean(),
      Unit.find({ userId: req.user._id }).select("subjectId").lean(),
      Topic.find({ userId: req.user._id })
        .select("subjectId completed estimatedMinutes")
        .lean(),
      Exam.find({ userId: req.user._id }).lean(),
      Task.find({ userId: req.user._id }).lean(),
    ]);
    const credits = subjects.reduce((a, s) => a + (s.credits || 0), 0);
    const bySemester = {};
    subjects.forEach((s) => {
      const key = s.semester || req.user.semester || 1;
      if (!bySemester[key]) bySemester[key] = { semester: key, subjects: 0, credits: 0 };
      bySemester[key].subjects += 1;
      bySemester[key].credits += s.credits || 0;
    });
    const completedExams = exams.filter((e) => e.status === "completed");
    const graded = completedExams.filter(
      (e) => e.maxMarks && e.scoredMarks !== null && e.scoredMarks !== undefined,
    );
    const percentage = graded.length
      ? Math.round(
          (graded.reduce((a, e) => a + e.scoredMarks / e.maxMarks, 0) / graded.length) * 100,
        )
      : null;
    ok(res, {
      credits,
      semester: req.user.semester,
      bySemester: Object.values(bySemester).sort((a, b) => a.semester - b.semester),
      subjectCount: subjects.length,
      unitCount: units.length,
      topicCount: topics.length,
      topicsCompleted: topics.filter((t) => t.completed).length,
      examCount: exams.length,
      examsCompleted: completedExams.length,
      gradedExams: graded.length,
      averagePercentage: percentage,
      taskCount: tasks.length,
      tasksDone: tasks.filter((t) => t.status === "done").length,
    });
  }),
);

module.exports = router;
