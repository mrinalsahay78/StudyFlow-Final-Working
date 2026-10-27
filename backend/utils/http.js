"use strict";
/**
 * Small helpers shared by every route module:
 * - asyncHandler: forwards async errors to the express error middleware
 * - ok / fail: consistent JSON envelope
 * - completion(): normalises the universal `completed` / `completedAt` pair
 * - crudRouter(): a user-scoped CRUD router factory used by the simple
 *   collections (sessions, exams, assignments, goals, timetable...).
 */
const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, ownsDoc } = require("../middleware/auth");
const { startOfDay } = require("../utils/date");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, status, message, code) =>
  res.status(status).json({ ok: false, message, code });

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/** Returns the completion patch for a truthy/falsey `completed` value. */
function completion(value) {
  if (value === undefined) return {};
  const done = value === true || value === "true";
  return { completed: done, completedAt: done ? new Date() : null };
}

/**
 * Build a router with list/create/get/update/delete for a user-owned model.
 *
 * options:
 *   - Model            mongoose model
 *   - createSchema     zod schema for POST body
 *   - updateSchema     zod schema for PUT body
 *   - beforeCreate(req, body) / beforeUpdate(req, body)  async hooks
 *   - listFilter(req)  extra filter for GET
 *   - sort             sort object for GET
 *   - searchFields     array of field names used by ?q=
 *   - defaultLimit
 *   - onCompleted(req, doc)  called when an item is marked complete
 */
function crudRouter(options) {
  const {
    Model,
    createSchema,
    updateSchema,
    beforeCreate,
    beforeUpdate,
    listFilter,
    sort = { createdAt: -1 },
    searchFields = [],
    defaultLimit = 200,
    onCompleted,
  } = options;

  const router = express.Router();
  router.use(requireAuth);

  const invalidId = (res) =>
    res.status(400).json({ ok: false, message: "Invalid id", code: "BAD_ID" });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const filter = { userId: req.user._id };
      if (typeof listFilter === "function") {
        Object.assign(filter, (await listFilter(req)) || {});
      }
      if (req.query.q && searchFields.length) {
        const { escapeRegex } = require("../utils/date");
        const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i");
        filter.$or = searchFields.map((f) => ({ [f]: rx }));
      }
      if (req.query.completed === "true") filter.completed = true;
      if (req.query.completed === "false") filter.completed = false;
      const limit = Math.min(500, Number(req.query.limit) || defaultLimit);
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const [items, total] = await Promise.all([
        Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        Model.countDocuments(filter),
      ]);
      ok(res, { items, total });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = createSchema ? createSchema.parse(req.body) : { ...req.body };
      if (beforeCreate) await beforeCreate(req, body);
      const doc = await Model.create({
        ...body,
        ...completion(body.completed),
        userId: req.user._id,
      });
      if (doc.completed && onCompleted) await onCompleted(req, doc);
      ok(res, doc.toObject(), 201);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
      const doc = await Model.findOne({
        _id: req.params.id,
        userId: req.user._id,
      }).lean();
      if (!doc) return fail(res, 404, "Not found", "NOT_FOUND");
      ok(res, doc);
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
      const body = updateSchema ? updateSchema.parse(req.body) : { ...req.body };
      if (beforeUpdate) await beforeUpdate(req, body);
      const patch = { ...body, ...completion(body.completed) };
      delete patch.userId;
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        patch,
        { new: true, runValidators: true },
      );
      if (!doc) return fail(res, 404, "Not found", "NOT_FOUND");
      if (doc.completed && onCompleted) await onCompleted(req, doc);
      ok(res, doc.toObject());
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
      const doc = await Model.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
      });
      if (!doc) return fail(res, 404, "Not found", "NOT_FOUND");
      ok(res, { id: req.params.id, deleted: true });
    }),
  );

  return router;
}

module.exports = {
  asyncHandler,
  ok,
  fail,
  httpError,
  completion,
  crudRouter,
  startOfDay,
  ownsDoc,
};
