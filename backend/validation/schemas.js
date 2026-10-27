"use strict";
const { z } = require("zod");

/* ------------------------------------------------------------- helpers */

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

/** Object id or null/empty string -> stored as null. */
const nullableId = z
  .union([objectId, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const dateOnly = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, "Use YYYY-MM-DD");

const optionalDate = z
  .union([dateOnly, z.literal("")])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

const timeOnly = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:MM");

const optionalTime = z
  .union([timeOnly, z.literal("")])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour such as #6c5ce7");

const trimmed = (max) => z.string().trim().max(max);

const tags = z.array(trimmed(40)).max(20).optional();

/* ---------------------------------------------------------------- auth */

const registerSchema = z.object({
  name: trimmed(120).min(2, "Name must be at least 2 characters"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
  course: trimmed(120).optional(),
  branch: trimmed(80).optional(),
  college: trimmed(160).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(200),
});

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});

const resetSchema = z.object({
  token: z.string().min(20, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(200),
});

const profileSchema = z.object({
  name: trimmed(120).min(2).optional(),
  course: trimmed(120).optional(),
  college: trimmed(160).optional(),
  branch: trimmed(80).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  prefs: z
    .object({
      dailyGoalMinutes: z.coerce.number().int().min(0).max(1440).optional(),
      studyDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
      dayStart: optionalTime,
      dayEnd: optionalTime,
      pomodoroFocus: z.coerce.number().int().min(1).max(180).optional(),
      pomodoroBreak: z.coerce.number().int().min(1).max(60).optional(),
      notifications: z.boolean().optional(),
      dashboardWidgets: z.array(trimmed(40)).max(20).optional(),
    })
    .optional(),
});

/* ------------------------------------------------------------ subjects */

const subjectCreate = z.object({
  name: trimmed(160).min(1, "Subject name is required"),
  code: trimmed(40).optional(),
  color: hexColor.optional(),
  credits: z.coerce.number().min(0).max(30).optional(),
  semester: z.union([z.coerce.number().int().min(1).max(12), z.null()]).optional(),
  faculty: trimmed(120).optional(),
  targetHours: z.coerce.number().min(0).max(2000).optional(),
  notes: trimmed(20000).optional(),
  resources: z
    .array(z.object({ label: trimmed(120).optional(), url: trimmed(500).optional() }))
    .max(30)
    .optional(),
  completed: z.boolean().optional(),
});

const subjectUpdate = subjectCreate.partial();

/* --------------------------------------------------------------- units */

const unitCreate = z.object({
  subjectId: objectId,
  title: trimmed(200).min(1, "Unit title is required"),
  order: z.coerce.number().int().min(0).max(999).optional(),
  notes: trimmed(20000).optional(),
  completed: z.boolean().optional(),
});
const unitUpdate = unitCreate.partial().omit({ subjectId: true });

/* -------------------------------------------------------------- topics */

const topicCreate = z.object({
  subjectId: objectId,
  unitId: nullableId,
  title: trimmed(200).min(1, "Topic title is required"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(6000).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z
    .enum(["not_started", "in_progress", "revised", "mastered"])
    .optional(),
  isImportant: z.boolean().optional(),
  referenceLinks: z.array(trimmed(500)).max(20).optional(),
  notes: trimmed(20000).optional(),
});
const topicUpdate = topicCreate.partial().omit({ subjectId: true });

/* ---------------------------------------------------------------- tasks */

const taskTypes = [
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
];

const taskCreate = z.object({
  title: trimmed(300).min(1, "Title is required"),
  description: trimmed(20000).optional(),
  type: z.enum(taskTypes).optional(),
  subjectId: nullableId,
  topicId: nullableId,
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: optionalDate,
  dueTime: optionalTime,
  estimatedMinutes: z.coerce.number().int().min(0).max(6000).optional(),
  tags,
  notes: trimmed(20000).optional(),
  maxMarks: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  scoredMarks: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  checklist: z
    .array(z.object({ text: trimmed(300), done: z.boolean().optional() }))
    .max(100)
    .optional(),
  recurring: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
});
const taskUpdate = taskCreate.partial();

/* -------------------------------------------------------------- sessions */

const sessionCreate = z.object({
  subjectId: nullableId,
  topicId: nullableId,
  taskId: nullableId,
  date: dateOnly,
  minutes: z.coerce.number().int().min(0).max(1440),
  topic: trimmed(300).optional(),
  mode: z.enum(["pomodoro", "continuous", "manual"]).optional(),
  source: z.enum(["focus_timer", "manual", "planner"]).optional(),
  completed: z.boolean().optional(),
});
const sessionUpdate = sessionCreate.partial();

/* ------------------------------------------------------- focus sessions */

const focusCreate = z.object({
  subjectId: nullableId,
  taskId: nullableId,
  label: trimmed(160).optional(),
  mode: z.enum(["pomodoro", "continuous"]).optional(),
  plannedMinutes: z.coerce.number().min(0).max(600).optional(),
  breakMinutes: z.coerce.number().min(0).max(120).optional(),
  date: dateOnly.optional(),
});
const focusFinish = z.object({
  actualSeconds: z.coerce.number().int().min(0).max(86400),
  cyclesCompleted: z.coerce.number().int().min(0).max(100).optional(),
  interruptions: z.coerce.number().int().min(0).max(1000).optional(),
  status: z.enum(["completed", "abandoned"]).optional(),
});

/* ------------------------------------------------------------- planner */

const plannerCreate = z.object({
  title: trimmed(300).min(1, "Title is required"),
  date: dateOnly,
  start: timeOnly,
  end: timeOnly,
  subjectId: nullableId,
  topicId: nullableId,
  taskId: nullableId,
  kind: z
    .enum(["study", "revision", "assignment", "practical", "exam", "break"])
    .optional(),
  generated: z.boolean().optional(),
  completed: z.boolean().optional(),
});
const plannerUpdate = plannerCreate.partial();

const plannerGenerate = z.object({
  startDate: dateOnly.optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
  dailyMinutes: z.coerce.number().int().min(15).max(720).optional(),
  sessionMinutes: z.coerce.number().int().min(10).max(180).optional(),
  replaceGenerated: z.boolean().optional(),
  dayStart: optionalTime,
});

/* ----------------------------------------------------------- timetable */

const timetableCreate = z.object({
  day: z.enum([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]),
  start: timeOnly,
  end: timeOnly,
  title: trimmed(200).min(1, "Title is required"),
  subjectId: nullableId,
  room: trimmed(80).optional(),
  completed: z.boolean().optional(),
});
const timetableUpdate = timetableCreate.partial();

/* --------------------------------------------------------------- exams */

const examCreate = z.object({
  subjectId: nullableId,
  title: trimmed(200).min(1, "Title is required"),
  kind: z
    .enum(["internal", "end_semester", "practical", "viva", "mock", "backlog"])
    .optional(),
  date: dateOnly,
  time: optionalTime,
  location: trimmed(120).optional(),
  maxMarks: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  scoredMarks: z.union([z.coerce.number().min(0).max(1000), z.null()]).optional(),
  status: z.enum(["upcoming", "completed"]).optional(),
});
const examUpdate = examCreate.partial();

/* --------------------------------------------------------------- goals */

const goalCreate = z.object({
  title: trimmed(200).min(1, "Title is required"),
  target: z.coerce.number().min(0).max(100000).optional(),
  progress: z.coerce.number().min(0).max(100000).optional(),
  unit: trimmed(40).optional(),
  deadline: optionalDate,
  completed: z.boolean().optional(),
});
const goalUpdate = goalCreate.partial();

/* --------------------------------------------------------------- notes */

const noteCreate = z.object({
  title: trimmed(200).min(1, "Title is required"),
  body: trimmed(200000).optional(),
  subjectId: nullableId,
  topicId: nullableId,
  tags,
  folder: trimmed(80).optional(),
  bookmarked: z.boolean().optional(),
  pinned: z.boolean().optional(),
});
const noteUpdate = noteCreate.partial();

/* ------------------------------------------------------------- quizzes */

const questionSchema = z.object({
  prompt: trimmed(2000).min(1, "Question text is required"),
  type: z.enum(["mcq", "short"]).optional(),
  options: z.array(trimmed(500)).max(8).optional(),
  answerIndex: z.union([z.coerce.number().int().min(0).max(7), z.null()]).optional(),
  answerText: trimmed(2000).optional(),
  explanation: trimmed(2000).optional(),
  topicId: nullableId,
  topicTitle: trimmed(200).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

const quizCreate = z.object({
  title: trimmed(200).min(1, "Title is required"),
  subjectId: nullableId,
  unitId: nullableId,
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional(),
  timeLimitMinutes: z.coerce.number().int().min(0).max(600).optional(),
  questions: z.array(questionSchema).min(1, "Add at least one question").max(100),
  source: z.enum(["manual", "ai", "generated"]).optional(),
});
const quizUpdate = quizCreate.partial();

const attemptSubmit = z.object({
  answers: z
    .array(
      z.object({
        questionId: objectId,
        given: z.union([z.string().max(4000), z.number()]).optional(),
      }),
    )
    .max(200),
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});

/* ---------------------------------------------------------- flashcards */

const flashcardCreate = z.object({
  front: trimmed(2000).min(1, "Front is required"),
  back: trimmed(8000).min(1, "Back is required"),
  subjectId: nullableId,
  topicId: nullableId,
  tags,
});
const flashcardUpdate = flashcardCreate.partial();

const reviewSchema = z.object({
  // 0 = again, 1 = hard, 2 = good, 3 = easy
  grade: z.coerce.number().int().min(0).max(3),
});

/* ---------------------------------------------------------- engineering */

const projectCreate = z.object({
  title: trimmed(200).min(1, "Title is required"),
  description: trimmed(20000).optional(),
  kind: z.enum(["mini", "major", "personal"]).optional(),
  subjectId: nullableId,
  repoUrl: trimmed(500).optional(),
  techStack: z.array(trimmed(40)).max(20).optional(),
  deadline: optionalDate,
  status: z.enum(["planning", "in_progress", "review", "done"]).optional(),
  milestones: z
    .array(
      z.object({
        title: trimmed(200),
        done: z.boolean().optional(),
        dueDate: optionalDate,
      }),
    )
    .max(50)
    .optional(),
  completed: z.boolean().optional(),
});
const projectUpdate = projectCreate.partial();

const codingLogCreate = z.object({
  problem: trimmed(300).min(1, "Problem name is required"),
  platform: trimmed(60).optional(),
  url: trimmed(500).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  topic: trimmed(80).optional(),
  solved: z.boolean().optional(),
  notes: trimmed(8000).optional(),
});
const codingLogUpdate = codingLogCreate.partial();

const journalCreate = z.object({
  subjectId: nullableId,
  experiment: trimmed(300).min(1, "Experiment title is required"),
  number: z.union([z.coerce.number().int().min(0).max(999), z.null()]).optional(),
  date: optionalDate,
  aim: trimmed(4000).optional(),
  apparatus: trimmed(4000).optional(),
  procedure: trimmed(20000).optional(),
  observations: trimmed(20000).optional(),
  conclusion: trimmed(8000).optional(),
  status: z.enum(["pending", "written", "checked"]).optional(),
});
const journalUpdate = journalCreate.partial();

/* ------------------------------------------------------------- AI chat */

const aiChat = z.object({
  message: trimmed(8000).min(1, "Message is required"),
  mode: z
    .enum([
      "explain",
      "summarize",
      "flashcards",
      "quiz",
      "debug",
      "revision_plan",
      "viva",
      "chat",
    ])
    .optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  subjectId: nullableId,
  noteId: nullableId,
  fileId: nullableId,
  code: trimmed(8000).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  changePasswordSchema,
  profileSchema,
  subjectCreate,
  subjectUpdate,
  unitCreate,
  unitUpdate,
  topicCreate,
  topicUpdate,
  taskCreate,
  taskUpdate,
  sessionCreate,
  sessionUpdate,
  focusCreate,
  focusFinish,
  plannerCreate,
  plannerUpdate,
  plannerGenerate,
  timetableCreate,
  timetableUpdate,
  examCreate,
  examUpdate,
  goalCreate,
  goalUpdate,
  noteCreate,
  noteUpdate,
  quizCreate,
  quizUpdate,
  attemptSubmit,
  flashcardCreate,
  flashcardUpdate,
  reviewSchema,
  projectCreate,
  projectUpdate,
  codingLogCreate,
  codingLogUpdate,
  journalCreate,
  journalUpdate,
  aiChat,
  objectId,
  nullableId,
  dateOnly,
  optionalDate,
  timeOnly,
  optionalTime,
  hexColor,
};
