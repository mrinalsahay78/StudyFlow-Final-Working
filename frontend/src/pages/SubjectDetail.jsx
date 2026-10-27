import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Plus,
  Trash2,
} from "lucide-react";
import { api, del, patch, post, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import Card, { CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill, Progress, Ring } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { DIFFICULTIES, PRIORITIES, TOPIC_STATUSES } from "../lib/constants";
import { minutesToHm, titleCase } from "../lib/format";

const TOPIC_STATUS_TONE = {
  not_started: "neutral",
  in_progress: "info",
  revised: "warning",
  mastered: "success",
};

function UnitBlock({ unit, topics, onAddTopic, onToggleUnit, onDeleteUnit, onTopicChange, onDeleteTopic }) {
  const [open, setOpen] = useState(true);
  const done = topics.filter((t) => t.completed).length;
  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;

  return (
    <div className="unit-block">
      <div className="unit-head">
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle unit">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <h4>{unit.title}</h4>
        <span className="muted small nowrap">
          {done}/{topics.length} · {pct}%
        </span>
        <button
          className="icon-btn"
          title="Mark every topic in this unit complete"
          onClick={() => onToggleUnit(unit, done < topics.length)}
        >
          <Check size={15} />
        </button>
        <button className="icon-btn" title="Add topic" onClick={() => onAddTopic(unit)}>
          <Plus size={15} />
        </button>
        <button className="icon-btn" title="Delete unit" onClick={() => onDeleteUnit(unit)}>
          <Trash2 size={15} />
        </button>
      </div>

      {open ? (
        topics.length ? (
          topics.map((t) => (
            <div className="topic-row" key={t._id}>
              <input
                type="checkbox"
                checked={Boolean(t.completed)}
                onChange={(e) => onTopicChange(t, { completed: e.target.checked })}
                aria-label={`Mark ${t.title} complete`}
              />
              <div className="topic-main">
                <span className="topic-title" style={t.completed ? { textDecoration: "line-through", opacity: 0.65 } : undefined}>
                  {t.title}
                </span>
                <span className="topic-meta">
                  {t.estimatedMinutes ? `${t.estimatedMinutes}m` : "no estimate"}
                  {t.difficulty ? ` · ${t.difficulty}` : ""}
                  {t.revisionCount ? ` · revised ${t.revisionCount}×` : ""}
                </span>
              </div>
              {t.isImportant ? <Pill tone="danger">Important</Pill> : null}
              <select
                className="input select"
                style={{ width: 140, height: 30, fontSize: 12 }}
                value={t.status}
                onChange={(e) => onTopicChange(t, { status: e.target.value })}
                aria-label={`Status of ${t.title}`}
              >
                {TOPIC_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Pill tone={TOPIC_STATUS_TONE[t.status] || "neutral"}>{titleCase(t.status)}</Pill>
              <button className="icon-btn" onClick={() => onDeleteTopic(t)} title="Delete topic">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="topic-row">
            <span className="muted small">No topics in this unit yet.</span>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => onAddTopic(unit)}>
              Add topic
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [unitModal, setUnitModal] = useState(false);
  const [unitTitle, setUnitTitle] = useState("");
  const [topicModal, setTopicModal] = useState(null);
  const [topicForm, setTopicForm] = useState({
    title: "",
    estimatedMinutes: 45,
    difficulty: "medium",
    priority: "medium",
    isImportant: false,
    notes: "",
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(`/subjects/${id}`);
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const subject = state.data?.subject;
  const units = state.data?.units || [];
  const topics = state.data?.topics || [];

  useEffect(() => {
    if (subject) {
      setEditForm({
        name: subject.name || "",
        code: subject.code || "",
        semester: subject.semester || "",
        color: subject.color || "#6366f1",
        targetHours: subject.targetHours || "",
        notes: subject.notes || "",
      });
    }
  }, [subject]);

  const byUnit = useMemo(() => {
    const map = new Map();
    units.forEach((u) => map.set(String(u._id), []));
    const ungrouped = [];
    topics.forEach((t) => {
      const key = t.unitId ? String(t.unitId) : null;
      if (key && map.has(key)) map.get(key).push(t);
      else ungrouped.push(t);
    });
    return { map, ungrouped };
  }, [units, topics]);

  const stats = useMemo(() => {
    const done = topics.filter((t) => t.completed).length;
    const revised = topics.filter((t) => t.status === "revised" || t.status === "mastered").length;
    return {
      total: topics.length,
      done,
      revised,
      progress: topics.length ? Math.round((done / topics.length) * 100) : 0,
      planned: topics.reduce((a, t) => a + (t.estimatedMinutes || 0), 0),
    };
  }, [topics]);

  const addUnit = async (e) => {
    e.preventDefault();
    if (!unitTitle.trim()) return;
    try {
      await post(`/subjects/${id}/units`, { title: unitTitle.trim() });
      setUnitTitle("");
      setUnitModal(false);
      toast.success("Unit added");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const addTopic = async (e) => {
    e.preventDefault();
    if (!topicForm.title.trim()) return;
    try {
      await post(`/subjects/${id}/topics`, {
        ...topicForm,
        title: topicForm.title.trim(),
        unitId: topicModal?._id || null,
        estimatedMinutes: Number(topicForm.estimatedMinutes) || 45,
      });
      setTopicForm({
        title: "",
        estimatedMinutes: 45,
        difficulty: "medium",
        priority: "medium",
        isImportant: false,
        notes: "",
      });
      toast.success("Topic added");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const changeTopic = async (topic, changes) => {
    try {
      await put(`/syllabus/topics/${topic._id}`, changes);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteTopic = async (topic) => {
    try {
      await del(`/syllabus/topics/${topic._id}`);
      toast.success("Topic deleted");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const toggleUnit = async (unit, completed) => {
    try {
      await post(`/syllabus/${unit._id}/topics/complete`, { completed });
      toast.success(completed ? "Unit marked complete" : "Unit reset");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteUnit = async (unit) => {
    try {
      await del(`/syllabus/${unit._id}`);
      toast.success("Unit deleted — its topics are now ungrouped");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const saveSubject = async (e) => {
    e.preventDefault();
    try {
      const body = { ...editForm };
      if (body.semester) body.semester = Number(body.semester);
      if (body.targetHours) body.targetHours = Number(body.targetHours);
      await patch(`/subjects/${id}`, body);
      toast.success("Subject updated");
      setEditOpen(false);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (state.loading || !subject) {
    return (
      <>
        <PageHeader title="Subject" subtitle="Loading syllabus…" />
        <SkeletonRows rows={5} />
      </>
    );
  }

  return (
    <div>
      <Link to="/app/subjects" className="row muted small" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> All subjects
      </Link>

      <PageHeader
        eyebrow={subject.code || "Syllabus"}
        title={subject.name}
        subtitle={`${units.length} units · ${stats.total} topics · ${minutesToHm(stats.planned)} of planned study`}
        actions={
          <>
            <Button icon={FolderPlus} onClick={() => setUnitModal(true)}>
              Add unit
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setTopicModal({ _id: null })}>
              Add topic
            </Button>
            <Button variant="ghost" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </>
        }
      />

      <div className="grid grid-3 section-gap">
        <Card>
          <div className="row" style={{ gap: 14 }}>
            <Ring value={stats.progress} size={84} label={`${stats.progress}%`} sub="syllabus" />
            <div className="stack" style={{ gap: 3 }}>
              <strong className="small">
                {stats.done} of {stats.total} topics complete
              </strong>
              <span className="muted tiny">{stats.revised} revised or mastered</span>
              <span className="muted tiny">Planned {minutesToHm(stats.planned)}</span>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader icon={BookOpen} title="Units" />
          <div className="stack" style={{ gap: 4 }}>
            {units.length ? (
              units.map((u) => {
                const list = byUnit.map.get(String(u._id)) || [];
                const pct = list.length
                  ? Math.round((list.filter((t) => t.completed).length / list.length) * 100)
                  : 0;
                return (
                  <div key={u._id} className="stack" style={{ gap: 3 }}>
                    <div className="row-between small">
                      <span className="grow">{u.title}</span>
                      <span className="muted tiny">{pct}%</span>
                    </div>
                    <Progress value={pct} size="sm" tone={pct >= 70 ? "success" : "accent"} />
                  </div>
                );
              })
            ) : (
              <span className="muted small">No units yet — add one to group topics.</span>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Subject details" />
          <div className="stack" style={{ gap: 6 }}>
            <div className="row-between small">
              <span className="muted">Code</span>
              <strong>{subject.code || "—"}</strong>
            </div>
            <div className="row-between small">
              <span className="muted">Semester</span>
              <strong>{subject.semester || "—"}</strong>
            </div>
            <div className="row-between small">
              <span className="muted">Target hours</span>
              <strong>{subject.targetHours || "—"}</strong>
            </div>
          </div>
          {subject.notes ? (
            <>
              <div className="divider" />
              <p className="muted small">{subject.notes}</p>
            </>
          ) : null}
        </Card>
      </div>

      <div className="stack section-gap">
        {units.length === 0 && topics.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="This subject has no syllabus yet"
              body="Add units (chapters) first, then topics inside them. You can also add topics without a unit."
              action={
                <Button variant="primary" icon={FolderPlus} onClick={() => setUnitModal(true)}>
                  Add the first unit
                </Button>
              }
            />
          </Card>
        ) : null}

        {units.map((unit) => (
          <UnitBlock
            key={unit._id}
            unit={unit}
            topics={byUnit.map.get(String(unit._id)) || []}
            onAddTopic={(u) => setTopicModal(u)}
            onToggleUnit={toggleUnit}
            onDeleteUnit={deleteUnit}
            onTopicChange={changeTopic}
            onDeleteTopic={deleteTopic}
          />
        ))}

        {byUnit.ungrouped.length ? (
          <div className="unit-block">
            <div className="unit-head">
              <h4>Ungrouped topics</h4>
              <span className="muted small">{byUnit.ungrouped.length}</span>
            </div>
            {byUnit.ungrouped.map((t) => (
              <div className="topic-row" key={t._id}>
                <input
                  type="checkbox"
                  checked={Boolean(t.completed)}
                  onChange={(e) => changeTopic(t, { completed: e.target.checked })}
                  aria-label={`Mark ${t.title} complete`}
                />
                <div className="topic-main">
                  <span className="topic-title">{t.title}</span>
                  <span className="topic-meta">
                    {t.estimatedMinutes ? `${t.estimatedMinutes}m` : "no estimate"}
                  </span>
                </div>
                <Pill tone={TOPIC_STATUS_TONE[t.status] || "neutral"}>{titleCase(t.status)}</Pill>
                <button className="icon-btn" onClick={() => deleteTopic(t)} title="Delete topic">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Modal open={unitModal} onClose={() => setUnitModal(false)} title="Add unit">
        <form className="form-grid" onSubmit={addUnit}>
          <Field label="Unit title" htmlFor="unit-title" required>
            <Input
              id="unit-title"
              value={unitTitle}
              onChange={(e) => setUnitTitle(e.target.value)}
              placeholder="Unit 3 — Process Scheduling"
              required
              autoFocus
            />
          </Field>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setUnitModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add unit
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(topicModal)}
        onClose={() => setTopicModal(null)}
        title={topicModal?._id ? `Add topic to ${topicModal.title}` : "Add topic"}
      >
        <form className="form-grid" onSubmit={addTopic}>
          <Field label="Topic title" htmlFor="topic-title" required>
            <Input
              id="topic-title"
              value={topicForm.title}
              onChange={(e) => setTopicForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Round Robin vs SJF"
              required
              autoFocus
            />
          </Field>
          <div className="form-row">
            <Field label="Estimated minutes" htmlFor="topic-minutes">
              <Input
                id="topic-minutes"
                type="number"
                min="5"
                max="600"
                value={topicForm.estimatedMinutes}
                onChange={(e) => setTopicForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
              />
            </Field>
            <Field label="Difficulty" htmlFor="topic-difficulty">
              <Select
                id="topic-difficulty"
                value={topicForm.difficulty}
                onChange={(e) => setTopicForm((f) => ({ ...f, difficulty: e.target.value }))}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Priority" htmlFor="topic-priority" hint="High priority topics get scheduled first.">
            <Select
              id="topic-priority"
              value={topicForm.priority}
              onChange={(e) => setTopicForm((f) => ({ ...f, priority: e.target.value }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={topicForm.isImportant}
              onChange={(e) => setTopicForm((f) => ({ ...f, isImportant: e.target.checked }))}
            />
            Mark as important for exams
          </label>
          <Field label="Notes" htmlFor="topic-notes">
            <Textarea
              id="topic-notes"
              value={topicForm.notes}
              onChange={(e) => setTopicForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Anything you want to remember about this topic"
            />
          </Field>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setTopicModal(null)}>
              Close
            </Button>
            <Button variant="primary" type="submit" icon={Plus}>
              Add topic
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit subject">
        {editForm ? (
          <form className="form-grid" onSubmit={saveSubject}>
            <Field label="Name" htmlFor="edit-name">
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="form-row">
              <Field label="Code" htmlFor="edit-code">
                <Input
                  id="edit-code"
                  value={editForm.code}
                  onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                />
              </Field>
              <Field label="Semester" htmlFor="edit-semester">
                <Select
                  id="edit-semester"
                  value={editForm.semester}
                  onChange={(e) => setEditForm((f) => ({ ...f, semester: e.target.value }))}
                >
                  <option value="">Not set</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      Semester {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Target hours" htmlFor="edit-hours" hint="Your own goal for the whole subject.">
              <Input
                id="edit-hours"
                type="number"
                min="0"
                value={editForm.targetHours}
                onChange={(e) => setEditForm((f) => ({ ...f, targetHours: e.target.value }))}
              />
            </Field>
            <Field label="Notes" htmlFor="edit-notes">
              <Textarea
                id="edit-notes"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
            <div className="row-between">
              <Button variant="ghost" type="button" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Save changes
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <div className="row section-gap">
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("/app/subjects")}>
          Back to subjects
        </Button>
      </div>
    </div>
  );
}
