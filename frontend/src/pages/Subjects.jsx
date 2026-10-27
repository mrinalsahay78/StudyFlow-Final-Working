import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { api, del, patch, post } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import Card, { CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill, Progress } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { minutesToHm } from "../lib/format";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#ec4899"];

const emptyForm = { name: "", code: "", color: COLORS[0], semester: "", targetHours: "", notes: "" };

export default function Subjects() {
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api("/subjects");
      setState({ loading: false, error: null, items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error, items: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api("/subjects/templates")
      .then((d) => setTemplates(d.items || []))
      .catch(() => setTemplates([]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q),
    );
  }, [state.items, query]);

  const createSubject = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        code: form.code.trim(),
        color: form.color,
        notes: form.notes.trim(),
      };
      if (form.semester) body.semester = Number(form.semester);
      if (form.targetHours) body.targetHours = Number(form.targetHours);
      const created = await post("/subjects", body);
      toast.success("Subject created");
      setCreating(false);
      setForm(emptyForm);
      navigate(`/app/subjects/${created._id}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const useTemplate = async (templateId) => {
    try {
      const created = await post("/subjects/from-template", { templateId });
      toast.success("Subject added from template");
      setCreating(false);
      navigate(`/app/subjects/${created._id}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const removeSubject = async () => {
    if (!confirmDelete) return;
    try {
      await del(`/subjects/${confirmDelete._id}`);
      toast.success("Subject deleted");
      setConfirmDelete(null);
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const toggleSemesterPin = async (subject) => {
    try {
      const next = subject.semester ? null : Number(subject.semester || 1);
      await patch(`/subjects/${subject._id}`, { semester: next });
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Syllabus"
        title="Subjects"
        subtitle="Each subject holds units and topics. Progress is computed from topics you mark complete."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New subject
          </Button>
        }
      />

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={4} />
      ) : state.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            body="Start from a ready-made engineering template, or create one from scratch and add your own units."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                Add your first subject
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="toolbar">
            <div className="input-row" style={{ maxWidth: 300 }}>
              <Input
                placeholder="Search name or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search subjects"
              />
            </div>
            <span className="muted small">
              {filtered.length} of {state.items.length} subjects
            </span>
          </div>

          <div className="grid grid-auto">
            {filtered.map((s) => (
              <article className="card subject-card" key={s._id}>
                <div className="subject-card-top">
                  <span className="subject-swatch" style={{ background: s.color || "var(--accent)" }} />
                  <div className="grow">
                    <Link to={`/app/subjects/${s._id}`}>
                      <strong>{s.name}</strong>
                    </Link>
                    <div className="muted small">
                      {s.code ? `${s.code} · ` : ""}
                      {s.unitCount} unit{s.unitCount === 1 ? "" : "s"} · {s.topicCount} topics
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    title="Delete subject"
                    onClick={() => setConfirmDelete(s)}
                    aria-label={`Delete ${s.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <Progress
                  value={s.progress}
                  label={`${s.progress}% syllabus`}
                  size="sm"
                  tone={s.progress >= 70 ? "success" : s.progress >= 35 ? "accent" : "warning"}
                />

                <div className="row-between">
                  <span className="muted tiny">
                    {s.topicsCompleted}/{s.topicCount} done · {minutesToHm(s.plannedMinutes)} planned
                  </span>
                  {s.semester ? <Pill tone="info">Sem {s.semester}</Pill> : null}
                </div>

                <div className="row">
                  <Link className="btn btn-secondary btn-sm" to={`/app/subjects/${s._id}`}>
                    <span>Open syllabus</span>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => toggleSemesterPin(s)}>
                    {s.semester ? "Unpin term" : "Pin to term 1"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New subject" size="lg">
        {templates.length ? (
          <>
            <span className="eyebrow">Start from a template</span>
            <div className="grid grid-2 section-gap" style={{ marginBottom: 18 }}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="note-item"
                  onClick={() => useTemplate(t.id)}
                  type="button"
                >
                  <strong>
                    <Sparkles size={12} /> {t.name}
                  </strong>
                  <span>
                    {t.code ? `${t.code} · ` : ""}
                    {t.units?.length || 0} units
                  </span>
                </button>
              ))}
            </div>
            <div className="divider" />
            <span className="eyebrow">Or build it yourself</span>
          </>
        ) : null}

        <form className="form-grid section-gap" onSubmit={createSubject}>
          <Field label="Subject name" htmlFor="subject-name" required>
            <Input
              id="subject-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Operating Systems"
              required
              autoFocus
            />
          </Field>
          <div className="form-row">
            <Field label="Code" htmlFor="subject-code">
              <Input
                id="subject-code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="CS-304"
              />
            </Field>
            <Field label="Semester" htmlFor="subject-semester">
              <Select
                id="subject-semester"
                value={form.semester}
                onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
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
          <Field label="Colour" hint="Used across charts and the planner.">
            <div className="row wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  aria-label={`Colour ${c}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: c,
                    border: form.color === c ? "2px solid var(--text)" : "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving} icon={Plus}>
              Create subject
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Delete subject?"
      >
        <p className="muted small">
          <strong>{confirmDelete?.name}</strong> and its units and topics will be removed. Tasks, notes
          and sessions that referenced it are kept but unlinked.
        </p>
        <div className="row-between section-gap">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Keep it
          </Button>
          <Button variant="danger" onClick={removeSubject}>
            Delete subject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
