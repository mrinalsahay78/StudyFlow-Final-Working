"use strict";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { User } = require("../models");

const BCRYPT_ROUNDS = 12;

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash || "");

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    course: user.course,
    college: user.college,
    branch: user.branch,
    semester: user.semester,
    theme: user.theme,
    prefs: user.prefs,
    createdAt: user.createdAt,
  };
}

function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  if (req.cookies && req.cookies.sf_token) return req.cookies.sf_token;
  return null;
}

/**
 * Requires a valid session. Attaches `req.user` (a lean User document without
 * the password hash). Every downstream query MUST scope by req.user._id.
 */
async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Login required" });
    }
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ ok: false, message: "User not found" });
    }
    req.user = user;
    next();
  } catch (err) {
    const expired = err && err.name === "TokenExpiredError";
    res.status(401).json({
      ok: false,
      message: expired ? "Your session expired. Please log in again." : "Invalid session",
      code: expired ? "SESSION_EXPIRED" : "INVALID_SESSION",
    });
  }
}

/** Verify that a referenced document belongs to the current user. */
async function ownsDoc(Model, id, userId) {
  if (!id) return null;
  return Model.findOne({ _id: id, userId }).select("_id").lean();
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  publicUser,
  requireAuth,
  readToken,
  ownsDoc,
};
