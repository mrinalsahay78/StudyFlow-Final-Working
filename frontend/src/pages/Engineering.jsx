import React, { useState } from "react";
import {
  BookMarked,
  Code2,
  FlaskConical,
  FolderGit2,
  GraduationCap,
  Plus,
  Trash2,
} from "lucide-react";
import Card, { CardHeader } from "../components/ui/Card";
import { PageHeader, EmptyState, ErrorState, SkeletonRows } from "../components/ui/States";
import { Pill, Progress } from "../components/ui/Progress";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import { useApi } from "../hooks/useApi";
import { del, post, put } from "../lib/api";
import { DIFFICULTIES } from "../lib/constants";
import { relativeDay, titleCase } from "../lib/format";
import { useToast } from "../context/ToastContext";

const TABS = [
  { id: "overview", label: "Overview", icon: GraduationCap },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "coding", label: "Coding log", icon: Code2 },
  { id: "journal", label: "Lab journal", icon: FlaskConical },
];

export default function Engineering() {
  const [tab, setTab] = useState("overview");
  return (
    <>
      <PageHeader
        eyebrow="Engineering workspace"
        title="Engineering hub"
        subtitle="Semester credits, mini/major projects, DSA practice and the practical journal — configured by you."
        actions={
          <div className="segmented">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      {tab === "overview" ? <Overview /> : null}
      {tab === "projects" ? <Projects /> : null}
      {tab === "coding" ? <Coding /> : null}
      {tab === "journal" ? <Journal /> : null}
    </>
  );
}

function Overview() {
  const { data, loading, error, refetch } = useApi("/engineering/semester");
  const placements = useApi("/tasks?type=placement");
  const backlogs = useApi("/tasks?type=backlog");
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading || !data) return <SkeletonRows rows={3} />;
  return (
    <div className="dash-grid">
      <div className="dash-col">
        <Card>
          <CardHeader title="Semester snapshot" icon={GraduationCap} subtitle="From your configured subjects" />
          <div className="stat-grid">
            <div className="stat">
              <span className="muted small">Credits</span>
              <strong>{data.credits}</strong>
              <small>{data.subjectCount} subjects</small>
            </div>
            <div className="stat">
              <span className="muted small">Syllabus</span>
              <strong>{data.topicCount ? Math.round((data.topicsCompleted / data.topicCount) * 100) : 0}%</strong>
              <small>
                {data.topicsCompleted}/{data.topicCount} topics
              </small>
            </div>
            <div className="stat">
              <span className="muted small">Exams done</span>
              <strong>
                {data.examsCompleted}/{data.examCount}
              </strong>
              <small>{data.gradedExams} graded</small>
            </div>
            <div className="stat">
              <span className="muted small">Average marks</span>
              <strong>{data.averagePercentage === null ? "—" : `${data.averagePercentage}%`}</strong>
              <small>Across graded exams</small>
            </div>
          </div>
          <div className="divider" />
          <div className="stack" style={{ gap: 8 }}>
            {data.bySemester.map((s) => (
              <div className="row-between small" key={s.semester}>
                <span>Semester {s.semester}</span>
                <span className="muted">
                  {s.subjects} subjects · {s.credits} credits
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Placement & backlog prep" subtitle="Tracked as tasks of those types" />
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div>
              <span className="eyebrow">Placement</span>
              {(placements.data?.items || []).length ? (
                placements.data.items.slice(0, 5).map((t) => (
                  <div className="row-between small" key={t._id} style={{ padding: "4px 0" }}>
                    <span>{t.title}</span>
                    <Pill tone={t.status === "done" ? "success" : "neutral"}>{titleCase(t.status)}</Pill>
                  </div>
                ))
              ) : (
                <p className="small muted">Add tasks with type “Placement prep”.</p>
              )}
            </div>
            <div>
              <span className="eyebrow">Backlog</span>
              {(backlogs.data?.items || []).length ? (
                backlogs.data.items.slice(0, 5).map((t) => (
                  <div className="row-between small" key={t._id} style={{ padding: "4px 0" }}>
                    <span>{t.title}</span>
                    <Pill tone={t.status === "done" ? "success" : "warning"}>{relativeDay(t.dueDate)}</Pill>
                  </div>
                ))
              ) : (
                <p className="small muted">Add tasks with type “Backlog”.</p>
              )}
            </div>
          </div>
        </Card>
      </div>
      <div className="dash-col">
        <Card>
          <CardHeader title="How this is calculated" icon={BookMarked} />
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Credits are summed from the credit value you set on each subject.</li>
            <li>Syllabus percentage counts completed topics ÷ all topics.</li>
            <li>Average marks use exams where both max and scored marks are set.</li>
            <li>Nothing is estimated or invented — empty states stay empty.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Projects() {
  const { data, loading, error, refetch } = useApi("/engineering/projects");
  const subjects = useApi("/subjects");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", kind: "mini", subjectId: "", deadline: "", repoUrl: "" });
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      await post("/engineering/projects", { ...form, subjectId: form.subjectId || null });
      toast.success("Project added");
      setOpen(false);
      setForm({ title: "", description: "", kind: "mini", subjectId: "", deadline: "", repoUrl: "" });
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (p, patch) => {
    try {
      await put(`/engineering/projects/${p._id}`, patch);
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    await del(`/engineering/projects/${p._id}`).then(refetch).catch((e) => toast.error(e.message));
  };

  return (
    <>
      <div className="toolbar">
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
          New project
        </Button>
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading ? <SkeletonRows rows={2} /> : null}
      {!loading && !(data?.items || []).length ? (
        <EmptyState icon={FolderGit2} title="No projects yet" body="Track mini-projects, major projects and personal builds with milestones." />
      ) : (
        <div className="grid grid-auto">
          {(data?.items || []).map((p) => {
            const done = (p.milestones || []).filter((m) => m.done).length;
            return (
              <Card key={p._id}>
                <div className="row-between">
                  <strong>{p.title}</strong>
                  <button className="icon-btn" onClick={() => remove(p)} aria-label="Delete project">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="row wrap small muted" style={{ gap: 6, margin: "6px 0 10px" }}>
                  <Pill>{p.kind}</Pill>
                  {p.deadline ? <Pill>{relativeDay(p.deadline)}</Pill> : null}
                  <Select
                    value={p.status}
                    onChange={(e) => update(p, { status: e.target.value })}
                    style={{ height: 26, fontSize: 11.5, maxWidth: 130 }}
                    aria-label="Project status"
                  >
                    {["planning", "in_progress", "review", "done"].map((s) => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </Select>
                </div>
                {p.description ? <p className="small muted" style={{ marginBottom: 8 }}>{p.description}</p> : null}
                <Progress value={p.milestones?.length ? (done / p.milestones.length) * 100 : 0} size="sm" label={`${done}/${p.milestones?.length || 0} milestones`} />
                {p.repoUrl ? (
                  <a className="small" href={p.repoUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "inline-block", marginTop: 8 }}>
                    Repository →
                  </a>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={create}>
              Add project
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="form-row">
            <Field label="Kind">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="mini">Mini project</option>
                <option value="major">Major project</option>
                <option value="personal">Personal</option>
              </Select>
            </Field>
            <Field label="Deadline">
              <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </Field>
          </div>
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">No subject</option>
              {(subjects.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Repository URL">
            <Input value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} placeholder="https://github.com/…" />
          </Field>
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function Coding() {
  const { data, loading, error, refetch } = useApi("/engineering/coding");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ problem: "", platform: "LeetCode", url: "", difficulty: "medium", topic: "" });
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      await post("/engineering/coding", form);
      toast.success("Problem logged");
      setOpen(false);
      setForm({ problem: "", platform: "LeetCode", url: "", difficulty: "medium", topic: "" });
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    await del(`/engineering/coding/${row._id}`).then(refetch).catch((e) => toast.error(e.message));
  };

  return (
    <>
      <div className="toolbar">
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
          Log a problem
        </Button>
        {data?.stats ? (
          <span className="muted small" style={{ marginLeft: "auto" }}>
            {data.stats.solved} solved · {data.stats.last30} in last 30 days · E{data.stats.byDifficulty.easy} M
            {data.stats.byDifficulty.medium} H{data.stats.byDifficulty.hard}
          </span>
        ) : null}
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading ? <SkeletonRows rows={3} /> : null}
      {!loading && !(data?.items || []).length ? (
        <EmptyState icon={Code2} title="No coding practice logged" body="Track DSA problems, difficulty and topic to see where you are strong." />
      ) : (
        <Card>
          <div className="list">
            {(data?.items || []).map((row) => (
              <div className="list-item" key={row._id}>
                <div className="list-item-main">
                  <span className="list-item-title">{row.problem}</span>
                  <span className="list-item-sub">
                    {row.platform} · {row.topic || "general"}
                  </span>
                </div>
                <Pill tone={row.difficulty === "hard" ? "danger" : row.difficulty === "medium" ? "warning" : "success"}>
                  {row.difficulty}
                </Pill>
                <button className="icon-btn" onClick={() => remove(row)} aria-label="Delete entry">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log a solved problem"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={create}>
              Log problem
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Problem">
            <Input value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} placeholder="Two Sum" />
          </Field>
          <div className="form-row">
            <Field label="Platform">
              <Input value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} />
            </Field>
            <Field label="Difficulty">
              <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                {DIFFICULTIES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Topic">
              <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="arrays, dp…" />
            </Field>
            <Field label="URL">
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Journal() {
  const { data, loading, error, refetch } = useApi("/engineering/journal");
  const subjects = useApi("/subjects");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ experiment: "", subjectId: "", aim: "", apparatus: "", procedure: "", observations: "", conclusion: "", status: "pending" });
  const toast = useToast();

  const create = async () => {
    setBusy(true);
    try {
      await post("/engineering/journal", { ...form, subjectId: form.subjectId || null });
      toast.success("Journal entry added");
      setOpen(false);
      setForm({ experiment: "", subjectId: "", aim: "", apparatus: "", procedure: "", observations: "", conclusion: "", status: "pending" });
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row, status) => {
    await put(`/engineering/journal/${row._id}`, { status }).then(refetch).catch((e) => toast.error(e.message));
  };

  return (
    <>
      <div className="toolbar">
        <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
          New experiment
        </Button>
        {data?.summary ? (
          <span className="muted small" style={{ marginLeft: "auto" }}>
            {data.summary.pending} pending · {data.summary.written} written · {data.summary.checked} checked
          </span>
        ) : null}
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading ? <SkeletonRows rows={2} /> : null}
      {!loading && !(data?.items || []).length ? (
        <EmptyState icon={FlaskConical} title="No practicals recorded" body="Write up experiments with aim, procedure, observations and conclusion." />
      ) : (
        <div className="stack">
          {(data?.items || []).map((row) => (
            <Card key={row._id}>
              <div className="row-between">
                <strong>{row.experiment}</strong>
                <Select
                  value={row.status}
                  onChange={(e) => setStatus(row, e.target.value)}
                  style={{ maxWidth: 130, height: 30, fontSize: 12 }}
                  aria-label="Journal status"
                >
                  <option value="pending">Pending</option>
                  <option value="written">Written</option>
                  <option value="checked">Checked</option>
                </Select>
              </div>
              {row.aim ? <p className="small muted" style={{ marginTop: 6 }}><strong>Aim:</strong> {row.aim}</p> : null}
              {row.observations ? <p className="small muted"><strong>Observations:</strong> {row.observations}</p> : null}
              {row.conclusion ? <p className="small muted"><strong>Conclusion:</strong> {row.conclusion}</p> : null}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New lab experiment"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={create}>
              Save entry
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Experiment">
            <Input value={form.experiment} onChange={(e) => setForm({ ...form, experiment: e.target.value })} placeholder="To study the working of a half adder" />
          </Field>
          <Field label="Subject">
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">No subject</option>
              {(subjects.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Aim">
            <Textarea value={form.aim} onChange={(e) => setForm({ ...form, aim: e.target.value })} />
          </Field>
          <Field label="Apparatus">
            <Textarea value={form.apparatus} onChange={(e) => setForm({ ...form, apparatus: e.target.value })} />
          </Field>
          <Field label="Procedure">
            <Textarea value={form.procedure} onChange={(e) => setForm({ ...form, procedure: e.target.value })} />
          </Field>
          <Field label="Observations">
            <Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </Field>
          <Field label="Conclusion">
            <Textarea value={form.conclusion} onChange={(e) => setForm({ ...form, conclusion: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
