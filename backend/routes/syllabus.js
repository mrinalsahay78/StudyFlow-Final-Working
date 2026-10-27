"use strict";
const express = require("express");
const mongoose = require("mongoose");
const { Unit, Topic, Subject } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { unitUpdate, topicUpdate } = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/* ------------------------------------------------------------------ units */

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    const items = await Unit.find(filter).sort({ subjectId: 1, order: 1 }).lean();
    ok(res, { items, total: items.length });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = unitUpdate.parse(req.body);
    const doc = await Unit.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...body, ...completion(body.completed) },
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Unit not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const unit = await Unit.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!unit) return fail(res, 404, "Unit not found", "NOT_FOUND");
    // Topics stay in the subject but become ungrouped rather than vanishing.
    await Topic.updateMany(
      { userId: req.user._id, unitId: unit._id },
      { $set: { unitId: null } },
    );
    ok(res, { id: req.params.id, deleted: true });
  }),
);

/* ----------------------------------------------------------------- topics */

router.get(
  "/topics/all",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    if (req.query.status) filter.status = String(req.query.status);
    const items = await Topic.find(filter).sort({ createdAt: 1 }).lean();
    ok(res, { items, total: items.length });
  }),
);

router.put(
  "/topics/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = topicUpdate.parse(req.body);
    const patch = { ...body };
    // Any status change beyond "not_started" counts as a revision touchpoint.
    if (body.status && ["revised", "mastered"].includes(body.status)) {
      patch.lastRevisedAt = new Date();
      patch.$inc = undefined;
    }
    const topic = await Topic.findOne({ _id: req.params.id, userId: req.user._id });
    if (!topic) return fail(res, 404, "Topic not found", "NOT_FOUND");
    Object.assign(topic, patch);
    if (body.status && ["revised", "mastered"].includes(body.status)) {
      topic.revisionCount = (topic.revisionCount || 0) + 1;
    }
    if (body.status === "mastered") {
      topic.completed = true;
      topic.completedAt = topic.completedAt || new Date();
    } else if (body.status && body.status !== "mastered" && body.completed === undefined) {
      topic.completed = false;
      topic.completedAt = null;
    }
    if (body.completed !== undefined) {
      const c = completion(body.completed);
      topic.completed = c.completed;
      topic.completedAt = c.completedAt;
      if (c.completed && topic.status === "not_started") topic.status = "in_progress";
    }
    await topic.save();
    ok(res, topic.toObject());
  }),
);

router.delete(
  "/topics/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Topic.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Topic not found", "NOT_FOUND");
    ok(res, { id: req.params.id, deleted: true });
  }),
);

/** Bulk complete / reset every topic of one unit (useful after a lecture). */
router.post(
  "/:id/topics/complete",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const unit = await Unit.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).select("_id subjectId");
    if (!unit) return fail(res, 404, "Unit not found", "NOT_FOUND");
    const done = req.body && req.body.completed !== false;
    await Topic.updateMany(
      { userId: req.user._id, unitId: unit._id },
      {
        $set: {
          completed: done,
          completedAt: done ? new Date() : null,
          status: done ? "mastered" : "not_started",
        },
      },
    );
    ok(res, { unitId: unit._id, completed: done });
  }),
);

module.exports = router;
