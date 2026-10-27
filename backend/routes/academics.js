"use strict";
const express = require("express");
const mongoose = require("mongoose");
const { Timetable, Exam, Goal } = require("../models");
const { requireAuth } = require("../middleware/auth");
const {
  timetableCreate,
  timetableUpdate,
  examCreate,
  examUpdate,
  goalCreate,
  goalUpdate,
} = require("../validation/schemas");
const { asyncHandler, ok, fail, completion, crudRouter } = require("../utils/http");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
};

/* ------------------------------------------------------------- timetable */

router.get(
  "/timetable",
  asyncHandler(async (req, res) => {
    const items = await Timetable.find({ userId: req.user._id })
      .sort({ day: 1, start: 1 })
      .lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/timetable",
  asyncHandler(async (req, res) => {
    const body = timetableCreate.parse(req.body);
    if (toMinutes(body.end) <= toMinutes(body.start)) {
      return fail(res, 400, "End time must be after start time", "BAD_TIME");
    }
    const clash = await Timetable.findOne({
      userId: req.user._id,
      day: body.day,
      start: { $lt: body.end },
      end: { $gt: body.start },
    }).lean();
    if (clash) {
      return fail(
        res,
        409,
        `This clashes with "${clash.title}" (${clash.start}–${clash.end}) on ${body.day}.`,
        "CONFLICT",
      );
    }
    const doc = await Timetable.create({
      ...body,
      ...completion(body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/timetable/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = timetableUpdate.parse(req.body);
    const doc = await Timetable.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...body, ...completion(body.completed) },
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Timetable block not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/timetable/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Timetable.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Timetable block not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ----------------------------------------------------------------- exams */

router.get(
  "/exams",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.kind) filter.kind = String(req.query.kind);
    const items = await Exam.find(filter).sort({ date: 1 }).lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/exams",
  asyncHandler(async (req, res) => {
    const body = examCreate.parse(req.body);
    const doc = await Exam.create({
      ...body,
      ...completion(body.status === "completed" || body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/exams/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = examUpdate.parse(req.body);
    const patch = { ...body };
    if (body.status) Object.assign(patch, completion(body.status === "completed"));
    if (body.completed !== undefined) Object.assign(patch, completion(body.completed));
    const doc = await Exam.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      patch,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Exam not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/exams/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Exam.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return fail(res, 404, "Exam not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ----------------------------------------------------------------- goals */

router.get(
  "/goals",
  asyncHandler(async (req, res) => {
    const items = await Goal.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/goals",
  asyncHandler(async (req, res) => {
    const body = goalCreate.parse(req.body);
    const doc = await Goal.create({
      ...body,
      ...completion(body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.put(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = goalUpdate.parse(req.body);
    const doc = await Goal.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...body, ...completion(body.completed) },
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Goal not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Goal.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return fail(res, 404, "Goal not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

module.exports = router;
