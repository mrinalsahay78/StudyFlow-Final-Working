import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Check, Eye, FlipHorizontal2, Plus, Search, Trash2 } from "lucide-react";
import { api, del, post, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { dayKey } from "../lib/format";

const GRADES = [
  { grade: 0, label: "Again", tone: "danger" },
  { grade: 1, label: "Hard", tone: "warning" },
  { grade: 2, label: "Good", tone: "info" },
  { grade: 3, label: "Easy", tone: "success" },
];

export default function Flashcards() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [], dueCount: 0 });
  const [subjects, setSubjects] = useState([]);
  const [dueOnly, setDueOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [studyMode, setStudyMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ front: "", back: "", subjectId: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (dueOnly) params.set("due", "true");
      if (query.trim()) params.set("q", query.trim());
      const data = await api(`/quiz/flashcards?${params.toString()}`);
      setState({ loading: false, error: null, items: data.items || [], dueCount: data.dueCount || 0 });
    } catch (error) {
      setState({ loading: false, error, items: [], dueCount: 0 });
    }
  }, [dueOnly, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
  }, []);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;
  const queue = useMemo(() => state.items, [state.items]);
  const card = studyMode ? queue[reviewIndex] : null;

  const openNew = () => {
    setForm({ front: "", back: "", subjectId: "", tags: "" });
    setModal("new");
  };

  const openEdit = (item) => {
    setForm({
      front: item.front,
      back: item.back,
      subjectId: item.subjectId || "",
      tags: (item.tags || []).join(", "),
    });
    setModal(item);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.front.trim() || !form.back.trim()) return;
    setSaving(true);
    try {
      const body = {
        front: form.front.trim(),
        back: form.back.trim(),
        subjectId: form.subjectId || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      };
      if (modal === "new") await post("/quiz/flashcards", body);
      else await put(`/quiz/flashcards/${modal._id}`, body);
      toast.success(modal === "new" ? "Card added" : "Card updated");
      setModal(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    try {
      await del(`/quiz/flashcards/${item._id}`);
      toast.success("Card deleted");
      setReviewIndex(0);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const review = async (grade) => {
    if (!card) return;
    try {
      await post(`/quiz/flashcards/${card._id}/review`, { grade });
      const next = reviewIndex + 1;
      if (next >= queue.length) {
        toast.success("Review queue finished for today.");
        setStudyMode(false);
        setReviewIndex(0);
      } else {
        setReviewIndex(next);
      }
      setFlipped(false);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const startStudy = () => {
    if (!queue.length) {
      toast.info("No cards due — add some or turn off the due filter.");
      return;
    }
    setReviewIndex(0);
    setFlipped(false);
    setStudyMode(true);
  };

  if (studyMode && card) {
    return (
      <div>
        <PageHeader
          eyebrow="Spaced repetition"
          title="Review"
          subtitle={`Card ${reviewIndex + 1} of ${queue.length} · graded with SM-2`}
          actions={
            <Button variant="ghost" onClick={() => setStudyMode(false)}>
              Exit review
            </Button>
          }
        />
        <Card className="flash-study">
          <button className="flashcard" onClick={() => setFlipped((f) => !f)} type="button">
            <span className="flashcard-side">{flipped ? "Back" : "Front"}</span>
            <strong>{flipped ? card.back : card.front}</strong>
            {!flipped ? (
              <span className="muted tiny">
                <FlipHorizontal2 size={12} /> Click to reveal the answer
              </span>
            ) : card.tags?.length ? (
              <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                {card.tags.map((t) => (
                  <Pill key={t} tone="neutral">
                    {t}
                  </Pill>
                ))}
              </span>
            ) : null}
          </button>

          {flipped ? (
            <div className="grade-row">
              {GRADES.map((g) => (
                <Button key={g.grade} variant={g.grade === 2 ? "primary" : "ghost"} onClick={() => review(g.grade)}>
                  {g.label}
                </Button>
              ))}
            </div>
          ) : (
            <Button icon={Eye} onClick={() => setFlipped(true)}>
              Show answer
            </Button>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Memory"
        title="Flashcards"
        subtitle={`${state.dueCount} card${state.dueCount === 1 ? "" : "s"} due today · ${state.items.length} shown`}
        actions={
          <>
            <Button icon={Brain} onClick={startStudy} disabled={!queue.length}>
              Start review
            </Button>
            <Button variant="primary" icon={Plus} onClick={openNew}>
              New card
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="input-row" style={{ maxWidth: 280 }}>
          <Search size={15} className="muted" />
          <Input
            placeholder="Search cards…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search flashcards"
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
          Due only
        </label>
      </div>

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={3} />
      ) : state.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Brain}
            title={dueOnly ? "Nothing due right now" : "No flashcards yet"}
            body={
              dueOnly
                ? "Turn off “Due only” to see every card, or add new ones."
                : "Create cards for definitions, formulas and definitions you keep forgetting."
            }
            action={
              <Button variant="primary" icon={Plus} onClick={openNew}>
                Add a card
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-2">
          {state.items.map((item) => {
            const isDue = !item.dueDate || item.dueDate <= dayKey();
            return (
              <Card key={item._id}>
                <div className="row-between">
                  <strong className="small">{item.front}</strong>
                  <Pill tone={isDue ? "warning" : "neutral"}>{isDue ? "Due" : item.dueDate}</Pill>
                </div>
                <p className="muted small">{item.back}</p>
                <div className="row-between">
                  <span className="muted tiny">
                    {subjectName(item.subjectId) || "No subject"} · ease {Number(item.ease || 2.5).toFixed(2)} ·{" "}
                    {item.repetitions || 0} reps
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" onClick={() => openEdit(item)} title="Edit card">
                      <Check size={13} />
                    </button>
                    <button className="icon-btn" onClick={() => remove(item)} title="Delete card">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal === "new" ? "New flashcard" : "Edit flashcard"}
      >
        <form className="form-grid" onSubmit={save}>
          <Field label="Front" htmlFor="card-front" required>
            <Textarea
              id="card-front"
              value={form.front}
              onChange={(e) => setForm((f) => ({ ...f, front: e.target.value }))}
              placeholder="What is a deadlock?"
              required
              autoFocus
            />
          </Field>
          <Field label="Back" htmlFor="card-back" required>
            <Textarea
              id="card-back"
              value={form.back}
              onChange={(e) => setForm((f) => ({ ...f, back: e.target.value }))}
              placeholder="Two processes each holding a resource the other needs."
              required
            />
          </Field>
          <Field label="Subject" htmlFor="card-subject">
            <Select
              id="card-subject"
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
          <Field label="Tags" htmlFor="card-tags" hint="Comma separated, up to 10.">
            <Input
              id="card-tags"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="os, unit-2"
            />
          </Field>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              {modal === "new" ? "Add card" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <Card className="section-gap">
        <CardHeader title="How scheduling works" />
        <p className="muted small">
          Each grade adjusts the card’s ease factor and interval (SM-2). “Again” resets the interval to a day and counts
          a lapse; “Easy” pushes the next review further out. Cards you keep failing come back sooner.
        </p>
      </Card>
    </div>
  );
}
