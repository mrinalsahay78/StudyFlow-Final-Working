"use strict";
/**
 * Migration runner.
 *
 * v7 stored every planner item in a separate collection with its own shape.
 * v8 keeps those documents (no data is dropped) and adds the fields the new
 * models need, so existing accounts keep working after the upgrade.
 *
 * Safe to run repeatedly. Usage:  npm run migrate
 */
require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studyflow";

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`[migrate] connected to ${uri}`);

  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);
  console.log(`[migrate] collections: ${names.join(", ") || "(none)"}`);

  /* ---------------------------------------------------------------- users */
  if (names.includes("users")) {
    const users = db.collection("users");
    const missingPrefs = await users.updateMany(
      { prefs: { $exists: false } },
      {
        $set: {
          prefs: {
            dailyGoalMinutes: 120,
            studyDays: [1, 2, 3, 4, 5, 6],
            dayStart: "09:00",
            dayEnd: "22:00",
            pomodoroFocus: 25,
            pomodoroBreak: 5,
            notifications: true,
            dashboardWidgets: [
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
      },
    );
    const defaultFields = await users.updateMany(
      { branch: { $exists: false } },
      { $set: { branch: "", college: "", semester: 1 } },
    );
    console.log(
      `[migrate] users: prefs added ${missingPrefs.modifiedCount}, profile fields added ${defaultFields.modifiedCount}`,
    );
  }

  /* -------------------------------------------------------------- subjects */
  if (names.includes("subjects")) {
    const res = await db.collection("subjects").updateMany(
      { completed: { $exists: false } },
      { $set: { completed: false, completedAt: null } },
    );
    const res2 = await db.collection("subjects").updateMany(
      { credits: { $exists: false } },
      { $set: { credits: 0, semester: null, faculty: "", resources: [] } },
    );
    console.log(`[migrate] subjects: completion ${res.modifiedCount}, credits ${res2.modifiedCount}`);
  }

  /* ----------------------------------------------------------------- tasks */
  if (names.includes("tasks")) {
    const res = await db.collection("tasks").updateMany(
      { type: { $exists: false } },
      { $set: { type: "task", estimatedMinutes: 30, tags: [], checklist: [] } },
    );
    const res2 = await db.collection("tasks").updateMany(
      { status: { $exists: false } },
      { $set: { status: "todo" } },
    );
    const res3 = await db.collection("tasks").updateMany(
      { completed: { $exists: false } },
      { $set: { completed: false, completedAt: null } },
    );
    // Old "assignments" collection (if any) is folded into tasks.
    if (names.includes("assignments")) {
      const assignments = await db.collection("assignments").find({}).toArray();
      let moved = 0;
      for (const a of assignments) {
        const exists = await db.collection("tasks").findOne({ _id: a._id });
        if (exists) continue;
        await db.collection("tasks").insertOne({
          _id: a._id,
          userId: a.userId,
          title: a.title,
          description: a.description || "",
          type: "assignment",
          subjectId: a.subjectId || null,
          priority: a.priority || "medium",
          status:
            a.status === "submitted" || a.completed ? "done" : a.status === "late" ? "in_progress" : "todo",
          dueDate: a.dueDate || "",
          dueTime: "",
          estimatedMinutes: 60,
          tags: [],
          notes: "",
          checklist: [],
          recurring: "none",
          completed: Boolean(a.completed) || a.status === "submitted",
          completedAt: a.completedAt || null,
          createdAt: a.createdAt || new Date(),
          updatedAt: a.updatedAt || new Date(),
        });
        moved += 1;
      }
      console.log(`[migrate] tasks: type added ${res.modifiedCount}, status ${res2.modifiedCount}, completion ${res3.modifiedCount}, assignments folded in ${moved}`);
    } else {
      console.log(`[migrate] tasks: type added ${res.modifiedCount}, status ${res2.modifiedCount}, completion ${res3.modifiedCount}`);
    }
  }

  /* -------------------------------------------------------------- sessions */
  if (names.includes("sessions")) {
    const res = await db.collection("sessions").updateMany(
      { mode: { $exists: false } },
      { $set: { mode: "manual", source: "manual", interruptions: 0 } },
    );
    console.log(`[migrate] sessions: mode/source added ${res.modifiedCount}`);
  }

  /* ------------------------------------------------------------ timetables */
  if (names.includes("timetables")) {
    const res = await db.collection("timetables").updateMany(
      { completed: { $exists: false } },
      { $set: { completed: false, completedAt: null, room: "" } },
    );
    console.log(`[migrate] timetables: completion added ${res.modifiedCount}`);
  }

  /* ---------------------------------------------------------- other colls */
  for (const name of ["exams", "goals"]) {
    if (!names.includes(name)) continue;
    const res = await db.collection(name).updateMany(
      { completed: { $exists: false } },
      { $set: { completed: false, completedAt: null } },
    );
    console.log(`[migrate] ${name}: completion added ${res.modifiedCount}`);
  }

  /* --------------------------------------------------------------- indexes */
  const models = require("../models");
  for (const [key, Model] of Object.entries(models)) {
    try {
      await Model.syncIndexes();
      console.log(`[migrate] indexes synced: ${key}`);
    } catch (err) {
      console.warn(`[migrate] index sync failed for ${key}: ${err.message}`);
    }
  }

  console.log("[migrate] done");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[migrate] failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
