import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CalendarDays, GraduationCap, Plus, Target, Trash2 } from "lucide-react";
import { api, del, patch, post, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill, Progress } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { dayKey, daysUntil, formatDay, relativeDay, titleCase } from "../lib/format";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EXAM_KINDS = ["internal", "end_semester", "practical", "viva", "mock", "backlog"];

export default function Academics() {
  const toast = useToast();
  const [tab, setTab] = useState("exams");
  const [state, setState] = useState({ loading: true, error: null });
  const [exams, setExams] = useState([]);
  const [goals, setGoals] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [modal, setModal] = useState(null); // { kind, item }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [ex, go, tt] = await Promise.all([
        api("/academics/exams"),
        api("/academics/goals"),
        api("/academics/timetable"),
      ]);
      setExams(ex.items || []);
      setGoals(go.items || []);
      setTimetable(tt.items || []);
      setState({ loading: false, error: null });
    } catch (error) {
      setState({ loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
  }, [load]);

  const subjectName = (id) => subjects.find((s) => String(s._id) === String(id))?.name;

  const openExam = (item) => {
    setForm(
      item
        ? {
            title: item.title,
            subjectId: item.subjectId || "",
            kind: item.kind || "internal",
            date: item.date,
            time: item.time || "",
            location: item.location || "",
            maxMarks: item.maxMarks ?? "",
            scoredMarks: item.scoredMarks ?? "",
          }
        : { title: "", subjectId: "", kind: "internal", date: dayKey(), time: "", location: "", maxMarks: "", scoredMarks: "" },
    );
    setModal({ kind: "exam", item });
  };

  const openGoal = (item) => {
    setForm(
      item
        ? {
            title: item.title,
            target: item.target ?? 10,
            progress: item.progress ?? 0,
            unit: item.unit || "sessions",
            deadline: item.deadline || "",
          }
        : { title: "", target: 10, progress: 0, unit: "sessions", deadline: "" },
    );
    setModal({ kind: "goal", item });
  };

  const openClass = (item) => {
    setForm(
      item
        ? {
            title: item.title,
            subjectId: item.subjectId || "",
            day: item.day,
            start: item.start,
            end: item.end,
            room: item.room || "",
          }
        : { title: "", subjectId: "", day: "Monday", start: "09:00", end: "10:00", room: "" },
    );
    setModal({ kind: "class", item });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.kind === "exam") {
        const body = {
          ...form,
          subjectId: form.subjectId || null,
          maxMarks: form.maxMarks === "" ? null : Number(form.maxMarks),
          scoredMarks: form.scoredMarks === "" ? null : Number(form.scoredMarks),
        };
        if (modal.item) await put(`/academics/exams/${modal.item._id}`, body);
        else await post("/academics/exams", body);
      } else if (modal.kind === "goal") {
        const body = {
          ...form,
          target: Number(form.target) || 1,
          progress: Number(form.progress) || 0,
          deadline: form.deadline || undefined,
        };
        if (modal.item) await put(`/academics/goals/${modal.item._id}`, body);
        else await post("/academics/goals", body);
      } else {
        const body = { ...form, subjectId: form.subjectId || null };
        if (modal.item) await put(`/academics/timetable/${modal.item._id}`, body);
        else await post("/academics/timetable", body);
      }
      toast.success("Saved");
      setModal(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, item) => {
    const route = { exam: "exams", goal: "goals", class: "timetable" }[kind];
    try {
      await del(`/academics/${route}/${item._id}`);
      toast.success("Deleted");
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const toggleGoal = async (goal) => {
    try {
      await patch(`/academics/goals/${goal._id}`, { completed: !goal.completed });
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const markExamDone = async (exam) => {
    try {
      await patch(`/academics/exams/${exam._id}`, { status: exam.status === "completed" ? "upcoming" : "completed" });
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const upcoming = useMemo(() => exams.filter((e) => e.status !== "completed"), [exams]);

  return (
    <div>
      <PageHeader
        eyebrow="Academics"
        title="Exams, timetable & goals"
        subtitle="Everything that has a date attached, in one place."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => (tab === "exams" ? openExam() : tab === "goals" ? openGoal() : openClass())}
          >
            {tab === "exams" ? "Add exam" : tab === "goals" ? "Add goal" : "Add class"}
          </Button>
        }
      />

      <div className="mode-chips section-gap">
        {[
          { key: "exams", label: "Exams", icon: GraduationCap },
          { key: "timetable", label: "Timetable", icon: CalendarDays },
          { key: "goals", label: "Goals", icon: Target },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`mode-chip${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={4} />
      ) : tab === "exams" ? (
        <div className="stack">
          {exams.length === 0 ? (
            <Card>
              <EmptyState
                icon={GraduationCap}
                title="No exams added"
                body="Add internals, end-semester papers and vivas — they drive the countdown on your dashboard."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => openExam()}>
                    Add an exam
                  </Button>
                }
              />
            </Card>
          ) : (
            exams.map((exam) => {
              const left = daysUntil(exam.date);
              const done = exam.status === "completed";
              return (
                <Card key={exam._id}>
                  <div className="row-between">
                    <div className="stack" style={{ gap: 2 }}>
                      <strong className="small">{exam.title}</strong>
                      <span className="muted tiny">
                        {formatDay(exam.date)} {exam.time ? `· ${exam.time}` : ""} · {titleCase(exam.kind || "internal")}
                        {subjectName(exam.subjectId) ? ` · ${subjectName(exam.subjectId)}` : ""}
                        {exam.location ? ` · ${exam.location}` : ""}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {done ? (
                        <Pill tone="neutral">Completed</Pill>
                      ) : left !== null ? (
                        <Pill tone={left < 0 ? "danger" : left <= 3 ? "warning" : "info"}>
                          {left < 0 ? `${Math.abs(left)} days ago` : relativeDay(exam.date)}
                        </Pill>
                      ) : null}
                      {exam.maxMarks ? (
                        <Pill tone="neutral">
                          {exam.scoredMarks ?? "—"}/{exam.maxMarks}
                        </Pill>
                      ) : null}
                      <button className="icon-btn" title="Toggle completed" onClick={() => markExamDone(exam)}>
                        <BookOpenCheck size={14} />
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => remove("exam", exam)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : tab === "timetable" ? (
        <div className="stack">
          {timetable.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No classes in your timetable"
                body="Add your weekly classes so today's schedule shows on the dashboard."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => openClass()}>
                    Add a class
                  </Button>
                }
              />
            </Card>
          ) : (
            DAYS.filter((d) => timetable.some((t) => t.day === d)).map((day) => (
              <Card key={day}>
                <CardHeader title={day} />
                <div className="stack" style={{ gap: 6 }}>
                  {timetable
                    .filter((t) => t.day === day)
                    .map((t) => (
                      <div className="row-between" key={t._id}>
                        <div className="row" style={{ gap: 10 }}>
                          <span className="mono small">
                            {t.start}–{t.end}
                          </span>
                          <span className="small">{t.title}</span>
                          {subjectName(t.subjectId) ? (
                            <span className="muted tiny">{subjectName(t.subjectId)}</span>
                          ) : null}
                          {t.room ? <span className="muted tiny">{t.room}</span> : null}
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="icon-btn" title="Edit" onClick={() => openClass(t)}>
                            <CalendarDays size={13} />
                          </button>
                          <button className="icon-btn" title="Delete" onClick={() => remove("class", t)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="stack">
          {goals.length === 0 ? (
            <Card>
              <EmptyState
                icon={Target}
                title="No goals yet"
                body="Set a measurable target — sessions per week, problems solved, chapters revised."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => openGoal()}>
                    Add a goal
                  </Button>
                }
              />
            </Card>
          ) : (
            goals.map((goal) => {
              const pct = goal.target ? Math.min(100, Math.round(((goal.progress || 0) / goal.target) * 100)) : 0;
              return (
                <Card key={goal._id}>
                  <div className="row-between">
                    <strong className="small">{goal.title}</strong>
                    <div className="row" style={{ gap: 6 }}>
                      {goal.deadline ? <Pill tone="neutral">{relativeDay(goal.deadline)}</Pill> : null}
                      <Pill tone={goal.completed ? "success" : "info"}>{goal.completed ? "Done" : "Active"}</Pill>
                      <button className="icon-btn" title="Toggle complete" onClick={() => toggleGoal(goal)}>
                        <BookOpenCheck size={14} />
                      </button>
                      <button className="icon-btn" title="Delete" onClick={() => remove("goal", goal)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <Progress value={pct} tone={pct >= 100 ? "success" : "accent"} />
                  <span className="muted tiny">
                    {goal.progress || 0} / {goal.target} {goal.unit || ""}
                  </span>
                </Card>
              );
            })
          )}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={
          modal?.kind === "exam"
            ? modal.item
              ? "Edit exam"
              : "Add exam"
            : modal?.kind === "goal"
              ? modal?.item
                ? "Edit goal"
                : "Add goal"
              : modal?.item
                ? "Edit class"
                : "Add class"
        }
      >
        {modal ? (
          <form className="form-grid" onSubmit={save}>
            <Field label="Title" htmlFor="ac-title" required>
              <Input
                id="ac-title"
                value={form.title || ""}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                autoFocus
              />
            </Field>

            {modal.kind === "exam" ? (
              <>
                <div className="form-row">
                  <Field label="Kind" htmlFor="ac-kind">
                    <Select
                      id="ac-kind"
                      value={form.kind}
                      onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                    >
                      {EXAM_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {titleCase(k)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Subject" htmlFor="ac-subject">
                    <Select
                      id="ac-subject"
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
                </div>
                <div className="form-row">
                  <Field label="Date" htmlFor="ac-date" required>
                    <Input
                      id="ac-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Time" htmlFor="ac-time">
                    <Input
                      id="ac-time"
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="form-row">
                  <Field label="Location" htmlFor="ac-location">
                    <Input
                      id="ac-location"
                      value={form.location}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    />
                  </Field>
                  <Field label="Max marks" htmlFor="ac-max">
                    <Input
                      id="ac-max"
                      type="number"
                      min="0"
                      value={form.maxMarks}
                      onChange={(e) => setForm((f) => ({ ...f, maxMarks: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Scored marks" htmlFor="ac-scored" hint="Leave empty until results are out.">
                  <Input
                    id="ac-scored"
                    type="number"
                    min="0"
                    value={form.scoredMarks}
                    onChange={(e) => setForm((f) => ({ ...f, scoredMarks: e.target.value }))}
                  />
                </Field>
              </>
            ) : null}

            {modal.kind === "goal" ? (
              <>
                <div className="form-row">
                  <Field label="Target" htmlFor="goal-target">
                    <Input
                      id="goal-target"
                      type="number"
                      min="1"
                      value={form.target}
                      onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                    />
                  </Field>
                  <Field label="Current progress" htmlFor="goal-progress">
                    <Input
                      id="goal-progress"
                      type="number"
                      min="0"
                      value={form.progress}
                      onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="form-row">
                  <Field label="Unit" htmlFor="goal-unit">
                    <Input
                      id="goal-unit"
                      value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="sessions, problems, chapters"
                    />
                  </Field>
                  <Field label="Deadline" htmlFor="goal-deadline">
                    <Input
                      id="goal-deadline"
                      type="date"
                      value={form.deadline}
                      onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {modal.kind === "class" ? (
              <>
                <div className="form-row">
                  <Field label="Day" htmlFor="class-day">
                    <Select
                      id="class-day"
                      value={form.day}
                      onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
                    >
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Room" htmlFor="class-room">
                    <Input
                      id="class-room"
                      value={form.room}
                      onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="form-row">
                  <Field label="Start" htmlFor="class-start">
                    <Input
                      id="class-start"
                      type="time"
                      value={form.start}
                      onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="End" htmlFor="class-end">
                    <Input
                      id="class-end"
                      type="time"
                      value={form.end}
                      onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                      required
                    />
                  </Field>
                </div>
                <Field label="Subject" htmlFor="class-subject">
                  <Select
                    id="class-subject"
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
              </>
            ) : null}

            <div className="row-between">
              <Button variant="ghost" type="button" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {upcoming.length ? (
        <Card className="section-gap">
          <CardHeader title="Next up" subtitle={`${upcoming.length} exam${upcoming.length === 1 ? "" : "s"} ahead`} />
          <div className="stack" style={{ gap: 4 }}>
            {upcoming.slice(0, 3).map((e) => (
              <div className="row-between small" key={e._id}>
                <span>{e.title}</span>
                <span className="muted tiny">{formatDay(e.date)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
