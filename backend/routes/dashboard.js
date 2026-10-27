"use strict";
/**
 * Dashboard + analytics.
 *
 * Every number returned here is derived from documents the user actually owns.
 * The scoring rules used by analytics and achievements are documented in
 * README.md ("Scoring rules") so nothing appears out of thin air.
 */
const express = require("express");
const {
  Subject,
  Topic,
  Task,
  StudySession,
  Exam,
  Goal,
  PlannerEntry,
  Timetable,
  QuizAttempt,
  Flashcard,
  FocusSession,
  CodingLog,
  Achievement,
} = require("../models");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, ok } = require("../utils/http");
const { dayKey, addDays } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Study streak: consecutive days (ending today or yesterday) with >= 1 minute. */
function computeStreak(minutesByDate) {
  const today = new Date();
  let streak = 0;
  let cursor = new Date(today);
  const has = (d) => (minutesByDate[dayKey(d)] || 0) > 0;
  if (!has(cursor)) {
    cursor = addDays(cursor, -1);
    if (!has(cursor)) return 0;
  }
  while (has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const uid = req.user._id;
    const today = dayKey();
    const weekStart = dayKey(addDays(new Date(), -6));

    const [
      subjects,
      topics,
      tasks,
      sessions,
      exams,
      goals,
      plannerToday,
      timetable,
      attempts,
      dueCards,
      focusToday,
      coding,
    ] = await Promise.all([
      Subject.find({ userId: uid }).lean(),
      Topic.find({ userId: uid })
        .select("subjectId completed status estimatedMinutes priority title")
        .lean(),
      Task.find({ userId: uid }).lean(),
      StudySession.find({ userId: uid, date: { $gte: weekStart } }).lean(),
      Exam.find({ userId: uid, status: "upcoming" }).sort({ date: 1 }).limit(10).lean(),
      Goal.find({ userId: uid, completed: false }).lean(),
      PlannerEntry.find({ userId: uid, date: today }).sort({ start: 1 }).lean(),
      Timetable.find({ userId: uid, day: dayName[new Date().getDay()] }).sort({ start: 1 }).lean(),
      QuizAttempt.find({ userId: uid }).sort({ submittedAt: -1 }).limit(30).lean(),
      Flashcard.countDocuments({
        userId: uid,
        $or: [{ dueDate: "" }, { dueDate: { $lte: today } }],
      }),
      FocusSession.find({ userId: uid, date: today }).lean(),
      CodingLog.find({ userId: uid }).select("solved solvedAt difficulty").lean(),
    ]);

    // Study minutes for the last 30 days (used for streaks and the trend chart).
    const last30 = dayKey(addDays(new Date(), -29));
    const monthSessions = await StudySession.find({
      userId: uid,
      date: { $gte: last30 },
    })
      .select("date minutes subjectId")
      .lean();
    const minutesByDate = {};
    monthSessions.forEach((s) => {
      minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (s.minutes || 0);
    });

    const minutesToday = minutesByDate[today] || 0;
    const minutesWeek = Object.entries(minutesByDate)
      .filter(([d]) => d >= weekStart)
      .reduce((a, [, m]) => a + m, 0);
    const streak = computeStreak(minutesByDate);

    const openTasks = tasks.filter((t) => t.status !== "done");
    const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
    const dueToday = openTasks.filter((t) => t.dueDate === today);
    const dueSoon = openTasks.filter(
      (t) => t.dueDate && t.dueDate > today && t.dueDate <= dayKey(addDays(new Date(), 7)),
    );

    const subjectStats = subjects.map((s) => {
      const list = topics.filter((t) => String(t.subjectId) === String(s._id));
      const done = list.filter((t) => t.completed).length;
      const minutes = monthSessions
        .filter((x) => String(x.subjectId) === String(s._id))
        .reduce((a, x) => a + (x.minutes || 0), 0);
      return {
        id: s._id,
        name: s.name,
        code: s.code,
        color: s.color,
        topics: list.length,
        completed: done,
        progress: list.length ? Math.round((done / list.length) * 100) : 0,
        minutes,
      };
    });

    // Recommendations: explicit, data-derived rules (no randomness).
    const recommendations = [];
    if (!subjects.length) {
      recommendations.push({
        id: "add-subject",
        tone: "info",
        title: "Add your first subject",
        body: "Create a subject with its syllabus units so StudyFlow can plan and track real progress.",
        href: "#subjects",
      });
    } else {
      const weakest = [...subjectStats].sort((a, b) => a.progress - b.progress)[0];
      if (weakest && weakest.topics > 0 && weakest.progress < 70) {
        recommendations.push({
          id: "weakest-subject",
          tone: "warn",
          title: `${weakest.name} is at ${weakest.progress}% syllabus`,
          body: `${weakest.completed} of ${weakest.topics} topics done. Schedule a revision session on its unfinished topics.`,
          href: "#subjects",
        });
      }
      const examSoon = exams.find((e) => e.date <= dayKey(addDays(new Date(), 7)));
      if (examSoon) {
        const daysLeft = Math.round(
          (new Date(`${examSoon.date}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000,
        );
        recommendations.push({
          id: "exam-soon",
          tone: "danger",
          title: `${examSoon.title} in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
          body: "Generate a revision plan for the remaining days and keep the last 48 hours for full practice.",
          href: "#planner",
        });
      }
      if (overdue.length) {
        recommendations.push({
          id: "overdue",
          tone: "danger",
          title: `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`,
          body: `Oldest: ${overdue[0].title}${overdue[0].dueDate ? ` (due ${overdue[0].dueDate})` : ""}.`,
          href: "#tasks",
        });
      }
      if (!minutesToday && plannerToday.length) {
        recommendations.push({
          id: "start-today",
          tone: "info",
          title: "Nothing logged today yet",
          body: `You have ${plannerToday.length} planned session${plannerToday.length === 1 ? "" : "s"} today. Start a focus timer to log real minutes.`,
          href: "#focus",
        });
      }
      if (dueCards > 0) {
        recommendations.push({
          id: "cards-due",
          tone: "info",
          title: `${dueCards} flashcard${dueCards === 1 ? "" : "s"} due`,
          body: "Spaced repetition only works if you review on the scheduled day.",
          href: "#flashcards",
        });
      }
      const weakestTopic = topics
        .filter((t) => !t.completed)
        .sort((a, b) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
        })[0];
      if (weakestTopic && subjects.length) {
        recommendations.push({
          id: "next-topic",
          tone: "info",
          title: "Next topic by priority",
          body: `${weakestTopic.title} — about ${weakestTopic.estimatedMinutes || 45} minutes estimated.`,
          href: "#planner",
        });
      }
    }

    const recentAttempts = attempts.slice(0, 5);
    const accuracy = recentAttempts.length
      ? Math.round(recentAttempts.reduce((a, x) => a + x.accuracy, 0) / recentAttempts.length)
      : null;

    ok(res, {
      today,
      greetingName: req.user.name,
      prefs: req.user.prefs,
      stats: {
        minutesToday,
        minutesWeek,
        dailyGoal: req.user.prefs?.dailyGoalMinutes || 120,
        goalProgress: Math.min(
          100,
          Math.round(
            (minutesToday / Math.max(1, req.user.prefs?.dailyGoalMinutes || 120)) * 100,
          ),
        ),
        streak,
        subjects: subjects.length,
        topicsTotal: topics.length,
        topicsCompleted: topics.filter((t) => t.completed).length,
        syllabusProgress: topics.length
          ? Math.round((topics.filter((t) => t.completed).length / topics.length) * 100)
          : 0,
        openTasks: openTasks.length,
        overdueTasks: overdue.length,
        dueToday: dueToday.length,
        completedTasks: tasks.filter((t) => t.status === "done").length,
        flashcardsDue: dueCards,
        quizAccuracy: accuracy,
        focusSessionsToday: focusToday.filter((f) => f.status === "completed").length,
        problemsSolved: coding.filter((c) => c.solved).length,
      },
      plannerToday,
      timetable,
      upcomingExams: exams,
      dueSoon: dueSoon.slice(0, 8),
      overdue: overdue.slice(0, 8),
      subjects: subjectStats,
      goals,
      recommendations,
      trend: Array.from({ length: 14 }, (_, i) => {
        const d = dayKey(addDays(new Date(), -(13 - i)));
        return { date: d, minutes: minutesByDate[d] || 0 };
      }),
    });
  }),
);

router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const uid = req.user._id;
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 30));
    const from = dayKey(addDays(new Date(), -(days - 1)));

    const [sessions, subjects, topics, tasks, attempts, exams, coding] =
      await Promise.all([
        StudySession.find({ userId: uid, date: { $gte: from } }).lean(),
        Subject.find({ userId: uid }).lean(),
        Topic.find({ userId: uid }).select("subjectId completed").lean(),
        Task.find({ userId: uid }).lean(),
        QuizAttempt.find({ userId: uid, submittedAt: { $gte: new Date(`${from}T00:00:00`) } })
          .sort({ submittedAt: 1 })
          .lean(),
        Exam.find({ userId: uid }).lean(),
        CodingLog.find({ userId: uid }).select("solved solvedAt difficulty").lean(),
      ]);

    const byDate = {};
    const bySubject = {};
    const byHour = {};
    sessions.forEach((s) => {
      byDate[s.date] = (byDate[s.date] || 0) + (s.minutes || 0);
      const key = String(s.subjectId || "none");
      bySubject[key] = (bySubject[key] || 0) + (s.minutes || 0);
      if (s.startedAt) {
        const h = new Date(s.startedAt).getHours();
        byHour[h] = (byHour[h] || 0) + (s.minutes || 0);
      }
    });

    const daily = Array.from({ length: days }, (_, i) => {
      const d = dayKey(addDays(new Date(), -(days - 1 - i)));
      return { date: d, minutes: byDate[d] || 0 };
    });
    const activeDays = daily.filter((d) => d.minutes > 0).length;
    const totalMinutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);

    const subjectMinutes = subjects
      .map((s) => ({
        id: s._id,
        name: s.name,
        color: s.color,
        minutes: bySubject[String(s._id)] || 0,
        topics: topics.filter((t) => String(t.subjectId) === String(s._id)).length,
        completed: topics.filter(
          (t) => String(t.subjectId) === String(s._id) && t.completed,
        ).length,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const doneTasks = tasks.filter((t) => t.status === "done");
    const overdueTasks = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate < dayKey(),
    );
    const avgAccuracy = attempts.length
      ? Math.round(attempts.reduce((a, x) => a + x.accuracy, 0) / attempts.length)
      : null;

    ok(res, {
      range: { from, to: dayKey(), days },
      totals: {
        minutes: totalMinutes,
        hours: Math.round((totalMinutes / 60) * 10) / 10,
        sessions: sessions.length,
        activeDays,
        consistency: days ? Math.round((activeDays / days) * 100) : 0,
        averagePerActiveDay: activeDays ? Math.round(totalMinutes / activeDays) : 0,
      },
      daily,
      subjectMinutes,
      taskStats: {
        total: tasks.length,
        done: doneTasks.length,
        overdue: overdueTasks.length,
        completionRate: tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
      },
      quiz: {
        attempts: attempts.length,
        averageAccuracy: avgAccuracy,
        trend: attempts.map((a) => ({ date: a.submittedAt, accuracy: a.accuracy })),
      },
      exams: {
        total: exams.length,
        completed: exams.filter((e) => e.status === "completed").length,
      },
      assignments: {
        // Assignments are Tasks with type "assignment" (single source of truth).
        total: tasks.filter((t) => t.type === "assignment").length,
        done: tasks.filter((t) => t.type === "assignment" && t.status === "done").length,
        overdue: tasks.filter(
          (t) => t.type === "assignment" && t.status !== "done" && t.dueDate && t.dueDate < dayKey(),
        ).length,
      },
      coding: {
        solved: coding.filter((c) => c.solved).length,
        easy: coding.filter((c) => c.solved && c.difficulty === "easy").length,
        medium: coding.filter((c) => c.solved && c.difficulty === "medium").length,
        hard: coding.filter((c) => c.solved && c.difficulty === "hard").length,
      },
      bestStudyHour: Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    });
  }),
);

/* --------------------------------------------------------- achievements */

/**
 * Achievement rules (transparent, evaluated from stored records):
 *   first_session   - 1+ completed study session
 *   streak_3/7/30   - consecutive study days
 *   focus_10h       - 600+ total focus minutes
 *   syllabus_25/50/100 - percentage of syllabus topics completed
 *   quiz_perfect    - 100% on any quiz attempt
 *   quiz_10         - 10 quiz attempts
 *   tasks_25        - 25 completed tasks
 *   coder_50        - 50 coding problems solved
 *   cards_100       - 100 flashcards created
 */
async function evaluateAchievements(userId) {
  const [sessions, tasks, topics, attempts, cards, coding] = await Promise.all([
    StudySession.find({ userId }).select("date minutes").lean(),
    Task.find({ userId }).select("status").lean(),
    Topic.find({ userId }).select("completed").lean(),
    QuizAttempt.find({ userId }).select("accuracy").lean(),
    Flashcard.countDocuments({ userId }),
    CodingLog.find({ userId, solved: true }).countDocuments(),
  ]);
  const minutesByDate = {};
  sessions.forEach((s) => {
    minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (s.minutes || 0);
  });
  const streak = computeStreak(minutesByDate);
  const totalMinutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const syllabus = topics.length
    ? Math.round((topics.filter((t) => t.completed).length / topics.length) * 100)
    : 0;
  const doneTasks = tasks.filter((t) => t.status === "done").length;

  const rules = [
    { key: "first_session", title: "First step", description: "Log your first study session", icon: "🌱", earned: sessions.length >= 1 },
    { key: "streak_3", title: "Warming up", description: "3 day study streak", icon: "🔥", earned: streak >= 3 },
    { key: "streak_7", title: "One week strong", description: "7 day study streak", icon: "⚡", earned: streak >= 7 },
    { key: "streak_30", title: "Unstoppable", description: "30 day study streak", icon: "🏆", earned: streak >= 30 },
    { key: "focus_10h", title: "10 hours deep", description: "600 total study minutes", icon: "⏳", earned: totalMinutes >= 600 },
    { key: "syllabus_25", title: "Quarter way", description: "25% of syllabus complete", icon: "📘", earned: syllabus >= 25 },
    { key: "syllabus_50", title: "Halfway there", description: "50% of syllabus complete", icon: "📗", earned: syllabus >= 50 },
    { key: "syllabus_100", title: "Syllabus cleared", description: "100% of syllabus complete", icon: "🎓", earned: syllabus >= 100 && topics.length > 0 },
    { key: "quiz_perfect", title: "Flawless", description: "Score 100% on a quiz", icon: "🎯", earned: attempts.some((a) => a.accuracy === 100) },
    { key: "quiz_10", title: "Test regular", description: "Complete 10 quiz attempts", icon: "🧪", earned: attempts.length >= 10 },
    { key: "tasks_25", title: "Finisher", description: "Complete 25 tasks", icon: "✅", earned: doneTasks >= 25 },
    { key: "coder_50", title: "Problem solver", description: "Solve 50 coding problems", icon: "💻", earned: coding >= 50 },
    { key: "cards_100", title: "Card shark", description: "Create 100 flashcards", icon: "🃏", earned: cards >= 100 },
  ];

  const existing = await Achievement.find({ userId }).lean();
  const existingKeys = new Set(existing.map((a) => a.key));
  const newlyUnlocked = rules.filter((r) => r.earned && !existingKeys.has(r.key));
  if (newlyUnlocked.length) {
    await Achievement.insertMany(
      newlyUnlocked.map((r) => ({
        userId,
        key: r.key,
        title: r.title,
        description: r.description,
        icon: r.icon,
        unlockedAt: new Date(),
      })),
    );
  }
  return rules;
}

router.get(
  "/achievements",
  asyncHandler(async (req, res) => {
    const rules = await evaluateAchievements(req.user._id);
    const unlocked = await Achievement.find({ userId: req.user._id }).lean();
    ok(res, {
      items: rules.map((r) => ({
        ...r,
        unlockedAt: unlocked.find((u) => u.key === r.key)?.unlockedAt || null,
      })),
      unlocked: unlocked.length,
      total: rules.length,
    });
  }),
);

module.exports = router;
module.exports.computeStreak = computeStreak;
module.exports.evaluateAchievements = evaluateAchievements;
