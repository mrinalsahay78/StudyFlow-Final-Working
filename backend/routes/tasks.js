"use strict";
const express = require("express");
const mongoose = require("mongoose");
const { Task, Subject } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { taskCreate, taskUpdate } = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");
const { escapeRegex, dayKey } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/** Normalise the user-facing values before they reach the model. */
function normalise(body) {
  const patch = { ...body };
  if (patch.priority) patch.priority = String(patch.priority).trim().toLowerCase();
  if (patch.status) patch.status = String(patch.status).trim().toLowerCase();
  if (patch.title !== undefined) patch.title = String(patch.title).trim();
  return patch;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    if (req.query.status && ["todo", "in_progress", "done"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (req.query.priority) filter.priority = String(req.query.priority);
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i");
      filter.$or = [{ title: rx }, { description: rx }, { notes: rx }, { tags: rx }];
    }
    if (req.query.overdue === "true") {
      filter.status = { $ne: "done" };
      filter.dueDate = { $ne: "", $lt: dayKey() };
    }
    if (req.query.due === "today") {
      filter.dueDate = dayKey();
      filter.status = { $ne: "done" };
    }
    const sort =
      req.query.sort === "due"
        ? { dueDate: 1, priority: -1 }
        : req.query.sort === "priority"
          ? { priority: -1, dueDate: 1 }
          : { createdAt: -1 };
    const items = await Task.find(filter).sort(sort).limit(500).lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = normalise(taskCreate.parse(req.body));
    const doc = await Task.create({
      ...body,
      ...completion(body.status === "done" || body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

/** Bulk create, used by the "import" flow (JSON array of tasks). */
router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (!list.length) return fail(res, 400, "No items to import", "EMPTY");
    if (list.length > 500) return fail(res, 400, "Import at most 500 items at once", "TOO_MANY");
    const parsed = list.map((raw) => {
      const body = normalise(taskCreate.parse(raw));
      return {
        ...body,
        ...completion(body.status === "done" || body.completed),
        userId: req.user._id,
      };
    });
    const docs = await Task.insertMany(parsed);
    ok(res, { created: docs.length }, 201);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Task.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!doc) return fail(res, 404, "Task not found", "NOT_FOUND");
    ok(res, doc);
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = normalise(taskUpdate.parse(req.body));
    const patch = { ...body };
    if (body.status !== undefined) {
      Object.assign(patch, completion(body.status === "done"));
    }
    if (body.completed !== undefined) Object.assign(patch, completion(body.completed));
    delete patch.userId;
    const doc = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      patch,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Task not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Task not found", "NOT_FOUND");
    ok(res, { id: req.params.id, deleted: true });
  }),
);

/** Export every task as JSON the user can keep or re-import. */
router.get(
  "/export/all",
  asyncHandler(async (req, res) => {
    const [subjects, tasks] = await Promise.all([
      Subject.find({ userId: req.user._id }).select("_id name code").lean(),
      Task.find({ userId: req.user._id }).lean(),
    ]);
    const byId = new Map(subjects.map((s) => [String(s._id), s]));
    const payload = {
      exportedAt: new Date().toISOString(),
      tasks: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        type: t.type,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        estimatedMinutes: t.estimatedMinutes,
        tags: t.tags,
        subject: t.subjectId ? byId.get(String(t.subjectId))?.name || "" : "",
        completed: t.completed,
      })),
    };
    res.setHeader("Content-Disposition", "attachment; filename=studyflow-tasks.json");
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(payload, null, 2));
  }),
);

module.exports = router;
