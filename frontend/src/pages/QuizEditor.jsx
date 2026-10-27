import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Play, Plus, Save, Trash2 } from "lucide-react";
import { api, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Pill } from "../components/ui/Progress";
import { ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";

const emptyQuestion = () => ({
  _id: `q_${Math.random().toString(36).slice(2, 10)}`,
  type: "mcq",
  prompt: "",
  options: ["", "", "", ""],
  answerIndex: 0,
  answerText: "",
  explanation: "",
  topicTitle: "",
});

export default function QuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, quiz: null });
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, quiz: null });
    try {
      // withAnswers=true returns the answer key so the editor can show it.
      const quiz = await api(`/quiz/quizzes/${id}?withAnswers=true`);
      setState({ loading: false, error: null, quiz });
      setQuestions(quiz.questions || []);
      setDirty(false);
    } catch (error) {
      setState({ loading: false, error, quiz: null });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const patchQuestion = (index, changes) => {
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...changes } : q)));
    setDirty(true);
  };

  const addQuestion = (type) => {
    setQuestions((list) => [...list, { ...emptyQuestion(), type }]);
    setDirty(true);
  };

  const removeQuestion = (index) => {
    setQuestions((list) => list.filter((_, i) => i !== index));
    setDirty(true);
  };

  const save = async () => {
    const invalid = questions.findIndex((q) => {
      if (!q.prompt.trim()) return true;
      if (q.type === "mcq") return q.options.filter((o) => o.trim()).length < 2 || !q.options[q.answerIndex]?.trim();
      return !q.answerText.trim();
    });
    if (invalid >= 0) {
      toast.error(`Question ${invalid + 1} is incomplete.`);
      return;
    }
    setSaving(true);
    try {
      await put(`/quiz/quizzes/${id}`, {
        title: state.quiz.title,
        description: state.quiz.description || "",
        mode: state.quiz.mode || "practice",
        subjectId: state.quiz.subjectId || null,
        questions: questions.map((q) => ({
          _id: q._id,
          type: q.type,
          prompt: q.prompt.trim(),
          options: q.type === "mcq" ? q.options.map((o) => o.trim()).filter(Boolean) : [],
          answerIndex: q.type === "mcq" ? Number(q.answerIndex) : null,
          answerText: q.type === "short" ? q.answerText.trim() : "",
          explanation: q.explanation || "",
          topicTitle: q.topicTitle || "",
        })),
      });
      toast.success("Quiz saved");
      setDirty(false);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  // The answer key is used by the runner only through the server; never persisted client-side.
  useEffect(() => {
    if (dirty) window.onbeforeunload = () => "You have unsaved questions.";
    return () => {
      window.onbeforeunload = null;
    };
  }, [dirty]);

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (state.loading || !state.quiz) {
    return (
      <>
        <PageHeader title="Quiz" subtitle="Loading…" />
        <SkeletonRows rows={4} />
      </>
    );
  }

  const quiz = state.quiz;

  return (
    <div>
      <Link to="/app/quizzes" className="row muted small" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> All quizzes
      </Link>

      <PageHeader
        eyebrow={quiz.mode || "practice"}
        title={quiz.title}
        subtitle={`${questions.length} question${questions.length === 1 ? "" : "s"}${
          quiz.attemptCount ? ` · ${quiz.attemptCount} attempts · best ${quiz.bestScore}%` : ""
        }`}
        actions={
          <>
            <Button icon={Save} variant="primary" loading={saving} onClick={save} disabled={!dirty}>
              Save quiz
            </Button>
            <Button
              icon={Play}
              disabled={!questions.length}
              onClick={() => navigate(`/app/quizzes/${id}/run`)}
            >
              Start quiz
            </Button>
          </>
        }
      />

      {dirty ? <Pill tone="warning">Unsaved changes</Pill> : null}

      <div className="stack section-gap">
        {questions.map((q, index) => (
          <Card key={q._id || index}>
            <div className="row-between">
              <span className="muted small">
                Question {index + 1} · {q.type === "mcq" ? "Multiple choice" : "Short answer"}
              </span>
              <div className="row" style={{ gap: 4 }}>
                <Select
                  value={q.type}
                  onChange={(e) => patchQuestion(index, { type: e.target.value })}
                  style={{ height: 30, fontSize: 12, width: 140 }}
                  aria-label="Question type"
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="short">Short answer</option>
                </Select>
                <button className="icon-btn" onClick={() => removeQuestion(index)} title="Delete question">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <Field label="Prompt" htmlFor={`prompt-${index}`} required>
              <Textarea
                id={`prompt-${index}`}
                value={q.prompt}
                onChange={(e) => patchQuestion(index, { prompt: e.target.value })}
                placeholder="Which normal form removes transitive dependencies?"
              />
            </Field>

            {q.type === "mcq" ? (
              <div className="stack" style={{ gap: 6 }}>
                <span className="label">Options — click the circle to mark the correct answer</span>
                {q.options.map((opt, oi) => (
                  <div className="option-row" key={oi}>
                    <button
                      className={`radio-dot${q.answerIndex === oi ? " active" : ""}`}
                      onClick={() => patchQuestion(index, { answerIndex: oi })}
                      aria-label={`Mark option ${oi + 1} correct`}
                      type="button"
                    >
                      {q.answerIndex === oi ? <Check size={12} /> : null}
                    </button>
                    <Input
                      value={opt}
                      onChange={(e) =>
                        patchQuestion(index, {
                          options: q.options.map((o, j) => (j === oi ? e.target.value : o)),
                        })
                      }
                      placeholder={`Option ${oi + 1}`}
                    />
                    {q.options.length > 2 ? (
                      <button
                        className="icon-btn"
                        type="button"
                        onClick={() =>
                          patchQuestion(index, {
                            options: q.options.filter((_, j) => j !== oi),
                            answerIndex: q.answerIndex >= q.options.length - 1 ? 0 : q.answerIndex,
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() => patchQuestion(index, { options: [...q.options, ""] })}
                >
                  Add option
                </Button>
              </div>
            ) : (
              <Field label="Expected answer" htmlFor={`answer-${index}`} hint="Matched case-insensitively, with keyword overlap allowed.">
                <Input
                  id={`answer-${index}`}
                  value={q.answerText}
                  onChange={(e) => patchQuestion(index, { answerText: e.target.value })}
                  placeholder="Third normal form"
                />
              </Field>
            )}

            <div className="form-row">
              <Field label="Topic" htmlFor={`topic-${index}`} hint="Used to spot weak topics.">
                <Input
                  id={`topic-${index}`}
                  value={q.topicTitle}
                  onChange={(e) => patchQuestion(index, { topicTitle: e.target.value })}
                  placeholder="Normalisation"
                />
              </Field>
              <Field label="Explanation" htmlFor={`explanation-${index}`}>
                <Input
                  id={`explanation-${index}`}
                  value={q.explanation}
                  onChange={(e) => patchQuestion(index, { explanation: e.target.value })}
                  placeholder="Shown after answering"
                />
              </Field>
            </div>
          </Card>
        ))}

        {questions.length === 0 ? (
          <Card>
            <CardHeader title="No questions yet" subtitle="Add MCQ or short-answer questions below." />
          </Card>
        ) : null}

        <div className="row">
          <Button icon={Plus} onClick={() => addQuestion("mcq")}>
            Add multiple choice
          </Button>
          <Button icon={Plus} onClick={() => addQuestion("short")}>
            Add short answer
          </Button>
        </div>
      </div>
    </div>
  );
}
