import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Bug,
  CalendarRange,
  Eraser,
  FileText,
  Layers,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { api, del, post } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Select, Textarea } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Pill } from "../components/ui/Progress";
import { ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";

const MODES = [
  { value: "chat", label: "Ask anything", icon: MessageSquare, hint: "A direct, accurate answer." },
  { value: "explain", label: "Explain", icon: BookOpen, hint: "Concept, worked example, summary." },
  { value: "summarize", label: "Summarise", icon: FileText, hint: "Notes or a PDF into takeaways." },
  { value: "flashcards", label: "Flashcards", icon: Layers, hint: "Turn material into review cards." },
  { value: "quiz", label: "Quiz", icon: Brain, hint: "MCQs with answers and explanations." },
  { value: "debug", label: "Debug", icon: Bug, hint: "Root cause, then a corrected version." },
  { value: "revision_plan", label: "Revision plan", icon: CalendarRange, hint: "Day-by-day plan to a deadline." },
  { value: "viva", label: "Viva prep", icon: AlertTriangle, hint: "Questions with model answers." },
];

const LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/** Minimal, safe markdown: headings, bold, lists and inline code. No HTML injection. */
function renderMarkdown(text) {
  const blocks = String(text || "").split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    const isList = lines.every((l) => /^\s*([-*]|\d+[.)])\s+/.test(l));
    if (isList) {
      return (
        <ul key={bi} className="ai-list">
          {lines.map((l, li) => (
            <li key={li}>{inline(l.replace(/^\s*([-*]|\d+[.)])\s+/, ""))}</li>
          ))}
        </ul>
      );
    }
    if (/^#{1,4}\s/.test(block)) {
      const level = block.match(/^#+/)[0].length;
      const content = block.replace(/^#{1,4}\s/, "");
      const Tag = level <= 2 ? "h4" : "h5";
      return <Tag key={bi}>{inline(content)}</Tag>;
    }
    return (
      <p key={bi} className="ai-p">
        {lines.map((l, li) => (
          <React.Fragment key={li}>
            {inline(l)}
            {li < lines.length - 1 ? <br /> : null}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function inline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default function Assistant() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ mode: "chat", level: "intermediate", message: "", subjectId: "", noteId: "", fileId: "" });
  const [subjects, setSubjects] = useState([]);
  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const bottom = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [history, stat] = await Promise.all([api("/ai/history"), api("/ai/status")]);
      setMessages(history.items || []);
      setStatus(stat);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
    api("/library/notes").then((d) => setNotes(d.items || [])).catch(() => setNotes([]));
    api("/library/files").then((d) => setFiles((d.items || []).filter((f) => f.hasText))).catch(() => setFiles([]));
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  const send = async (e) => {
    e?.preventDefault();
    const message = form.message.trim();
    if (!message || sending) return;
    setSending(true);
    const optimistic = {
      _id: `local_${Date.now()}`,
      role: "user",
      content: message,
      mode: form.mode,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setForm((f) => ({ ...f, message: "" }));
    try {
      const data = await post("/ai/chat", {
        message,
        mode: form.mode,
        level: form.level,
        subjectId: form.subjectId || null,
        noteId: form.noteId || null,
        fileId: form.fileId || null,
      });
      setMessages((m) => [...m, { ...data.reply, generated: data.generated, provider: data.provider }]);
      if (data.artefacts?.type === "flashcards" && data.artefacts.cards?.length) {
        await saveCards(data.artefacts.cards);
      }
      if (data.artefacts?.type === "quiz" && data.artefacts.questions?.length) {
        toast.info(
          `The assistant produced ${data.artefacts.questions.length} quiz questions — review them in Quizzes before running.`,
        );
      }
      if (!data.generated) {
        toast.info("No AI provider configured — showing the built-in framework instead.");
      }
    } catch (err) {
      toast.error(err.message);
      setMessages((m) => m.filter((x) => x._id !== optimistic._id));
    } finally {
      setSending(false);
    }
  };

  const saveCards = async (cards) => {
    try {
      const created = await post("/quiz/flashcards/bulk", {
        items: cards.map((c) => ({ front: c.front, back: c.back, subjectId: form.subjectId || null, tags: ["ai"] })),
      });
      toast.success(`${created.created} flashcards saved to your deck`);
    } catch (err) {
      toast.error(`Could not save flashcards: ${err.message}`);
    }
  };

  const clearHistory = async () => {
    try {
      await del("/ai/history");
      setMessages([]);
      toast.success("Conversation cleared");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const activeMode = MODES.find((m) => m.value === form.mode) || MODES[0];

  return (
    <div>
      <PageHeader
        eyebrow="Assistant"
        title="Study assistant"
        subtitle="Grounded in your own notes, syllabus and uploaded documents."
        actions={
          <>
            {status ? (
              <Pill tone={status.configured ? "success" : "warning"}>
                {status.configured ? `${status.provider} · ${status.model}` : "No provider configured"}
              </Pill>
            ) : null}
            <Button icon={Eraser} onClick={clearHistory} disabled={!messages.length}>
              Clear
            </Button>
          </>
        }
      />

      {status && !status.configured ? (
        <Card className="section-gap">
          <div className="row" style={{ gap: 10 }}>
            <AlertTriangle size={16} />
            <p className="small muted">
              {status.hint} Until then, replies are a built-in study framework and are labelled as such — never
              presented as model output.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="ai-layout section-gap">
        <Card className="ai-chat">
          <CardHeader
            icon={Sparkles}
            title="Conversation"
            subtitle={`${messages.length} message${messages.length === 1 ? "" : "s"} in history`}
          />

          <div className="chat-scroll">
            {error ? (
              <ErrorState error={error} onRetry={load} />
            ) : loading ? (
              <SkeletonRows rows={3} />
            ) : messages.length === 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted small">
                  Ask about a topic, paste an error, or pick a mode to turn your notes into flashcards.
                </p>
                <div className="grid grid-2">
                  {[
                    "Explain virtual memory with a worked example",
                    "Summarise my last DBMS note into 5 takeaways",
                    "What are the four conditions for deadlock?",
                    "Build a 7-day revision plan for my next exam",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      className="note-item"
                      onClick={() => setForm((f) => ({ ...f, message: prompt }))}
                    >
                      <span className="small">{prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m._id} className={`chat-msg ${m.role}`}>
                  <span className="chat-role">
                    {m.role === "user" ? "You" : "StudyFlow AI"}
                    {m.role === "assistant" && m.generated === false ? " · framework" : ""}
                  </span>
                  <div className="chat-body">
                    {m.role === "assistant" ? renderMarkdown(m.content) : <p className="ai-p">{m.content}</p>}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="chat-msg assistant">
                <span className="chat-role">StudyFlow AI</span>
                <div className="chat-body">
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottom} />
          </div>

          <form className="chat-composer" onSubmit={send}>
            <Textarea
              rows={2}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder={`${activeMode.label} — ${activeMode.hint}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Message"
            />
            <Button variant="primary" icon={Send} type="submit" loading={sending} disabled={!form.message.trim()}>
              Send
            </Button>
          </form>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Mode" subtitle="Shapes the instructions, not the facts." />
            <div className="stack" style={{ gap: 4 }}>
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    className={`mode-row${form.mode === m.value ? " active" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, mode: m.value }))}
                  >
                    <Icon size={14} />
                    <span className="grow">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Ground it in your work" subtitle="Optional — improves accuracy." />
            <div className="form-grid">
              <Field label="Level" htmlFor="ai-level">
                <Select
                  id="ai-level"
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                >
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject" htmlFor="ai-subject">
                <Select
                  id="ai-subject"
                  value={form.subjectId}
                  onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
                >
                  <option value="">None</option>
                  {subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note" htmlFor="ai-note">
                <Select
                  id="ai-note"
                  value={form.noteId}
                  onChange={(e) => setForm((f) => ({ ...f, noteId: e.target.value }))}
                >
                  <option value="">None</option>
                  {notes.slice(0, 50).map((n) => (
                    <option key={n._id} value={n._id}>
                      {n.title || "Untitled note"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Document" htmlFor="ai-file" hint="Only files with extracted text.">
                <Select
                  id="ai-file"
                  value={form.fileId}
                  onChange={(e) => setForm((f) => ({ ...f, fileId: e.target.value }))}
                >
                  <option value="">None</option>
                  {files.slice(0, 50).map((fitem) => (
                    <option key={fitem._id} value={fitem._id}>
                      {fitem.originalName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Link to="/app/library" className="btn btn-ghost btn-sm">
              <Upload size={14} /> Upload more material
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
