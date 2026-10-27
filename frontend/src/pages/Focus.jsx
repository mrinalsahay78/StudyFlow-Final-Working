import React, { useEffect, useMemo, useState } from "react";
import { Coffee, Pause, Play, RotateCcw, Square, SkipForward, Timer, Flame } from "lucide-react";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useFocusSession } from "../hooks/useFocusSession";
import Button from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Field, Input, Select } from "../components/ui/Field";
import { Pill } from "../components/ui/Progress";
import { PageHeader } from "../components/ui/States";
import { minutesToHm, secondsToClock } from "../lib/format";

const PRESETS = [
  { label: "25 / 5", planned: 25, break: 5 },
  { label: "45 / 10", planned: 45, break: 10 },
  { label: "50 / 10", planned: 50, break: 10 },
  { label: "90 / 15", planned: 90, break: 15 },
];

export default function Focus() {
  const toast = useToast();
  const timer = useFocusSession();
  const [setup, setSetup] = useState({ label: "", subjectId: "", taskId: "", planned: 25, break: 5, mode: "pomodoro" });
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState({ items: [], totals: { seconds: 0, count: 0 } });

  useEffect(() => {
    api("/subjects").then((d) => setSubjects(d.items || [])).catch(() => setSubjects([]));
    api("/tasks?status=in_progress").then((d) => setTasks(d.items || [])).catch(() => setTasks([]));
  }, []);

  const loadHistory = () => {
    api("/study/focus")
      .then((d) => setHistory({ items: d.items || [], totals: d.totals || { seconds: 0, count: 0 } }))
      .catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Auto-stop when the phase reaches its planned length.
  useEffect(() => {
    if (!timer.active || !timer.running) return;
    if (timer.remainingMs > 0) return;
    (async () => {
      const result = await timer.finish({});
      if (result?.studySession) {
        toast.success(
          `Session logged: ${result.studySession.minutes} minutes${result.studySession.topic ? ` on ${result.studySession.topic}` : ""}`,
        );
      } else if (timer.phase === "focus") {
        toast.info("Focus block finished.");
      }
      loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.remainingMs, timer.active, timer.running]);

  const ring = useMemo(() => {
    const size = 260;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    return { size, stroke, radius, circumference, offset: circumference * (1 - timer.progress) };
  }, [timer.progress]);

  const begin = async () => {
    try {
      await timer.start({
        mode: setup.mode,
        plannedMinutes: Number(setup.planned) || 25,
        breakMinutes: Number(setup.break) || 5,
        label: setup.label.trim() || "Focus session",
        subjectId: setup.subjectId || null,
        taskId: setup.taskId || null,
      });
      toast.success("Focus session started");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const stop = async () => {
    const result = await timer.finish({ abandoned: true });
    if (result?.studySession) toast.success(`Kept ${result.studySession.minutes} minutes`);
    else toast.info("Session discarded — under a minute of focus was logged.");
    loadHistory();
  };

  const completePhase = async () => {
    const result = await timer.finish({});
    if (result?.studySession) {
      toast.success(`Session logged: ${result.studySession.minutes} minutes`);
    }
    loadHistory();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Deep work"
        title="Focus timer"
        subtitle="Every completed block becomes study minutes in your analytics. The timer survives a refresh."
        actions={
          <Pill tone="info">
            <Flame size={12} /> {timer.cycles} cycles today
          </Pill>
        }
      />

      <div className="focus-layout">
        <Card className="timer-card">
          <div className="mode-chips">
            {[
              { value: "pomodoro", label: "Pomodoro" },
              { value: "continuous", label: "Continuous" },
              { value: "custom", label: "Custom" },
            ].map((m) => (
              <button
                key={m.value}
                className={`mode-chip${setup.mode === m.value ? " active" : ""}`}
                onClick={() => setSetup((s) => ({ ...s, mode: m.value }))}
                disabled={timer.active}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="timer-ring" style={{ width: ring.size, height: ring.size }}>
            <svg width={ring.size} height={ring.size}>
              <circle
                className="timer-track"
                cx={ring.size / 2}
                cy={ring.size / 2}
                r={ring.radius}
                strokeWidth={ring.stroke}
                fill="none"
              />
              <circle
                className="timer-progress"
                cx={ring.size / 2}
                cy={ring.size / 2}
                r={ring.radius}
                strokeWidth={ring.stroke}
                fill="none"
                strokeDasharray={ring.circumference}
                strokeDashoffset={ring.offset}
                strokeLinecap="round"
              />
            </svg>
            <div className="timer-center">
              <span className="timer-time">
                {secondsToClock(Math.round((timer.active ? timer.remainingMs : (setup.mode === "pomodoro" ? setup.planned : setup.planned) * 60000) / 1000))}
              </span>
              <span className="timer-phase">
                {timer.active ? (timer.phase === "focus" ? "Focus" : "Break") : "Ready"}
              </span>
              {timer.active && timer.label ? <span className="muted tiny">{timer.label}</span> : null}
            </div>
          </div>

          {!timer.active ? (
            <>
              <div className="preset-row">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    className={`mode-chip${setup.planned === p.planned && setup.break === p.break ? " active" : ""}`}
                    onClick={() => setSetup((s) => ({ ...s, planned: p.planned, break: p.break }))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="form-grid" style={{ width: "100%", maxWidth: 380 }}>
                <Field label="What are you studying?" htmlFor="focus-label">
                  <Input
                    id="focus-label"
                    value={setup.label}
                    onChange={(e) => setSetup((s) => ({ ...s, label: e.target.value }))}
                    placeholder="Revise paging algorithms"
                  />
                </Field>
                <div className="form-row">
                  <Field label="Subject" htmlFor="focus-subject">
                    <Select
                      id="focus-subject"
                      value={setup.subjectId}
                      onChange={(e) => setSetup((s) => ({ ...s, subjectId: e.target.value }))}
                    >
                      <option value="">No subject</option>
                      {subjects.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Link a task" htmlFor="focus-task">
                    <Select
                      id="focus-task"
                      value={setup.taskId}
                      onChange={(e) => setSetup((s) => ({ ...s, taskId: e.target.value }))}
                    >
                      <option value="">No task</option>
                      {tasks.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="form-row">
                  <Field label="Focus (min)" htmlFor="focus-min">
                    <Input
                      id="focus-min"
                      type="number"
                      min="1"
                      max="240"
                      value={setup.planned}
                      onChange={(e) => setSetup((s) => ({ ...s, planned: e.target.value }))}
                    />
                  </Field>
                  <Field label="Break (min)" htmlFor="focus-break">
                    <Input
                      id="focus-break"
                      type="number"
                      min="0"
                      max="60"
                      value={setup.break}
                      onChange={(e) => setSetup((s) => ({ ...s, break: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
              <Button variant="primary" size="lg" icon={Play} loading={timer.busy} onClick={begin}>
                Start focusing
              </Button>
            </>
          ) : (
            <div className="timer-actions">
              {timer.running ? (
                <Button icon={Pause} onClick={timer.pause}>
                  Pause
                </Button>
              ) : (
                <Button icon={Play} variant="primary" onClick={timer.resume}>
                  Resume
                </Button>
              )}
              <Button icon={Timer} onClick={completePhase}>
                {timer.phase === "focus" ? "Finish block" : "Finish break"}
              </Button>
              {timer.phase === "break" ? (
                <Button icon={SkipForward} variant="ghost" onClick={timer.skipBreak}>
                  Skip break
                </Button>
              ) : null}
              <Button icon={Square} variant="danger" onClick={stop}>
                Discard
              </Button>
            </div>
          )}

          {timer.active ? (
            <span className="muted tiny">
              {minutesToHm(Math.round(timer.elapsedMs / 60000))} elapsed ·{" "}
              {timer.interruptions} interruption{timer.interruptions === 1 ? "" : "s"}
            </span>
          ) : null}
        </Card>

        <div className="stack">
          <Card>
            <CardHeader
              icon={Coffee}
              title="Focus totals"
              subtitle="All sessions ever logged"
            />
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-top">
                  <span>Total time</span>
                  <span className="stat-icon">
                    <Timer size={14} />
                  </span>
                </div>
                <strong>{minutesToHm(Math.round((history.totals.seconds || 0) / 60))}</strong>
                <small>Across {history.totals.count || 0} sessions</small>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={RotateCcw} title="Recent sessions" subtitle="Last 8 completed blocks" />
            {history.items.length ? (
              <div className="list">
                {history.items.slice(0, 8).map((item) => (
                  <div className="list-item" key={item._id}>
                    <div className="list-item-main">
                      <span className="list-item-title">{item.label || "Focus session"}</span>
                      <span className="list-item-sub">
                        {item.date} · {minutesToHm(Math.round((item.actualSeconds || 0) / 60))}
                      </span>
                    </div>
                    <Pill tone={item.status === "completed" ? "success" : "neutral"}>{item.status}</Pill>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No sessions yet. Your first block will appear here.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
