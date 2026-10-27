import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Download, ListChecks, Plus, Trash2 } from "lucide-react";
import { api, del, patch, post, put } from "../lib/api";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Field";
import Card from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pill } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { PRIORITIES, TASK_TYPES } from "../lib/constants";
import { dayKey, formatDay, relativeDay, titleCase } from "../lib/format";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

const PRIORITY_TONE = { high: "danger", medium: "warning", low: "success" };
const blank = {
  title: "",
  description: "",
  type: "task",
  priority: "medium",
  status: "todo",
  dueDate: "",
  estimatedMinutes: 30,
  subjectId: "",
};

export default function Tasks() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [subjects, setSubjects] = useState([]);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | task object
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api("/tasks?sort=due");
      setState({ loading: false, error: null, items: data.items || [] });
    } catch (error) {
      setState({ loading: false, error, items: [] });
    }
  }, []);

  useEffect(() => {
    load();
    api("/subjects")
      .then((d) => setSubjects(d.items || []))
      .catch(() => setSubjects([]));
  }, [load]);

  const subjectName = useCallback(
    (id) => subjects.find((s) => String(s._id) === String(id))?.name || "",
    [subjects],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.items.filter((t) => {
      if (filterType && t.type !== filterType) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        subjectName(t.subjectId).toLowerCase().includes(q)
      );
    });
  }, [state.items, query, filterType, subjectName]);

  const columns = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] };
    filtered.forEach((t) => {
      (map[t.status] || map.todo).push(t);
    });
    return map;
  }, [filtered]);

  const openNew = () => {
    setForm(blank);
    setModal("new");
  };

  const openEdit = (task) => {
    setForm({
      title: task.title || "",
      description: task.description || "",
      type: task.type || "task",
      priority: task.priority || "medium",
      status: task.status || "todo",
      dueDate: task.dueDate || "",
      estimatedMinutes: task.estimatedMinutes ?? 30,
      subjectId: task.subjectId || "",
    });
    setModal(task);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        title: form.title.trim(),
        estimatedMinutes: Number(form.estimatedMinutes) || 30,
        subjectId: form.subjectId || null,
        dueDate: form.dueDate || "",
      };
      if (modal === "new") await post("/tasks", body);
      else await put(`/tasks/${modal._id}`, body);
      toast.success(modal === "new" ? "Task created" : "Task updated");
      setModal(null);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const moveTask = async (task, status) => {
    if (task.status === status) return;
    try {
      await patch(`/tasks/${task._id}`, { status });
      setState((s) => ({
        ...s,
        items: s.items.map((t) => (t._id === task._id ? { ...t, status, completed: status === "done" } : t)),
      }));
    } catch (error) {
      toast.error(error.message);
      load();
    }
  };

  const removeTask = async (task) => {
    try {
      await del(`/tasks/${task._id}`);
      toast.success("Task deleted");
      setState((s) => ({ ...s, items: s.items.filter((t) => t._id !== task._id) }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportTasks = async () => {
    try {
      const data = await api("/tasks/export/all");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "studyflow-tasks.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const today = dayKey();

  const renderCard = (task) => {
    const overdue = task.dueDate && task.dueDate < today && task.status !== "done";
    return (
      <article
        key={task._id}
        className={`task-card${overdue ? " overdue" : ""}${dragging === task._id ? " dragging" : ""}`}
        draggable
        onDragStart={() => setDragging(task._id)}
        onDragEnd={() => {
          setDragging(null);
          setDropTarget(null);
        }}
        onClick={() => openEdit(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && openEdit(task)}
      >
        <span className="task-title">{task.title}</span>
        {task.description ? <span className="muted tiny">{task.description.slice(0, 120)}</span> : null}
        <div className="task-meta">
          <Pill tone={PRIORITY_TONE[task.priority] || "neutral"}>{task.priority}</Pill>
          <span>{titleCase(task.type)}</span>
          {task.dueDate ? <span>· {relativeDay(task.dueDate)}</span> : null}
          {task.estimatedMinutes ? <span>· {task.estimatedMinutes}m</span> : null}
        </div>
        {task.subjectId && subjectName(task.subjectId) ? (
          <span className="muted tiny">{subjectName(task.subjectId)}</span>
        ) : null}
        <div className="row-between">
          <button
            className="icon-btn"
            title="Delete task"
            onClick={(e) => {
              e.stopPropagation();
              removeTask(task);
            }}
          >
            <Trash2 size={13} />
          </button>
          <div className="row" style={{ gap: 4 }}>
            {COLUMNS.filter((c) => c.key !== task.status).map((c) => (
              <button
                key={c.key}
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  moveTask(task, c.key);
                }}
              >
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Workload"
        title="Tasks & assignments"
        subtitle={`${state.items.filter((t) => t.status !== "done").length} open · ${state.items.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length} overdue`}
        actions={
          <>
            <Button icon={Download} onClick={exportTasks}>
              Export
            </Button>
            <Button variant="primary" icon={Plus} onClick={openNew}>
              New task
            </Button>
          </>
        }
      />

      <div className="toolbar">
        <div className="input-row" style={{ maxWidth: 280 }}>
          <Input
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
        </div>
        <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All types</option>
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : state.loading ? (
        <SkeletonRows rows={4} />
      ) : state.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            body="Add assignments, practicals, internal tests and placement prep — they all feed the planner."
            action={
              <Button variant="primary" icon={Plus} onClick={openNew}>
                Add your first task
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="kanban-col"
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.key);
              }}
              onDragLeave={() => setDropTarget((d) => (d === col.key ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const task = state.items.find((t) => t._id === dragging);
                setDropTarget(null);
                setDragging(null);
                if (task) moveTask(task, col.key);
              }}
            >
              <div className="kanban-head">
                <span>{col.label}</span>
                <span>{columns[col.key].length}</span>
              </div>
              {columns[col.key].length ? (
                columns[col.key].map(renderCard)
              ) : (
                <div className={`drop-zone${dropTarget === col.key ? " active" : ""}`}>
                  {col.key === "done" ? (
                    <>
                      <CheckCircle2 size={15} />
                      <span>Nothing here yet</span>
                    </>
                  ) : (
                    <span>Drop tasks here</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal === "new" ? "New task" : "Edit task"}
        size="lg"
      >
        <form className="form-grid" onSubmit={save}>
          <Field label="Title" htmlFor="task-title" required>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="DBMS assignment 2"
              required
              autoFocus
            />
          </Field>
          <div className="form-row">
            <Field label="Type" htmlFor="task-type">
              <Select
                id="task-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <Select
                id="task-priority"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Due date" htmlFor="task-due">
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </Field>
            <Field label="Estimated minutes" htmlFor="task-minutes">
              <Input
                id="task-minutes"
                type="number"
                min="5"
                max="1440"
                value={form.estimatedMinutes}
                onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Status" htmlFor="task-status">
              <Select
                id="task-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject" htmlFor="task-subject">
              <Select
                id="task-subject"
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
          <Field label="Description" htmlFor="task-desc">
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What exactly needs to be done?"
            />
          </Field>
          {modal !== "new" && modal?.dueDate ? (
            <span className="muted tiny">
              <CalendarClock size={12} /> Created due {formatDay(modal.dueDate, "d MMM yyyy")} · {titleCase(modal.status)}
            </span>
          ) : null}
          <div className="row-between">
            <Button variant="ghost" type="button" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              {modal === "new" ? "Create task" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
