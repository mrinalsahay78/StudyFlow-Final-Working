"use strict";
const express = require("express");
const { Task, StudySession, FocusSession } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { sessionCreate, sessionUpdate, focusCreate, focusFinish } = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");
const { dayKey } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

/* ------------------------------------------------------ study sessions */

router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.from) filter.date = { $gte: String(req.query.from) };
    if (req.query.to) filter.date = { ...(filter.date || {}), $lte: String(req.query.to) };
    const items = await StudySession.find(filter).sort({ date: -1, createdAt: -1 }).limit(500).lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const body = sessionCreate.parse(req.body);
    const doc = await StudySession.create({
      ...body,
      ...completion(body.completed),
      source: body.source || "manual",
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const body = sessionUpdate.parse(req.body);
    const doc = await StudySession.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...body, ...completion(body.completed) },
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Session not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const doc = await StudySession.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Session not found", "NOT_FOUND");
    ok(res, { deleted: true, id: req.params.id });
  }),
);

/* -------------------------------------------------------- focus sessions */

router.get(
  "/focus",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.from) filter.date = { $gte: String(req.query.from) };
    const [items, active] = await Promise.all([
      FocusSession.find({ ...filter, status: { $in: ["completed", "abandoned"] } })
        .sort({ startedAt: -1 })
        .limit(200)
        .lean(),
      FocusSession.findOne({ userId: req.user._id, status: { $in: ["running", "paused"] } })
        .sort({ startedAt: -1 })
        .lean(),
    ]);
    const totals = await FocusSession.aggregate([
      { $match: { userId: req.user._id, status: "completed" } },
      { $group: { _id: null, seconds: { $sum: "$actualSeconds" }, count: { $sum: 1 } } },
    ]);
    ok(res, {
      items,
      active: active || null,
      totals: {
        seconds: totals[0] ? totals[0].seconds : 0,
        count: totals[0] ? totals[0].count : 0,
      },
    });
  }),
);

router.post(
  "/focus",
  asyncHandler(async (req, res) => {
    const body = focusCreate.parse(req.body);
    // Only one live focus session at a time: abandon any stale one first.
    await FocusSession.updateMany(
      { userId: req.user._id, status: { $in: ["running", "paused"] } },
      { $set: { status: "abandoned", endedAt: new Date() } },
    );
    const doc = await FocusSession.create({
      ...body,
      date: body.date || dayKey(),
      startedAt: new Date(),
      status: "running",
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.patch(
  "/focus/:id/pause",
  asyncHandler(async (req, res) => {
    const doc = await FocusSession.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: "running" },
      { $set: { status: "paused" } },
      { new: true },
    );
    if (!doc) return fail(res, 404, "No running focus session", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.patch(
  "/focus/:id/resume",
  asyncHandler(async (req, res) => {
    const doc = await FocusSession.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: "paused" },
      { $set: { status: "running" } },
      { new: true },
    );
    if (!doc) return fail(res, 404, "No paused focus session", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

/**
 * Finish a focus session. The completed session is stored in FocusSession and
 * mirrored into StudySession so every analytics view reads one source of truth
 * for study minutes.
 */
router.post(
  "/focus/:id/finish",
  asyncHandler(async (req, res) => {
    const body = focusFinish.parse(req.body);
    const doc = await FocusSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Focus session not found", "NOT_FOUND");
    doc.actualSeconds = body.actualSeconds;
    doc.cyclesCompleted = body.cyclesCompleted || 0;
    doc.interruptions = body.interruptions || 0;
    doc.status = body.status || "completed";
    doc.endedAt = new Date();
    await doc.save();

    const minutes = Math.round(body.actualSeconds / 60);
    let studySession = null;
    if (minutes >= 1 && doc.status === "completed") {
      studySession = await StudySession.create({
        userId: req.user._id,
        subjectId: doc.subjectId || null,
        taskId: doc.taskId || null,
        date: doc.date,
        minutes,
        topic: doc.label,
        mode: doc.mode,
        source: "focus_timer",
        startedAt: doc.startedAt,
        endedAt: doc.endedAt,
        completed: true,
        completedAt: new Date(),
      });
      if (doc.taskId) {
        await Task.updateOne(
          { _id: doc.taskId, userId: req.user._id, status: { $ne: "done" } },
          { $set: { status: "in_progress" } },
        );
      }
    }
    ok(res, { focus: doc.toObject(), studySession });
  }),
);

router.delete(
  "/focus/:id",
  asyncHandler(async (req, res) => {
    const doc = await FocusSession.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Focus session not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

module.exports = router;
