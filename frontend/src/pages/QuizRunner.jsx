import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, RotateCcw, Send, XCircle } from "lucide-react";
import { api, post } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Pill, Progress } from "../components/ui/Progress";
import { ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { secondsToClock } from "../lib/format";

export default function QuizRunner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, quiz: null });
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setState({ loading: true, error: null, quiz: null });
    try {
      // Answers are stripped by the server for the practice view.
      const quiz = await api(`/quiz/quizzes/${id}`);
      setState({ loading: false, error: null, quiz });
      setAnswers({});
      setIndex(0);
      setResult(null);
      setElapsed(0);
      startedAt.current = Date.now();
    } catch (error) {
      setState({ loading: false, error, quiz: null });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (result) return undefined;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [result]);

  const questions = state.quiz?.questions || [];
  const current = questions[index];
  const answered = Object.values(answers).filter((v) => String(v ?? "").trim() !== "").length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        answers: questions.map((q) => ({
          questionId: q._id,
          given: String(answers[q._id] ?? ""),
        })),
      };
      const data = await post(`/quiz/quizzes/${id}/attempts`, payload);
      setResult(data);
      toast.success(`Scored ${data.attempt.accuracy}%`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (state.loading || !state.quiz) {
    return (
      <>
        <PageHeader title="Quiz" subtitle="Loading…" />
        <SkeletonRows rows={3} />
      </>
    );
  }

  if (!questions.length) {
    return (
      <div>
        <PageHeader title={state.quiz.title} subtitle="This quiz has no questions yet." />
        <Card>
          <Link className="btn btn-primary" to={`/app/quizzes/${id}`}>
            Add questions
          </Link>
        </Card>
      </div>
    );
  }

  if (result) {
    const attempt = result.attempt;
    return (
      <div>
        <PageHeader
          eyebrow="Result"
          title={`${attempt.score} / ${attempt.total} correct`}
          subtitle={`${attempt.accuracy}% accuracy in ${secondsToClock(attempt.durationSeconds)}`}
          actions={
            <>
              <Button icon={RotateCcw} onClick={load}>
                Try again
              </Button>
              <Button variant="primary" icon={ArrowLeft} onClick={() => navigate("/app/quizzes")}>
                Back to quizzes
              </Button>
            </>
          }
        />

        <Card className="section-gap">
          <div className="row" style={{ gap: 16 }}>
            <strong style={{ fontSize: 34 }}>{attempt.accuracy}%</strong>
            <div className="grow">
              <Progress value={attempt.accuracy} tone={attempt.accuracy >= 70 ? "success" : "warning"} />
              <span className="muted tiny">
                {attempt.accuracy >= 70
                  ? "Above your target — keep this topic warm with a revision block."
                  : "Below 60% on a topic? The planner will surface it as a weak topic."}
              </span>
            </div>
          </div>
        </Card>

        <div className="stack section-gap">
          {result.review.map((r, i) => (
            <Card key={r.questionId}>
              <div className="row-between">
                <span className="muted small">
                  Question {i + 1}
                  {r.topicTitle ? ` · ${r.topicTitle}` : ""}
                </span>
                <Pill tone={r.correct ? "success" : "danger"}>
                  {r.correct ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {r.correct ? "Correct" : "Incorrect"}
                </Pill>
              </div>
              <strong className="small">{r.prompt}</strong>
              {r.type === "mcq" ? (
                <div className="stack" style={{ gap: 4 }}>
                  {r.options.map((opt, oi) => {
                    const isCorrect = oi === r.answerIndex;
                    const isGiven = String(oi) === String(r.given);
                    return (
                      <div
                        key={oi}
                        className={`review-option${isCorrect ? " correct" : ""}${isGiven && !isCorrect ? " wrong" : ""}`}
                      >
                        <span>{opt}</span>
                        {isCorrect ? <CheckCircle2 size={13} /> : null}
                        {isGiven && !isCorrect ? <XCircle size={13} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  <span className="small">
                    Your answer: <strong>{r.given || "(blank)"}</strong>
                  </span>
                  <span className="muted small">Expected: {r.answerText}</span>
                </div>
              )}
              {r.explanation ? <p className="muted small">{r.explanation}</p> : null}
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={state.quiz.mode || "practice"}
        title={state.quiz.title}
        subtitle={`Question ${index + 1} of ${questions.length} · ${answered} answered`}
        actions={
          <Pill tone="info">
            <Clock size={12} /> {secondsToClock(elapsed)}
          </Pill>
        }
      />

      <Progress value={Math.round(((index + 1) / questions.length) * 100)} />

      <Card className="section-gap">
        <CardHeader title={current.prompt} subtitle={current.type === "mcq" ? "Choose one answer" : "Type your answer"} />

        {current.type === "mcq" ? (
          <div className="stack" style={{ gap: 6 }}>
            {current.options.map((opt, oi) => {
              const selected = String(answers[current._id] ?? "") === String(oi);
              return (
                <button
                  key={oi}
                  type="button"
                  className={`answer-option${selected ? " selected" : ""}`}
                  onClick={() => setAnswers((a) => ({ ...a, [current._id]: String(oi) }))}
                >
                  <span className="answer-letter">{String.fromCharCode(65 + oi)}</span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <Input
            value={answers[current._id] || ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [current._id]: e.target.value }))}
            placeholder="Your answer"
          />
        )}

        <div className="row-between">
          <Button
            icon={ArrowLeft}
            variant="ghost"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </Button>
          {index === questions.length - 1 ? (
            <Button variant="primary" icon={Send} loading={submitting} onClick={submit}>
              Submit quiz
            </Button>
          ) : (
            <Button icon={ArrowRight} onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
              Next
            </Button>
          )}
        </div>
      </Card>

      <div className="row section-gap" style={{ flexWrap: "wrap", gap: 6 }}>
        {questions.map((q, i) => {
          const done = String(answers[q._id] ?? "").trim() !== "";
          return (
            <button
              key={q._id}
              className={`dot-nav${i === index ? " current" : ""}${done ? " done" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to question ${i + 1}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
