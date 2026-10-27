"use strict";
const mongoose = require("mongoose");

/** Normalise a value to a Date at 00:00:00 local server time. */
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** YYYY-MM-DD for the given date (local time). */
function dayKey(d = new Date()) {
  const x = new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Escape user input before building a RegExp from it. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isObjectId(value) {
  return mongoose.isValidObjectId(value) && String(value).length === 24;
}

/** 1-based page/size numbers with hard caps so a request cannot dump the DB. */
function pagination(query, defaultSize = 50, maxSize = 200) {
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(maxSize, Math.max(1, Number(query.limit) || defaultSize));
  return { page, size, skip: (page - 1) * size };
}

module.exports = {
  startOfDay,
  dayKey,
  addDays,
  escapeRegex,
  isObjectId,
  pagination,
};
