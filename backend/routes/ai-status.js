"use strict";
const express = require("express");
const config = require("../config");
const { asyncHandler, ok } = require("../utils/http");

const router = express.Router();

router.get("/status", (req, res) => {
  const configured = Boolean(config.ai.apiKey) && config.ai.provider !== "none";
  ok(res, {
    provider: configured ? config.ai.provider || "openai-compatible" : "none",
    model: configured ? config.ai.model : null,
    configured,
    hint: configured
      ? null
      : "Set AI_PROVIDER and AI_API_KEY in backend/.env (see .env.example) to enable the AI study assistant. Until then the assistant returns structured study frameworks that are clearly labelled as not model-generated.",
  });
});

module.exports = router;
