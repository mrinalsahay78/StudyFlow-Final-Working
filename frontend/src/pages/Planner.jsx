import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarPlus,
  CalendarRange,
  Check,
  Clock,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, del, patch, post } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { addDays, dayKey, formatDay, minutesToHm } from "../lib/format";

const KINDS = [
  { value: "study", label: "Study" },
  { value: "revision", label: "Revision" },
  { value: "assignment", label: "Assignment" },
  { value: "practical", label: "Practical" },
  { value: "exam", label: "Exam prep" },
  { value: "break", label: "Break" },
  { value: "other", label: "Other" },
];

const blank = {
  title: "",
  date: dayKey(),
  start: "18:00",
  end: "19:00",
  kind: "study",
  subjectId: "",
  notes: "",
};

export default function Planner() {
  const toast = useToast();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => dayKey());
  const [entries, setEntries] = useState([]);
  const [insights, setInsights] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genOptions, setGenOptions] = useState({ days: 7, dailyMinutes: 120, sessionMinutes: 45, replaceGenerated: true });
  const [genModal, setGenModal] = useState(false);

  const range = useMemo(
    () => ({ from: weekStart, to: dayKey(addDays(new Date(`${weekStart}T00:00:00`), 6)) }),
    [weekStart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, ins] = await Promise.all([
        api(`/planner?from=${range.from}&to=${range.to}`),
        api(`/planner/insights?from=${range.from}&to=${range.to}`),
      ]);
      setEntries(list.items || []);
      setInsights(ins);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api("/subjects")
      .then((d) => setSubjects(d.items || []))
      .catch(() => setSubjects([]));
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const base = new Date(`${range.from}T00:00:00`);
        base.setDate(base.getDate() + i);
        return dayKey(base);
      }),
    [range.from],
  );

  const byDate = useMemo(() => {
    const map = new Map(days.map((d) => [d, []]));
    entries.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    return map;
  }, [entries, days]);

  const totals = useMemo(() => {
    const planned = entries.reduce((a, e) => a + (e.minutes || 0), 0);
    const done = entries.filter((e) => e.completed).reduce((a, e) => a + (e.minutes || 0), 0);
    return { planned, done };
  }, [entries]);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;

  const shiftWeek = (delta) => setWeekStart((d) => dayKey(addDays(new Date(`${d}T00:00:00`), delta * 7)));

  const saveEntry = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, title: form.title.trim(), subjectId: form.subjectId || null };
      if (modal === "new") await post("/planner", body);
      else await patch(`/planner/${modal._id}`, body);
      toast.success(modal === "new" ? "Block added" : "Block updated");
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (entry) => {
    try {
      await patch(`/planner/${entry._id}`, { completed: !entry.completed });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reschedule = async (entry) => {
    try {
      const moved = await post(`/planner/${entry._id}/reschedule`, {});
      toast.success(`Moved to ${formatDay(moved.date)} ${moved.start}`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeEntry = async (entry) => {
    try {
      await del(`/planner/${entry._id}`);
      toast.success("Block removed");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await post("/planner/generate", { ...genOptions, startDate: range.from });
      toast.info(result.message);
      setGenModal(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Weekly plan"
        title="Planner"
        subtitle={`${minutesToHm(totals.planned)} planned · ${minutesToHm(totals.done)} completed this week`}
        actions={
          <>
            <Button icon={Sparkles} onClick={() => setGenModal(true)}>
              Generate plan
            </Button>
            <Button
              variant="primary"
              icon={CalendarPlus}
              onClick={() => {
                setForm({ ...blank, date: days[0] });
                setModal("new");
              }}
            >
              Add block
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <Button icon={CalendarRange} onClick={() => shiftWeek(-1)}>
          Previous
        </Button>
        <Button onClick={() => setWeekStart(dayKey())}>This week</Button>
        <Button onClick={() => shiftWeek(1)}>Next</Button>
        <span className="muted small">
          {formatDay(range.from)} – {formatDay(range.to, "d MMM")}
        </span>
        <div className="grow" />
        <Button icon={Clock} variant="ghost" onClick={() => navigate("/app/focus")}>
          Focus timer
        </Button>
      </div>

      {insights?.conflicts?.length ? (
        <div className="error-state section-gap" role="status">
          <AlertTriangle size={18} />
          <div>
            <h4>
              {insights.conflicts.length} overlapping block{insights.conflicts.length === 1 ? "" : "s"}
            </h4>
            <p>
              {insights.conflicts
                .slice(0, 2)
                .map(
                  (c) =>
                    `${formatDay(c.date)}: "${c.a.title}" (${c.a.start}–${c.a.end}) overlaps "${c.b.title}" (${c.b.start}–${c.b.end})`,
                )
                .join(" · ")}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <>
          <div className="week-grid section-gap">
            {days.map((day) => {
              const list = byDate.get(day) || [];
              const planned = list.reduce((a, e) => a + (e.minutes || 0), 0);
              return (
                <div key={day} className={`day-col${day === dayKey() ? " today" : ""}`}>
                  <div className="day-head">
                    <strong>{formatDay(day, "EEE")}</strong>
                    <span>{formatDay(day, "d MMM")}</span>
                  </div>
                  <span className="muted tiny">{planned ? minutesToHm(planned) : "free"}</span>
                  <div className="day-body">
                    {list.length ? (
                      list.map((entry) => (
                        <div
                          key={entry._id}
                          className={`plan-chip kind-${entry.kind}${entry.completed ? " done" : ""}`}
                          role="group"
                        >
                          <strong>{entry.start}–{entry.end}</strong>
                          <span>{entry.title}</span>
                          {subjectName(entry.subjectId) ? (
                            <span className="muted tiny">{subjectName(entry.subjectId)}</span>
                          ) : null}
                          <span className="row" style={{ gap: 2, marginTop: 3 }}>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              title={entry.completed ? "Mark not done" : "Mark done"}
                              onClick={() => toggleDone(entry)}
                            >
                              <Check size={12} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              title="Move to next free slot"
                              onClick={() => reschedule(entry)}
                            >
                              <RotateCcw size={12} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ width: 22, height: 22 }}
                              title="Delete"
                              onClick={() => removeEntry(entry)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="drop-zone" style={{ minHeight: 40 }}>
                        <span className="tiny">No blocks</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {insights?.missed?.length ? (
            <Card className="section-gap">
              <CardHeader
                icon={AlertTriangle}
                title="Missed sessions"
                subtitle="Past blocks that were never marked done — reschedule them around your current week."
              />
              <div className="list">
                {insights.missed.slice(0, 8).map((m) => (
                  <div className="list-item" key={m.id}>
                    <div className="list-item-main">
                      <span className="list-item-title">{m.title}</span>
                      <span className="list-item-sub">
                        {formatDay(m.date)} · {m.start}–{m.end}
                      </span>
                    </div>
                    <Button size="sm" icon={RotateCcw} onClick={() => reschedule({ _id: m.id })}>
                      Reschedule
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {!entries.length ? (
            <Card className="section-gap">
              <EmptyState
                icon={CalendarPlus}
                title="Nothing planned this week"
                body="Generate a plan from your unfinished topics and open tasks — it respects your study hours and existing blocks."
                action={
                  <Button variant="primary" icon={Sparkles} onClick={() => setGenModal(true)}>
                    Generate a plan
                  </Button>
                }
              />
            </Card>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal === "new" ? "Add study block" : "Edit block"}
      >
        <form className="form-grid" onSubmit={saveEntry}>
          <Field label="Title" htmlFor="plan-title" required>
            <Input
              id="plan-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Revise process scheduling"
              required
              autoFocus
            />
          </Field>
          <Field label="Date" htmlFor="plan-date">
            <Input
              id="plan-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </Field>
          <div className="form-row">
            <Field label="Start" htmlFor="plan-start">
              <Input
                id="plan-start"
                type="time"
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                required
              />
            </Field>
            <Field label="End" htmlFor="plan-end">
              <Input
                id="plan-end"
                type="time"
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                required
              />
            </Field>
          </div>
          <Field label="Kind" htmlFor="plan-kind" hint="Used for colour-coding and analytics.">
            <Select
              id="plan-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="plan-subject">
            <Select
              id="plan-subject"
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
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              {modal === "new" ? "Add block" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={genModal}
        onClose={() => setGenModal(false)}
        title="Generate a study plan"
        subtitle="Built from unfinished topics and open tasks — never random."
      >
        <div className="form-grid">
          <div className="form-row">
            <Field label="Days ahead" htmlFor="gen-days">
              <Input
                id="gen-days"
                type="number"
                min="1"
                max="30"
                value={genOptions.days}
                onChange={(e) => setGenOptions((g) => ({ ...g, days: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Minutes per day" htmlFor="gen-daily">
              <Input
                id="gen-daily"
                type="number"
                min="30"
                max="720"
                step="15"
                value={genOptions.dailyMinutes}
                onChange={(e) => setGenOptions((g) => ({ ...g, dailyMinutes: Number(e.target.value) }))}
              />
            </Field>
          </div>
          <Field label="Session length (minutes)" htmlFor="gen-session">
            <Input
              id="gen-session"
              type="number"
              min="15"
              max="180"
              step="5"
              value={genOptions.sessionMinutes}
              onChange={(e) => setGenOptions((g) => ({ ...g, sessionMinutes: Number(e.target.value) }))}
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={genOptions.replaceGenerated}
              onChange={(e) => setGenOptions((g) => ({ ...g, replaceGenerated: e.target.checked }))}
            />
            Replace previously generated blocks in this range
          </label>
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setGenModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Sparkles} loading={generating} onClick={generate}>
              Generate
            </Button>
          </div>
          {!subjects.length ? (
            <Pill tone="warning">Add subjects with topics first — otherwise there is nothing to schedule.</Pill>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
