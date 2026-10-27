"use strict";
/**
 * AI study assistant.
 *
 * The provider is configured entirely through environment variables and is
 * called server side only; the browser never sees the key. Supported providers
 * are any OpenAI-compatible chat-completions endpoint (OpenAI, Groq, Together,
 * OpenRouter, local Ollama / LM Studio, ...).
 *
 * When no key is configured the endpoint still answers, but the response is
 * clearly marked `generated: false` and labelled as a built-in framework — it
 * never pretends to be model output.
 */
const express = require("express");
const config = require("../config");
const { ChatMessage, Note, File, Subject, Topic, Task, Quiz, Flashcard } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { aiChat } = require("../validation/schemas");
const { asyncHandler, ok, fail } = require("../utils/http");
const { dayKey } = require("../utils/date");

const router = express.Router();
router.use(requireAuth);

const MODE_PROMPTS = {
  explain:
    "Explain the concept clearly for an engineering undergraduate. Use short paragraphs, a worked example, and a one-line summary.",
  summarize:
    "Summarise the supplied material into: key ideas, definitions, formulas, and 5 exam-focused takeaways.",
  flashcards:
    "Create 8 flashcards from the material. Return them as a numbered list of `Front — Back` pairs, one per line, no extra commentary.",
  quiz:
    "Write 8 multiple-choice questions from the material. Each question must have 4 options labelled A-D, then `Answer: X` and a one-line explanation.",
  debug:
    "Explain the programming error, state the root cause, then give a corrected version of the code and why it works.",
  revision_plan:
    "Build a day-by-day revision plan for the given subject and deadline. Keep each day to 2-4 concrete sessions with topic names and minutes.",
  viva:
    "Generate viva / interview questions on the topic, from fundamentals to advanced, with a short model answer for each.",
  chat: "Answer the student's question accurately and concisely.",
};

const LEVEL_PROMPTS = {
  beginner: "Assume no prior knowledge and define every term.",
  intermediate: "Assume the student knows the basics; focus on mechanics and common mistakes.",
  advanced: "Assume strong fundamentals; include edge cases, complexity and exam-level nuance.",
};

function providerConfigured() {
  return Boolean(config.ai.apiKey) && config.ai.provider && config.ai.provider !== "none";
}

async function callProvider(messages) {
  const url = `${config.ai.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature: 0.4,
        max_tokens: 1400,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Provider responded ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    const data = JSON.parse(text);
    const content =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    if (!content) throw new Error("Provider returned an empty response");
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deterministic fallback used when no provider key exists. It is built from the
 * student's own data so it is still useful, and it is explicitly labelled.
 */
function fallbackAnswer({ mode, message, level, context }) {
  const lines = [];
  lines.push(
    "AI provider not configured — this is a built-in study framework, not a model-generated answer.",
  );
  lines.push("");
  if (context.length) {
    lines.push("From your own study data:");
    context.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }
  const heading = {
    explain: `How to work through "${message}"`,
    summarize: `How to summarise this material`,
    flashcards: `How to turn this into flashcards`,
    quiz: `How to build a quiz from this`,
    debug: `How to debug this systematically`,
    revision_plan: `How to plan this revision`,
    viva: `How to prepare viva answers`,
    chat: `How to approach this question`,
  }[mode] || "Suggested approach";
  lines.push(heading);
  const steps = {
    explain: [
      "Write the definition in one sentence without looking at notes.",
      "Draw the mechanism or data flow from memory, then check it.",
      "Solve one numerical or trace-based example by hand.",
      "List two exam-style questions you could now answer.",
    ],
    summarize: [
      "Read once for structure, then write the section headings only.",
      "Under each heading, add 3 bullet points in your own words.",
      "Highlight every formula and its variables.",
      "Finish with 5 one-line takeaways you can revise in a minute.",
    ],
    flashcards: [
      "One card per definition, one per formula, one per worked step.",
      "Keep the front to a single question; the back to a single answer.",
      "Add a topic tag so weak-topic tracking works after quizzes.",
      "Review the deck tomorrow, then at 3 days, then weekly.",
    ],
    quiz: [
      "Convert each definition into a 'which of the following' question.",
      "Turn each formula into a 'compute the value' question.",
      "Add two questions from past papers on the same unit.",
      "Target 8 questions per unit for a 15 minute practice run.",
    ],
    debug: [
      "Read the exact error line and the first stack frame.",
      "Reproduce with the smallest possible input.",
      "Print or log the values entering the failing function.",
      "Fix the cause, then re-run the original case and an edge case.",
    ],
    revision_plan: [
      "List the units you have not revised and their estimated minutes.",
      "Give the closest exam the earliest slots, hardest units first.",
      "Keep one revision pass and one practice-test slot per day.",
      "Leave the last 48 hours free for full mock papers.",
    ],
    viva: [
      "Start with definitions and units.",
      "Prepare one 'why' and one 'what if' answer per topic.",
      "Rehearse a 60-second answer aloud for each.",
      "Note the two topics you cannot explain yet and revise those first.",
    ],
    chat: [
      "State what you already know about it.",
      "Identify the specific part that is unclear.",
      "Work one example end to end.",
      "Write the rule you would apply next time.",
    ],
  }[mode] || ["Break the problem into the smallest parts.", "Check each part against your notes.", "Write the conclusion in your own words."];
  steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");
  lines.push(`Level: ${level}. Add AI_PROVIDER and AI_API_KEY in backend/.env to get a real model answer.`);
  return lines.join("\n");
}

/** Collect grounding context from the user's own records. */
async function buildContext(req, body) {
  const parts = [];
  const facts = [];
  if (body.noteId) {
    const note = await Note.findOne({ _id: body.noteId, userId: req.user._id }).lean();
    if (note) {
      parts.push(`Student note titled "${note.title}":\n${note.body.slice(0, 8000)}`);
      facts.push(`Note used: ${note.title}`);
    }
  }
  if (body.fileId) {
    const file = await File.findOne({ _id: body.fileId, userId: req.user._id }).lean();
    if (file && file.extractedText) {
      parts.push(
        `Uploaded document "${file.originalName}" (extracted text):\n${file.extractedText.slice(0, 8000)}`,
      );
      facts.push(`Document used: ${file.originalName}`);
    }
  }
  if (body.subjectId) {
    const [subject, topics, openTasks] = await Promise.all([
      Subject.findOne({ _id: body.subjectId, userId: req.user._id }).lean(),
      Topic.find({ userId: req.user._id, subjectId: body.subjectId })
        .select("title status estimatedMinutes")
        .limit(60)
        .lean(),
      Task.find({ userId: req.user._id, subjectId: body.subjectId, status: { $ne: "done" } })
        .select("title dueDate")
        .limit(20)
        .lean(),
    ]);
    if (subject) {
      parts.push(`Subject: ${subject.name} (${subject.code || "no code"})`);
      facts.push(`Subject: ${subject.name}`);
      const pending = topics.filter((t) => t.status !== "mastered");
      if (pending.length) {
        parts.push(
          `Unfinished topics: ${pending.map((t) => t.title).join("; ").slice(0, 1500)}`,
        );
        facts.push(`${pending.length} unfinished topics in this subject`);
      }
      if (openTasks.length) {
        parts.push(
          `Open tasks: ${openTasks.map((t) => `${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`).join("; ")}`,
        );
      }
    }
  }
  if (body.code) parts.push(`Code / error supplied:\n${body.code.slice(0, 6000)}`);
  return { prompt: parts.join("\n\n"), facts };
}

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    ok(res, {
      configured: providerConfigured(),
      provider: providerConfigured() ? config.ai.provider : "none",
      model: providerConfigured() ? config.ai.model : null,
      hint: providerConfigured()
        ? null
        : "Set AI_PROVIDER=openai (or any OpenAI-compatible provider) and AI_API_KEY in backend/.env. See backend/.env.example.",
    });
  }),
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const items = await ChatMessage.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();
    ok(res, { items: items.reverse() });
  }),
);

router.delete(
  "/history",
  asyncHandler(async (req, res) => {
    await ChatMessage.deleteMany({ userId: req.user._id });
    ok(res, { cleared: true });
  }),
);

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const body = aiChat.parse(req.body);
    const mode = body.mode || "chat";
    const level = body.level || "intermediate";
    const { prompt: context, facts } = await buildContext(req, body);

    await ChatMessage.create({
      userId: req.user._id,
      role: "user",
      content: body.message,
      mode,
      subjectId: body.subjectId || null,
    });

    let answer;
    let generated = false;
    let provider = "none";
    let model = null;

    if (providerConfigured()) {
      const system = [
        "You are StudyFlow AI, a study assistant for engineering undergraduates.",
        "Be accurate and concise. Use markdown headings and short lists.",
        "If the supplied material does not contain the answer, say so instead of inventing facts.",
        MODE_PROMPTS[mode] || MODE_PROMPTS.chat,
        LEVEL_PROMPTS[level],
      ].join(" ");
      const userContent = context
        ? `${body.message}\n\n---\nReference material from the student's workspace:\n${context}`
        : body.message;
      try {
        answer = await callProvider([
          { role: "system", content: system },
          { role: "user", content: userContent },
        ]);
        generated = true;
        provider = config.ai.provider;
        model = config.ai.model;
      } catch (err) {
        console.error("[ai] provider call failed:", err.message);
        answer = `The configured AI provider could not be reached (${err.message.slice(0, 160)}).\n\n${fallbackAnswer({ mode, message: body.message, level, context: facts })}`;
      }
    } else {
      answer = fallbackAnswer({ mode, message: body.message, level, context: facts });
    }

    const saved = await ChatMessage.create({
      userId: req.user._id,
      role: "assistant",
      content: answer,
      mode,
      provider,
      model,
      subjectId: body.subjectId || null,
    });

    // Mode-specific artefacts: turning a reply into real records the student
    // can then edit. Parsing only happens for clearly structured replies.
    let artefacts = null;
    if (generated && mode === "flashcards") {
      artefacts = { type: "flashcards", cards: parseFlashcards(answer) };
    } else if (generated && mode === "quiz") {
      artefacts = { type: "quiz", questions: parseQuiz(answer) };
    }

    ok(res, {
      reply: { ...saved.toObject() },
      generated,
      provider,
      model,
      context: facts,
      artefacts,
    });
  }),
);

/** "Front — Back" lines into flashcard objects. */
function parseFlashcards(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter((line) => line.includes("—") || line.includes(" - "))
    .map((line) => {
      const sep = line.includes("—") ? "—" : " - ";
      const [front, ...rest] = line.split(sep);
      return { front: front.trim().slice(0, 300), back: rest.join(sep).trim().slice(0, 2000) };
    })
    .filter((c) => c.front && c.back)
    .slice(0, 20);
}

/** Parses "A) ..." options with "Answer: B" into quiz questions. */
function parseQuiz(text) {
  const blocks = text.split(/\n\s*\n/);
  const questions = [];
  blocks.forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const promptLine = lines.find((l) => /^\d+[.)]/.test(l) || l.endsWith("?"));
    if (!promptLine) return;
    const options = lines
      .filter((l) => /^[A-D][).]\s/.test(l))
      .map((l) => l.replace(/^[A-D][).]\s/, "").trim());
    const answerLine = lines.find((l) => /answer\s*[:\-]/i.test(l));
    if (options.length < 2 || !answerLine) return;
    const letter = (answerLine.match(/answer\s*[:\-]\s*\(?([A-D])/i) || [])[1];
    if (!letter) return;
    const explanation = lines.find((l) => /^explanation\s*[:\-]/i.test(l));
    questions.push({
      prompt: promptLine.replace(/^\d+[.)]\s*/, "").trim(),
      type: "mcq",
      options,
      answerIndex: letter.toUpperCase().charCodeAt(0) - 65,
      answerText: "",
      explanation: explanation ? explanation.replace(/^explanation\s*[:\-]\s*/i, "") : "",
    });
  });
  return questions.slice(0, 20);
}

module.exports = router;
module.exports.providerConfigured = providerConfigured;
