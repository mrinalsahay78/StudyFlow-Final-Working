"use strict";
/**
 * Notes and the private file library.
 *
 * Files are stored on disk under UPLOAD_DIR/<userId>/ and are only ever served
 * through an authenticated route that re-checks ownership, so one student can
 * never read another student's documents.
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const config = require("../config");
const { Note, File } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { noteCreate, noteUpdate, nullableId } = require("../validation/schemas");
const { asyncHandler, ok, fail } = require("../utils/http");
const { escapeRegex } = require("../utils/date");
const { extractText, ALLOWED_MIME } = require("../utils/extract");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/* ------------------------------------------------------------------ notes */

router.get(
  "/notes",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    if (req.query.folder) filter.folder = String(req.query.folder);
    if (req.query.bookmarked === "true") filter.bookmarked = true;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i");
      filter.$or = [{ title: rx }, { body: rx }, { tags: rx }, { folder: rx }];
    }
    const items = await Note.find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(400)
      .lean();
    ok(res, { items, total: items.length });
  }),
);

router.get(
  "/notes/folders",
  asyncHandler(async (req, res) => {
    const folders = await Note.distinct("folder", { userId: req.user._id });
    ok(res, { items: folders.filter(Boolean).sort() });
  }),
);

router.post(
  "/notes",
  asyncHandler(async (req, res) => {
    const body = noteCreate.parse(req.body);
    const doc = await Note.create({ ...body, userId: req.user._id });
    ok(res, doc.toObject(), 201);
  }),
);

router.get(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Note.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!doc) return fail(res, 404, "Note not found", "NOT_FOUND");
    ok(res, doc);
  }),
);

router.put(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = noteUpdate.parse(req.body);
    const doc = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Note not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/notes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Note.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return fail(res, 404, "Note not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

/* ------------------------------------------------------------------ files */

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(config.uploadDir, String(req.user._id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error(
        "Unsupported file type. Upload a PDF, text, markdown, CSV or image file.",
      );
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

router.get(
  "/files",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    const items = await File.find(filter)
      .select("-extractedText")
      .sort({ createdAt: -1 })
      .lean();
    ok(res, { items, total: items.length });
  }),
);

router.post(
  "/files",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 400, "No file received", "NO_FILE");
    const subjectId = req.body.subjectId && mongoose.isValidObjectId(req.body.subjectId)
      ? req.body.subjectId
      : null;
    let extracted = "";
    try {
      extracted = await extractText(req.file.path, req.file.mimetype);
    } catch (err) {
      console.warn("[files] text extraction failed:", err.message);
    }
    const doc = await File.create({
      userId: req.user._id,
      originalName: req.file.originalname.slice(0, 200),
      storedName: path.basename(req.file.path),
      mimeType: req.file.mimetype,
      size: req.file.size,
      subjectId,
      extractedText: extracted.slice(0, 200000),
    });
    const { extractedText, ...safe } = doc.toObject();
    ok(res, { ...safe, hasText: Boolean(extracted) }, 201);
  }),
);

router.get(
  "/files/:id/download",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await File.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!doc) return fail(res, 404, "File not found", "NOT_FOUND");
    const full = path.join(config.uploadDir, String(req.user._id), doc.storedName);
    if (!fs.existsSync(full)) return fail(res, 410, "File is no longer available", "GONE");
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.originalName)}"`,
    );
    fs.createReadStream(full).pipe(res);
  }),
);

router.delete(
  "/files/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await File.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return fail(res, 404, "File not found", "NOT_FOUND");
    const full = path.join(config.uploadDir, String(req.user._id), doc.storedName);
    fs.promises.unlink(full).catch(() => {});
    ok(res, { deleted: true });
  }),
);

module.exports = router;
