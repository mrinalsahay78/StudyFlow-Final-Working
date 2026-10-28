import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Brain, Play, Plus, Search, Trash2, Trophy } from "lucide-react";
import { api, del, post } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill, Progress } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";

export default function Quizzes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [performance, setPerformance] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", subjectId: "", description: "", mode: "practice" });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api("/quiz/quizzes");
      setState({ loading: false, error: null, items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error, items: [] });
    }
  }, []);

  useEffect(() => {
    load();
    api("/quiz/performance").then(setPerformance).catch(() => setPerformance(null));
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter((item) => item.title.toLowerCase().includes(q));
  }, [state.items, query]);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const quiz = await post("/quiz/quizzes", {
        title: form.title.trim(),
        subjectId: form.subjectId || null,
        description: form.description,
        mode: form.mode,
        questions: [],
      });
      toast.success("Quiz created — now add questions");
      setModal(false);
      setForm({ title: "", subjectId: "", description: "", mode: "practice" });
      navigate(`/app/quizzes/${quiz._id}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (quiz) => {
    try {
      await del(`/quiz/quizzes/${quiz._id}`);
      toast.success("Quiz deleted");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Practice"
        title="Quizzes & flashcards"
        subtitle="Objective scoring — MCQ answers are checked against the stored key, never guessed."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setModal(true)}>
            New quiz
          </Button>
        }
      />

      {performance ? (
        <div className="grid grid-3 section-gap">
          <Card>
            <CardHeader icon={Trophy} title="Average accuracy" />
            <div className="row" style={{ gap: 14 }}>
              <strong style={{ fontSize: 30 }}>{performance.averageAccuracy}%</strong>
              <span className="muted small">
                from {performance.attempts} attempt{performance.attempts === 1 ? "" : "s"}
              </span>
            </div>
            <Progress value={performance.averageAccuracy} tone={performance.averageAccuracy >= 70 ? "success" : "warning"} />
          </Card>
          <Card>
            <CardHeader icon={BarChart3} title="Weak topics" subtitle="Below 60% across attempts" />
            {performance.weakTopics?.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {performance.weakTopics.slice(0, 4).map((t) => (
                  <div key={t.topic} className="stack" style={{ gap: 3 }}>
                    <div className="row-between small">
                      <span className="grow">{t.topic}</span>
                      <span className="muted tiny">
                        {t.correct}/{t.total}
                      </span>
                    </div>
                    <Progress value={t.accuracy} tone="danger" size="sm" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">
                {performance.attempts ? "No weak topics yet — nice." : "Take an attempt to see topic accuracy."}
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Flashcards" />
            <p className="muted small">
              Spaced repetition (SM-2) schedules each card by how you grade it: again, hard, good or easy.
            </p>
            <Link to="/app/flashcards" className="btn btn-ghost">
              <Brain size={15} /> Review flashcards
            </Link>
          </Card>
        </div>
      ) : null}

      <div className="toolbar section-gap">
        <div className="input-row" style={{ maxWidth: 280 }}>
          <Search size={15} className="muted" />
          <Input
            placeholder="Search quizzes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search quizzes"
          />
        </div>
        <div className="grow" />
        <Button variant="ghost" icon={Brain} onClick={() => navigate("/app/flashcards")}>
          Flashcards
        </Button>
      </div>

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={3} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Brain}
            title={query ? "No quizzes match your search" : "No quizzes yet"}
            body={
              query
                ? "Try a different title."
                : "Create a quiz, add MCQ or short-answer questions, then run it in practice or timed mode."
            }
            action={
              !query ? (
                <Button variant="primary" icon={Plus} onClick={() => setModal(true)}>
                  Create a quiz
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid grid-2">
          {filtered.map((quiz) => (
            <Card key={quiz._id}>
              <div className="row-between">
                <div className="stack" style={{ gap: 3 }}>
                  <strong>{quiz.title}</strong>
                  <span className="muted tiny">
                    {quiz.questionCount} question{quiz.questionCount === 1 ? "" : "s"}
                    {subjectName(quiz.subjectId) ? ` · ${subjectName(quiz.subjectId)}` : ""}
                  </span>
                </div>
                <Pill tone={quiz.mode === "timed" ? "warning" : "info"}>{quiz.mode || "practice"}</Pill>
              </div>
              {quiz.description ? <p className="muted small">{quiz.description}</p> : null}
              <div className="row-between">
                <span className="muted tiny">
                  {quiz.attemptCount ? `${quiz.attemptCount} attempts · best ${quiz.bestScore}%` : "Not attempted yet"}
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="icon-btn" title="Delete quiz" onClick={() => remove(quiz)}>
                    <Trash2 size={14} />
                  </button>
                  <Link to={`/app/quizzes/${quiz._id}/edit`} className="btn btn-ghost btn-sm">
                    Edit
                  </Link>
                  <Link
                    to={`/app/quizzes/${quiz._id}/run`}
                    className={`btn btn-primary btn-sm${quiz.questionCount ? "" : " disabled"}`}
                    aria-disabled={!quiz.questionCount}
                    onClick={(e) => {
                      if (!quiz.questionCount) e.preventDefault();
                    }}
                  >
                    <Play size={14} /> Start
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="New quiz">
        <form className="form-grid" onSubmit={create}>
          <Field label="Title" htmlFor="quiz-title" required>
            <Input
              id="quiz-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="DBMS — Normalisation"
              required
              autoFocus
            />
          </Field>
          <div className="form-row">
            <Field label="Subject" htmlFor="quiz-subject">
              <Select
                id="quiz-subject"
                value={form.subjectId}
                onChange={(e) => setForm((f) => ({ ...f, subjectId: e.target.value }))}
              >
                <option value="">No subject</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mode" htmlFor="quiz-mode">
              <Select
                id="quiz-mode"
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              >
                <option value="practice">Practice</option>
                <option value="timed">Timed</option>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="quiz-desc">
            <Textarea
              id="quiz-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this quiz covers"
            />
          </Field>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Create quiz
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
