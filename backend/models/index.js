"use strict";

/**
 * StudyFlow models.
 *
 * Every user-owned document carries a `userId` index so all queries can be
 * scoped to the authenticated user. `completed` / `completedAt` are shared by
 * every planner collection (the v7 "universal completion" contract) and are
 * kept in place for backwards compatibility with existing records.
 */

const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const opts = { timestamps: true, versionKey: false };

const userOwned = () => ({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
});

const completionFields = {
  completed: { type: Boolean, default: false, index: true },
  completedAt: { type: Date, default: null },
};

/* ------------------------------------------------------------------ User */

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    course: { type: String, default: "Computer Engineering", maxlength: 120 },
    college: { type: String, default: "", maxlength: 160 },
    branch: { type: String, default: "", maxlength: 80 },
    semester: { type: Number, default: 1, min: 1, max: 12 },
    theme: { type: String, enum: ["dark", "light", "system"], default: "dark" },
    // Preferences for the planner + dashboard.
    prefs: {
      dailyGoalMinutes: { type: Number, default: 120, min: 0, max: 1440 },
      studyDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
      dayStart: { type: String, default: "09:00" },
      dayEnd: { type: String, default: "22:00" },
      pomodoroFocus: { type: Number, default: 25 },
      pomodoroBreak: { type: Number, default: 5 },
      notifications: { type: Boolean, default: true },
      dashboardWidgets: {
        type: [String],
        default: [
          "stats",
          "today",
          "deadlines",
          "syllabus",
          "trend",
          "focus",
          "recommendations",
        ],
      },
    },
    lastLoginAt: { type: Date, default: null },
  },
  opts,
);

/* --------------------------------------------------------------- Subject */

const subjectSchema = new Schema(
  {
    ...userOwned(),
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, default: "", maxlength: 40 },
    color: { type: String, default: "#6c5ce7" },
    credits: { type: Number, default: 0, min: 0, max: 30 },
    semester: { type: Number, default: null },
    faculty: { type: String, default: "", maxlength: 120 },
    targetHours: { type: Number, default: 10, min: 0, max: 2000 },
    notes: { type: String, default: "", maxlength: 20000 },
    resources: {
      type: [
        {
          label: { type: String, default: "" },
          url: { type: String, default: "" },
          _id: false,
        },
      ],
      default: [],
    },
    ...completionFields,
  },
  opts,
);
subjectSchema.index({ userId: 1, createdAt: -1 });

/* ------------------------------------------------------ Unit / Topic tree */

const unitSchema = new Schema(
  {
    ...userOwned(),
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    order: { type: Number, default: 0 },
    notes: { type: String, default: "", maxlength: 20000 },
    ...completionFields,
  },
  opts,
);
unitSchema.index({ userId: 1, subjectId: 1, order: 1 });

const topicSchema = new Schema(
  {
    ...userOwned(),
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: "Unit",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    estimatedMinutes: { type: Number, default: 60, min: 0, max: 6000 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "revised", "mastered"],
      default: "not_started",
    },
    revisionCount: { type: Number, default: 0 },
    lastRevisedAt: { type: Date, default: null },
    isImportant: { type: Boolean, default: false },
    referenceLinks: { type: [String], default: [] },
    notes: { type: String, default: "", maxlength: 20000 },
    ...completionFields,
  },
  opts,
);
topicSchema.index({ userId: 1, subjectId: 1, status: 1 });

/* ------------------------------------------------------------------ Task */

const taskSchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", maxlength: 20000 },
    type: {
      type: String,
      enum: [
        "task",
        "assignment",
        "practical",
        "viva",
        "exam",
        "internal",
        "project",
        "coding",
        "goal",
        "placement",
        "backlog",
        "custom",
      ],
      default: "task",
      index: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done"],
      default: "todo",
      index: true,
    },
    dueDate: { type: String, default: "" },
    dueTime: { type: String, default: "" },
    estimatedMinutes: { type: Number, default: 30, min: 0, max: 6000 },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "", maxlength: 20000 },
    // Assignment / practical / exam specific extras (all optional).
    maxMarks: { type: Number, default: null },
    scoredMarks: { type: Number, default: null },
    checklist: {
      type: [
        {
          text: { type: String, default: "" },
          done: { type: Boolean, default: false },
          _id: false,
        },
      ],
      default: [],
    },
    recurring: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    ...completionFields,
  },
  opts,
);
taskSchema.index({ userId: 1, status: 1, dueDate: 1 });
taskSchema.index({ userId: 1, createdAt: -1 });

/* ------------------------------------------------------- Study session */

const studySessionSchema = new Schema(
  {
    ...userOwned(),
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    date: { type: String, required: true, index: true },
    minutes: { type: Number, default: 0, min: 0, max: 1440 },
    topic: { type: String, default: "", maxlength: 300 },
    mode: {
      type: String,
      enum: ["pomodoro", "continuous", "manual"],
      default: "manual",
    },
    source: {
      type: String,
      enum: ["focus_timer", "manual", "planner"],
      default: "manual",
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    interruptions: { type: Number, default: 0 },
    ...completionFields,
  },
  opts,
);
studySessionSchema.index({ userId: 1, date: -1 });

/* ---------------------------------------------------- Focus sessions */

const focusSessionSchema = new Schema(
  {
    ...userOwned(),
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    label: { type: String, default: "Focus session", maxlength: 160 },
    mode: { type: String, enum: ["pomodoro", "continuous"], default: "pomodoro" },
    plannedMinutes: { type: Number, default: 25, min: 0, max: 600 },
    breakMinutes: { type: Number, default: 5, min: 0, max: 120 },
    actualSeconds: { type: Number, default: 0, min: 0 },
    cyclesCompleted: { type: Number, default: 0, min: 0 },
    interruptions: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["running", "paused", "completed", "abandoned"],
      default: "running",
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    date: { type: String, required: true, index: true },
  },
  opts,
);
focusSessionSchema.index({ userId: 1, date: -1 });

/* -------------------------------------------------------------- Planner */

const plannerEntrySchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 300 },
    date: { type: String, required: true, index: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    minutes: { type: Number, default: 0, min: 0, max: 1440 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    kind: {
      type: String,
      enum: ["study", "revision", "assignment", "practical", "exam", "break"],
      default: "study",
    },
    generated: { type: Boolean, default: false },
    missed: { type: Boolean, default: false },
    ...completionFields,
  },
  opts,
);
plannerEntrySchema.index({ userId: 1, date: 1, start: 1 });

/* ------------------------------------------------------------ Timetable */

const timetableSchema = new Schema(
  {
    ...userOwned(),
    day: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    room: { type: String, default: "" },
    ...completionFields,
  },
  opts,
);
timetableSchema.index({ userId: 1, day: 1 });

/* ----------------------------------------------------------- Exam/Goals */

const examSchema = new Schema(
  {
    ...userOwned(),
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    kind: {
      type: String,
      enum: ["internal", "end_semester", "practical", "viva", "mock", "backlog"],
      default: "internal",
    },
    date: { type: String, required: true },
    time: { type: String, default: "" },
    location: { type: String, default: "" },
    maxMarks: { type: Number, default: null },
    scoredMarks: { type: Number, default: null },
    status: {
      type: String,
      enum: ["upcoming", "completed"],
      default: "upcoming",
    },
    ...completionFields,
  },
  opts,
);
examSchema.index({ userId: 1, date: 1 });

const goalSchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 200 },
    target: { type: Number, default: 1, min: 0 },
    progress: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: "" },
    deadline: { type: String, default: "" },
    ...completionFields,
  },
  opts,
);

/* --------------------------------------------------------------- Notes */

const noteSchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 200000 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    tags: { type: [String], default: [] },
    folder: { type: String, default: "", maxlength: 80 },
    bookmarked: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  opts,
);
noteSchema.index({ userId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, title: "text", body: "text", tags: "text" });

/* -------------------------------------------------------------- Files */

const fileSchema = new Schema(
  {
    ...userOwned(),
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    extractedText: { type: String, default: "" },
    pages: { type: Number, default: 0 },
  },
  opts,
);
fileSchema.index({ userId: 1, createdAt: -1 });

/* -------------------------------------------------------------- Quizzes */

const quizQuestionSchema = new Schema(
  {
    prompt: { type: String, required: true },
    type: { type: String, enum: ["mcq", "short"], default: "mcq" },
    options: { type: [String], default: [] },
    answerIndex: { type: Number, default: null },
    answerText: { type: String, default: "" },
    explanation: { type: String, default: "" },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    topicTitle: { type: String, default: "" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
  },
  { _id: true },
);

const quizSchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "mixed"],
      default: "mixed",
    },
    timeLimitMinutes: { type: Number, default: 0, min: 0, max: 600 },
    source: {
      type: String,
      enum: ["manual", "ai", "generated"],
      default: "manual",
    },
    questions: { type: [quizQuestionSchema], default: [] },
    attemptCount: { type: Number, default: 0 },
    bestScore: { type: Number, default: null },
  },
  opts,
);
quizSchema.index({ userId: 1, createdAt: -1 });

const quizAttemptSchema = new Schema(
  {
    ...userOwned(),
    quizId: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    answers: {
      type: [
        {
          questionId: { type: Schema.Types.ObjectId },
          given: { type: String, default: "" },
          correct: { type: Boolean, default: false },
          topicId: { type: Schema.Types.ObjectId, default: null },
          topicTitle: { type: String, default: "" },
        },
      ],
      default: [],
    },
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  opts,
);
quizAttemptSchema.index({ userId: 1, submittedAt: -1 });

/* --------------------------------------------------------- Flashcards */

const flashcardSchema = new Schema(
  {
    ...userOwned(),
    front: { type: String, required: true, maxlength: 2000 },
    back: { type: String, required: true, maxlength: 8000 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", default: null },
    tags: { type: [String], default: [] },
    // SM-2 style spaced repetition state.
    ease: { type: Number, default: 2.5, min: 1.3, max: 3.0 },
    intervalDays: { type: Number, default: 0, min: 0 },
    repetitions: { type: Number, default: 0, min: 0 },
    dueDate: { type: String, default: "" },
    lastReviewedAt: { type: Date, default: null },
    lapses: { type: Number, default: 0 },
  },
  opts,
);
flashcardSchema.index({ userId: 1, dueDate: 1 });

/* ------------------------------------------------------------ Chat (AI) */

const chatMessageSchema = new Schema(
  {
    ...userOwned(),
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 40000 },
    mode: { type: String, default: "explain" },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
  },
  { timestamps: true, versionKey: false },
);
chatMessageSchema.index({ userId: 1, createdAt: -1 });

/* --------------------------------------------------- Engineering extras */

const projectSchema = new Schema(
  {
    ...userOwned(),
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 20000 },
    kind: { type: String, enum: ["mini", "major", "personal"], default: "mini" },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    repoUrl: { type: String, default: "" },
    techStack: { type: [String], default: [] },
    deadline: { type: String, default: "" },
    status: {
      type: String,
      enum: ["planning", "in_progress", "review", "done"],
      default: "planning",
    },
    milestones: {
      type: [
        {
          title: { type: String, default: "" },
          done: { type: Boolean, default: false },
          dueDate: { type: String, default: "" },
        },
      ],
      default: [],
    },
    ...completionFields,
  },
  opts,
);

const codingLogSchema = new Schema(
  {
    ...userOwned(),
    problem: { type: String, required: true, maxlength: 300 },
    platform: { type: String, default: "LeetCode" },
    url: { type: String, default: "" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    topic: { type: String, default: "" },
    solved: { type: Boolean, default: true },
    solvedAt: { type: Date, default: Date.now },
    notes: { type: String, default: "", maxlength: 8000 },
  },
  opts,
);
codingLogSchema.index({ userId: 1, solvedAt: -1 });

const journalEntrySchema = new Schema(
  {
    ...userOwned(),
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    experiment: { type: String, required: true, maxlength: 300 },
    number: { type: Number, default: null },
    date: { type: String, default: "" },
    aim: { type: String, default: "" },
    apparatus: { type: String, default: "" },
    procedure: { type: String, default: "" },
    observations: { type: String, default: "" },
    conclusion: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "written", "checked"],
      default: "pending",
    },
    ...completionFields,
  },
  opts,
);

const achievementSchema = new Schema(
  {
    ...userOwned(),
    key: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    icon: { type: String, default: "★" },
    unlockedAt: { type: Date, default: Date.now },
  },
  opts,
);
achievementSchema.index({ userId: 1, key: 1 }, { unique: true });

const passwordResetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
// TTL index: Mongo removes expired reset tokens automatically.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const models = {
  User: model("User", userSchema),
  Subject: model("Subject", subjectSchema),
  Unit: model("Unit", unitSchema),
  Topic: model("Topic", topicSchema),
  Task: model("Task", taskSchema),
  StudySession: model("StudySession", studySessionSchema),
  FocusSession: model("FocusSession", focusSessionSchema),
  PlannerEntry: model("PlannerEntry", plannerEntrySchema),
  Timetable: model("Timetable", timetableSchema),
  Exam: model("Exam", examSchema),
  Goal: model("Goal", goalSchema),
  Note: model("Note", noteSchema),
  File: model("File", fileSchema),
  Quiz: model("Quiz", quizSchema),
  QuizAttempt: model("QuizAttempt", quizAttemptSchema),
  Flashcard: model("Flashcard", flashcardSchema),
  ChatMessage: model("ChatMessage", chatMessageSchema),
  Project: model("Project", projectSchema),
  CodingLog: model("CodingLog", codingLogSchema),
  JournalEntry: model("JournalEntry", journalEntrySchema),
  Achievement: model("Achievement", achievementSchema),
  PasswordReset: model("PasswordReset", passwordResetSchema),
};

module.exports = models;
