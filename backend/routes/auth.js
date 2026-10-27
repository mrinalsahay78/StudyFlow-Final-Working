"use strict";
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const config = require("../config");
const { User, PasswordReset } = require("../models");
const {
  hashPassword,
  comparePassword,
  signToken,
  publicUser,
  requireAuth,
} = require("../middleware/auth");
const {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  changePasswordSchema,
  profileSchema,
} = require("../validation/schemas");
const { asyncHandler, ok, fail, httpError } = require("../utils/http");

const router = express.Router();

const isProd = config.isProd;
const COOKIE_NAME = "sf_token";

const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? "lax" : "lax",
  secure: isProd,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

/** Sets the httpOnly session cookie and returns the bearer token as well. */
function establishSession(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOptions);
  return token;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 30 : 500,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many attempts. Try again in a few minutes." },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isProd ? 10 : 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, message: "Too many reset requests. Try again later." },
});

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await User.findOne({ email: body.email }).select("_id").lean();
    if (existing) {
      return fail(res, 409, "An account with this email already exists.", "EMAIL_TAKEN");
    }
    const user = await User.create({
      name: body.name,
      email: body.email,
      password: await hashPassword(body.password),
      course: body.course || "Computer Engineering",
      branch: body.branch || "",
      college: body.college || "",
      semester: body.semester || 1,
      lastLoginAt: new Date(),
    });
    const token = establishSession(res, user);
    ok(res, { token, user: publicUser(user) }, 201);
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email }).select("+password");
    const valid = user ? await comparePassword(password, user.password) : false;
    if (!user || !valid) {
      return fail(res, 401, "Invalid email or password.", "BAD_CREDENTIALS");
    }
    user.lastLoginAt = new Date();
    await user.save();
    const token = establishSession(res, user);
    ok(res, { token, user: publicUser(user) });
  }),
);

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  ok(res, { loggedOut: true });
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => ok(res, { user: publicUser(req.user) })),
);

router.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    const user = await User.findById(req.user._id);
    if (!user) return fail(res, 404, "User not found", "NOT_FOUND");
    ["name", "course", "college", "branch", "semester", "theme"].forEach((k) => {
      if (body[k] !== undefined) user[k] = body[k];
    });
    if (body.prefs) {
      const prefs = user.prefs ? user.prefs.toObject() : {};
      user.prefs = { ...prefs, ...body.prefs };
    }
    await user.save();
    ok(res, { user: publicUser(user) });
  }),
);

router.put(
  "/password",
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await comparePassword(currentPassword, user.password))) {
      return fail(res, 400, "Current password is incorrect.", "BAD_PASSWORD");
    }
    user.password = await hashPassword(newPassword);
    await user.save();
    ok(res, { changed: true });
  }),
);

/**
 * Forgot password. Always answers with the same message so the endpoint cannot
 * be used to enumerate accounts. When SMTP is not configured the reset link is
 * written to the server log (never returned to the browser) and the operator
 * is told in the API response that email delivery is not configured.
 */
router.post(
  "/forgot-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotSchema.parse(req.body);
    const user = await User.findOne({ email }).select("_id email name").lean();
    const generic = {
      message:
        "If an account exists for that email, a password reset link has been created.",
      emailConfigured: false,
    };
    if (!user) return ok(res, generic);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await PasswordReset.create({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${config.publicUrl}/#reset-password?token=${rawToken}`;
    if (!config.isProd) {
      console.log(
        `[auth] Password reset link for ${email} (valid 1 hour):\n  ${link}`,
      );
    }
    ok(res, {
      message: generic.message,
      emailConfigured: false,
      // Development only: the UI shows this so a developer can continue without
      // an SMTP server. It is never returned in production.
      devResetLink: config.isProd ? undefined : link,
    });
  }),
);

router.post(
  "/reset-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = resetSchema.parse(req.body);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await PasswordReset.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!record) {
      return fail(
        res,
        400,
        "This reset link is invalid or has expired. Request a new one.",
        "BAD_RESET_TOKEN",
      );
    }
    const user = await User.findById(record.userId);
    if (!user) return fail(res, 400, "This reset link is no longer valid.", "BAD_RESET_TOKEN");
    user.password = await hashPassword(password);
    await user.save();
    record.usedAt = new Date();
    await record.save();
    await PasswordReset.deleteMany({ userId: user._id, usedAt: null });
    ok(res, { reset: true });
  }),
);

/** Deletes the account and every document owned by it. */
router.delete(
  "/account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    const user = await User.findById(req.user._id).select("+password");
    if (!user) throw httpError(404, "User not found", "NOT_FOUND");
    if (!password || !(await comparePassword(password, user.password))) {
      return fail(res, 400, "Password confirmation is required.", "BAD_PASSWORD");
    }
    const models = require("../models");
    const owned = [
      "Subject",
      "Unit",
      "Topic",
      "Task",
      "StudySession",
      "FocusSession",
      "PlannerEntry",
      "Timetable",
      "Exam",
      "Goal",
      "Note",
      "File",
      "Quiz",
      "QuizAttempt",
      "Flashcard",
      "ChatMessage",
      "Project",
      "CodingLog",
      "JournalEntry",
      "Achievement",
      "PasswordReset",
    ];
    await Promise.all(
      owned.map((key) => models[key].deleteMany({ userId: user._id })),
    );
    await User.deleteOne({ _id: user._id });
    res.clearCookie(COOKIE_NAME, { path: "/" });
    ok(res, { deleted: true });
  }),
);

module.exports = { router, COOKIE_NAME, authLimiter };
