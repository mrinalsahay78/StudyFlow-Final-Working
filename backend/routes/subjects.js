"use strict";
const express = require("express");
const mongoose = require("mongoose");
const { Subject, Unit, Topic } = require("../models");
const { requireAuth } = require("../middleware/auth");
const {
  subjectCreate,
  subjectUpdate,
  unitCreate,
  unitUpdate,
  topicCreate,
  topicUpdate,
  objectId,
} = require("../validation/schemas");
const { asyncHandler, ok, fail, completion } = require("../utils/http");
const { escapeRegex } = require("../utils/date");
const { STARTER_SUBJECTS } = require("../utils/templates");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/** Subject list with syllabus roll-ups so the UI never needs N+1 calls. */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.q) {
      filter.$or = [
        { name: new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i") },
        { code: new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i") },
      ];
    }
    if (req.query.semester) filter.semester = Number(req.query.semester);
    const subjects = await Subject.find(filter).sort({ createdAt: 1 }).lean();
    const ids = subjects.map((s) => s._id);
    const [topics, units] = await Promise.all([
      Topic.find({ userId: req.user._id, subjectId: { $in: ids } })
        .select("subjectId status estimatedMinutes completed isImportant")
        .lean(),
      Unit.find({ userId: req.user._id, subjectId: { $in: ids } })
        .select("subjectId")
        .lean(),
    ]);
    const bySubject = new Map();
    topics.forEach((t) => {
      const key = String(t.subjectId);
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(t);
    });
    const unitCount = new Map();
    units.forEach((u) => {
      const key = String(u.subjectId);
      unitCount.set(key, (unitCount.get(key) || 0) + 1);
    });
    const items = subjects.map((s) => {
      const list = bySubject.get(String(s._id)) || [];
      const done = list.filter((t) => t.completed).length;
      const revised = list.filter((t) => t.status === "revised" || t.status === "mastered").length;
      return {
        ...s,
        unitCount: unitCount.get(String(s._id)) || 0,
        topicCount: list.length,
        topicsCompleted: done,
        topicsRevised: revised,
        progress: list.length ? Math.round((done / list.length) * 100) : 0,
        plannedMinutes: list.reduce((a, t) => a + (t.estimatedMinutes || 0), 0),
      };
    });
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = subjectCreate.parse(req.body);
    const doc = await Subject.create({
      ...body,
      ...completion(body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

/** Starter templates the student can pick from (never auto-applied). */
router.get("/templates", (req, res) => ok(res, { items: STARTER_SUBJECTS }));

router.post(
  "/from-template",
  asyncHandler(async (req, res) => {
    const templateId = String(req.body && req.body.templateId ? req.body.templateId : "");
    const template = STARTER_SUBJECTS.find((t) => t.id === templateId);
    if (!template) return fail(res, 404, "Template not found", "NOT_FOUND");
    const subject = await Subject.create({
      userId: req.user._id,
      name: template.name,
      code: template.code,
      color: template.color,
      semester: req.user.semester || null,
      targetHours: template.targetHours,
      notes: template.notes || "",
    });
    let order = 0;
    for (const unit of template.units) {
      const u = await Unit.create({
        userId: req.user._id,
        subjectId: subject._id,
        title: unit.title,
        order: order++,
      });
      if (unit.topics && unit.topics.length) {
        await Topic.insertMany(
          unit.topics.map((title) => ({
            userId: req.user._id,
            subjectId: subject._id,
            unitId: u._id,
            title,
            estimatedMinutes: 60,
          })),
        );
      }
    }
    ok(res, { subject: subject.toObject() }, 201);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const subject = await Subject.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();
    if (!subject) return fail(res, 404, "Subject not found", "NOT_FOUND");
    const [units, topics] = await Promise.all([
      Unit.find({ userId: req.user._id, subjectId: subject._id })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
      Topic.find({ userId: req.user._id, subjectId: subject._id })
        .sort({ createdAt: 1 })
        .lean(),
    ]);
    ok(res, { subject, units, topics });
  }),
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = subjectUpdate.parse(req.body);
    const doc = await Subject.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { ...body, ...completion(body.completed) },
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Subject not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const subject = await Subject.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!subject) return fail(res, 404, "Subject not found", "NOT_FOUND");
    // Cascade: syllabus tree and references from other collections are cleared
    // of this subject id so no orphaned rows are left behind.
    const { Task, StudySession, PlannerEntry, Timetable, Exam, Note, Flashcard, Quiz } =
      require("../models");
    await Promise.all([
      Unit.deleteMany({ userId: req.user._id, subjectId: subject._id }),
      Topic.deleteMany({ userId: req.user._id, subjectId: subject._id }),
      Task.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      StudySession.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      PlannerEntry.deleteMany({ userId: req.user._id, subjectId: subject._id }),
      Timetable.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      Exam.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      Note.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      Flashcard.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
      Quiz.updateMany(
        { userId: req.user._id, subjectId: subject._id },
        { $set: { subjectId: null } },
      ),
    ]);
    ok(res, { id: req.params.id, deleted: true });
  }),
);

/* ------------------------------------------------------------------ units */

router.get(
  "/:id/units",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const units = await Unit.find({
      userId: req.user._id,
      subjectId: req.params.id,
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    const topics = await Topic.find({
      userId: req.user._id,
      subjectId: req.params.id,
    }).lean();
    ok(res, {
      items: units.map((u) => ({
        ...u,
        topics: topics.filter((t) => String(t.unitId) === String(u._id)),
      })),
      ungrouped: topics.filter((t) => !t.unitId),
    });
  }),
);

router.post(
  "/:id/units",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const subject = await Subject.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).select("_id");
    if (!subject) return fail(res, 404, "Subject not found", "NOT_FOUND");
    const body = unitCreate.parse({ ...req.body, subjectId: req.params.id });
    const count = await Unit.countDocuments({
      userId: req.user._id,
      subjectId: subject._id,
    });
    const doc = await Unit.create({
      ...body,
      subjectId: subject._id,
      order: body.order === undefined ? count : body.order,
      ...completion(body.completed),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

/* ----------------------------------------------------------------- topics */

router.post(
  "/:id/topics",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const subject = await Subject.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).select("_id");
    if (!subject) return fail(res, 404, "Subject not found", "NOT_FOUND");
    const body = topicCreate.parse({ ...req.body, subjectId: req.params.id });
    if (body.unitId) {
      const unit = await Unit.findOne({
        _id: body.unitId,
        userId: req.user._id,
        subjectId: subject._id,
      }).select("_id");
      if (!unit) return fail(res, 400, "Unit does not belong to this subject", "BAD_UNIT");
    }
    const doc = await Topic.create({
      ...body,
      subjectId: subject._id,
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

module.exports = router;
