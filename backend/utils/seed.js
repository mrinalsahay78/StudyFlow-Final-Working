"use strict";
/**
 * Seed data.
 *
 * By default this creates nothing at all: StudyFlow has no demo accounts and no
 * fake statistics. It only prepares indexes.
 *
 *   npm run seed              -> indexes only (safe on a live database)
 *   npm run seed:demo         -> indexes + a clearly-labelled demo account
 *
 * The demo account is only created when you explicitly ask for it, and its
 * email is SEED_DEMO_EMAIL / SEED_DEMO_PASSWORD from the environment (falling
 * back to demo@studyflow.local / StudyFlow-Demo-2026). Change or delete it
 * before sharing a deployment with anyone.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const models = require("../models");
const { hashPassword } = require("../middleware/auth");

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/studyflow";
const withDemo = process.argv.includes("--with-demo");

async function run() {
  await mongoose.connect(uri);
  console.log(`[seed] connected to ${uri}`);

  for (const [key, Model] of Object.entries(models)) {
    await Model.syncIndexes();
    console.log(`[seed] indexes ok: ${key}`);
  }

  if (!withDemo) {
    console.log(
      "[seed] no demo data created. Use `npm run seed:demo` if you want a labelled demo account.",
    );
    await mongoose.disconnect();
    return;
  }

  const email = (process.env.SEED_DEMO_EMAIL || "demo@studyflow.local").toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD || "StudyFlow-Demo-2026";
  const existing = await models.User.findOne({ email });
  if (existing) {
    console.log(`[seed] demo account already exists: ${email}`);
    await mongoose.disconnect();
    return;
  }
  const user = await models.User.create({
    name: "Demo Student",
    email,
    password: await hashPassword(password),
    course: "Computer Engineering",
    branch: "Computer",
    semester: 4,
    prefs: { dailyGoalMinutes: 120 },
  });
  const subject = await models.Subject.create({
    userId: user._id,
    name: "Data Structures & Algorithms",
    code: "DSA",
    color: "#6c5ce7",
    credits: 4,
    semester: 4,
    targetHours: 40,
  });
  const unit = await models.Unit.create({
    userId: user._id,
    subjectId: subject._id,
    title: "Unit 1 — Foundations",
    order: 0,
  });
  await models.Topic.insertMany([
    { userId: user._id, subjectId: subject._id, unitId: unit._id, title: "Time complexity", estimatedMinutes: 45 },
    { userId: user._id, subjectId: subject._id, unitId: unit._id, title: "Recursion", estimatedMinutes: 60 },
  ]);
  console.log(`[seed] demo account created: ${email} / ${password}`);
  console.log("[seed] This account is clearly labelled demo data — delete it before production use.");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[seed] failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
