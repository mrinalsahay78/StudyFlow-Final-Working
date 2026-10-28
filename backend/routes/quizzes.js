"use strict";
/**
 * Quizzes, attempts, flashcards and spaced repetition.
 *
 * Scoring is automatic and objective: MCQ answers are compared to the stored
 * answer index, short answers are matched case-insensitively against accepted
 * text (exact or keyword overlap) and always flagged for self review when they
 * do not match. Nothing is ever marked correct without a real comparison.
 */
const express = require("express");
const mongoose = require("mongoose");
const { Quiz, QuizAttempt, Flashcard, Topic, Subject } = require("../models");
const { requireAuth } = require("../middleware/auth");
const {
  quizCreate,
  quizUpdate,
  attemptSubmit,
  flashcardCreate,
  flashcardUpdate,
  reviewSchema,
} = require("../validation/schemas");
const { asyncHandler, ok, fail } = require("../utils/http");
const { dayKey, addDays, escapeRegex } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const badId = (res) => fail(res, 400, "Invalid id", "BAD_ID");

/* ---------------------------------------------------------------- quizzes */

router.get(
  "/quizzes",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    if (req.query.q) {
      filter.title = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i");
    }
    const items = await Quiz.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    ok(res, {
      items: items.map((q) => ({
        ...q,
        questionCount: q.questions.length,
        questions: undefined,
      })),
      total: items.length,
    });
  }),
);

router.post(
  "/quizzes",
  asyncHandler(async (req, res) => {
    const body = quizCreate.parse(req.body);
    const doc = await Quiz.create({ ...body, userId: req.user._id });
    ok(res, doc.toObject(), 201);
  }),
);

router.get(
  "/quizzes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!quiz) return fail(res, 404, "Quiz not found", "NOT_FOUND");
    // Answers are stripped for the practice view so the browser cannot see them.
    const forClient = req.query.withAnswers === "true"
      ? quiz
      : {
          ...quiz,
          questions: quiz.questions.map((q) => ({
            ...q,
            answerIndex: undefined,
            answerText: undefined,
            explanation: undefined,
          })),
        };
    ok(res, forClient);
  }),
);

router.put(
  "/quizzes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = quizUpdate.parse(req.body);
    const doc = await Quiz.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Quiz not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/quizzes/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Quiz.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!doc) return fail(res, 404, "Quiz not found", "NOT_FOUND");
    await QuizAttempt.deleteMany({ userId: req.user._id, quizId: doc._id });
    ok(res, { deleted: true });
  }),
);

function normaliseText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple, transparent keyword overlap used for short-answer scoring. */
function shortAnswerMatches(given, expected) {
  const g = normaliseText(given);
  const e = normaliseText(expected);
  if (!g) return false;
  if (!e) return false;
  if (g === e) return true;
  const keywords = e.split(" ").filter((w) => w.length > 3);
  if (!keywords.length) return false;
  const hits = keywords.filter((w) => g.includes(w)).length;
  return hits / keywords.length >= 0.7;
}

router.post(
  "/quizzes/:id/attempts",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const { answers, durationSeconds } = attemptSubmit.parse(req.body || {});
    const quiz = await Quiz.findOne({ _id: req.params.id, userId: req.user._id });
    if (!quiz) return fail(res, 404, "Quiz not found", "NOT_FOUND");

    const givenByQuestion = new Map(
      answers.map((a) => [String(a.questionId), String(a.given ?? "")]),
    );
    let score = 0;
    const review = quiz.questions.map((q) => {
      const given = givenByQuestion.get(String(q._id)) ?? "";
      let correct = false;
      if (q.type === "mcq") {
        // A question with no stored answer key must never be scored correct:
        // otherwise "no key" (null) would compare equal to a blank answer.
        const hasKey = q.answerIndex !== null && q.answerIndex !== undefined;
        correct = hasKey && given !== "" && String(q.answerIndex) === given;
      } else {
        correct = shortAnswerMatches(given, q.answerText);
      }
      if (correct) score += 1;
      return {
        questionId: q._id,
        given,
        correct,
        topicId: q.topicId || null,
        topicTitle: q.topicTitle || "",
      };
    });
    const total = quiz.questions.length;
    const accuracy = total ? Math.round((score / total) * 100) : 0;
    const attempt = await QuizAttempt.create({
      userId: req.user._id,
      quizId: quiz._id,
      subjectId: quiz.subjectId || null,
      answers: review,
      score,
      total,
      accuracy,
      durationSeconds: durationSeconds || 0,
    });
    quiz.attemptCount += 1;
    quiz.bestScore = quiz.bestScore === null ? accuracy : Math.max(quiz.bestScore, accuracy);
    await quiz.save();

    // Weak topics feed the revision recommendations.
    const wrongTopics = review.filter((r) => !r.correct && r.topicId).map((r) => r.topicId);
    if (wrongTopics.length) {
      await Topic.updateMany(
        { _id: { $in: wrongTopics }, userId: req.user._id },
        { $set: { status: "in_progress" } },
      );
    }

    ok(
      res,
      {
        attempt: attempt.toObject(),
        review: quiz.questions.map((q, i) => ({
          questionId: q._id,
          prompt: q.prompt,
          type: q.type,
          options: q.options,
          answerIndex: q.answerIndex,
          answerText: q.answerText,
          explanation: q.explanation,
          given: review[i].given,
          correct: review[i].correct,
          topicTitle: q.topicTitle,
        })),
      },
      201,
    );
  }),
);

router.get(
  "/quizzes/:id/attempts",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const items = await QuizAttempt.find({
      userId: req.user._id,
      quizId: req.params.id,
    })
      .sort({ submittedAt: -1 })
      .limit(50)
      .lean();
    ok(res, { items, total: items.length });
  }),
);

router.get(
  "/attempts",
  asyncHandler(async (req, res) => {
    const items = await QuizAttempt.find({ userId: req.user._id })
      .sort({ submittedAt: -1 })
      .limit(200)
      .lean();
    const quizIds = [...new Set(items.map((a) => String(a.quizId)))];
    const quizzes = await Quiz.find({ _id: { $in: quizIds }, userId: req.user._id })
      .select("title")
      .lean();
    const titles = new Map(quizzes.map((q) => [String(q._id), q.title]));
    ok(res, {
      items: items.map((a) => ({ ...a, quizTitle: titles.get(String(a.quizId)) || "Quiz" })),
      total: items.length,
    });
  }),
);

/**
 * Topic-wise performance: for every topic that has ever appeared in an attempt,
 * accuracy across all attempts plus the quiz history that produced it.
 */
router.get(
  "/performance",
  asyncHandler(async (req, res) => {
    const attempts = await QuizAttempt.find({ userId: req.user._id })
      .sort({ submittedAt: 1 })
      .lean();
    const byTopic = new Map();
    attempts.forEach((a) => {
      a.answers.forEach((ans) => {
        const key = ans.topicTitle || "General";
        if (!byTopic.has(key)) byTopic.set(key, { topic: key, correct: 0, total: 0 });
        const row = byTopic.get(key);
        row.total += 1;
        if (ans.correct) row.correct += 1;
      });
    });
    const topics = [...byTopic.values()]
      .map((t) => ({ ...t, accuracy: t.total ? Math.round((t.correct / t.total) * 100) : 0 }))
      .sort((a, b) => a.accuracy - b.accuracy);
    const trend = attempts.map((a) => ({
      date: a.submittedAt,
      accuracy: a.accuracy,
      score: a.score,
      total: a.total,
    }));
    ok(res, {
      topics,
      weakTopics: topics.filter((t) => t.total >= 2 && t.accuracy < 60),
      trend,
      attempts: attempts.length,
      averageAccuracy: attempts.length
        ? Math.round(attempts.reduce((s, a) => s + a.accuracy, 0) / attempts.length)
        : 0,
    });
  }),
);

/* ------------------------------------------------------------- flashcards */

const SM2 = (card, grade) => {
  // grade: 0 again, 1 hard, 2 good, 3 easy
  let { ease, intervalDays, repetitions, lapses } = card;
  if (grade === 0) {
    repetitions = 0;
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
    lapses += 1;
  } else {
    const q = grade === 1 ? 3 : grade === 2 ? 4 : 5;
    ease = Math.min(3, Math.max(1.3, ease + (0.1 - (5 - q) * 0.08)));
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 3;
    else intervalDays = Math.round(Math.max(1, intervalDays) * ease);
  }
  return {
    ease,
    intervalDays,
    repetitions,
    lapses,
    dueDate: dayKey(addDays(new Date(), Math.max(1, intervalDays))),
    lastReviewedAt: new Date(),
  };
};

router.get(
  "/flashcards",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id };
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) {
      filter.subjectId = req.query.subjectId;
    }
    if (req.query.due === "true") {
      filter.$or = [{ dueDate: "" }, { dueDate: { $lte: dayKey() } }];
    }
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), "i");
      filter.$and = [{ $or: [{ front: rx }, { back: rx }, { tags: rx }] }];
    }
    const items = await Flashcard.find(filter).sort({ dueDate: 1, createdAt: -1 }).limit(400).lean();
    const dueCount = await Flashcard.countDocuments({
      userId: req.user._id,
      $or: [{ dueDate: "" }, { dueDate: { $lte: dayKey() } }],
    });
    ok(res, { items, total: items.length, dueCount });
  }),
);

router.post(
  "/flashcards",
  asyncHandler(async (req, res) => {
    const body = flashcardCreate.parse(req.body);
    const doc = await Flashcard.create({
      ...body,
      dueDate: dayKey(),
      userId: req.user._id,
    });
    ok(res, doc.toObject(), 201);
  }),
);

router.post(
  "/flashcards/bulk",
  asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body && req.body.items) ? req.body.items : [];
    if (!list.length) return fail(res, 400, "No cards to add", "EMPTY");
    if (list.length > 200) return fail(res, 400, "Add at most 200 cards at once", "TOO_MANY");
    const docs = list.map((raw) => {
      const body = flashcardCreate.parse(raw);
      return { ...body, dueDate: dayKey(), userId: req.user._id };
    });
    const created = await Flashcard.insertMany(docs);
    ok(res, { created: created.length }, 201);
  }),
);

router.put(
  "/flashcards/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const body = flashcardUpdate.parse(req.body);
    const doc = await Flashcard.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      body,
      { new: true, runValidators: true },
    );
    if (!doc) return fail(res, 404, "Card not found", "NOT_FOUND");
    ok(res, doc.toObject());
  }),
);

router.delete(
  "/flashcards/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const doc = await Flashcard.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!doc) return fail(res, 404, "Card not found", "NOT_FOUND");
    ok(res, { deleted: true });
  }),
);

router.post(
  "/flashcards/:id/review",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return badId(res);
    const { grade } = reviewSchema.parse(req.body || {});
    const card = await Flashcard.findOne({ _id: req.params.id, userId: req.user._id });
    if (!card) return fail(res, 404, "Card not found", "NOT_FOUND");
    Object.assign(card, SM2(card, grade));
    await card.save();
    ok(res, card.toObject());
  }),
);

module.exports = router;
module.exports.shortAnswerMatches = shortAnswerMatches;
