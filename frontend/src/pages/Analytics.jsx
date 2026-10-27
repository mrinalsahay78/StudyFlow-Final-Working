import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, Flame, Target, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import Button from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Progress } from "../components/ui/Progress";
import { ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import { formatDay, minutesToHm } from "../lib/format";

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

function Sparkline({ data, height = 64 }) {
  const max = Math.max(1, ...data.map((d) => d.minutes));
  return (
    <div className="sparkline" style={{ height }}>
      {data.map((d) => (
        <div
          key={d.date}
          className="spark-bar"
          style={{ height: `${Math.max(2, (d.minutes / max) * 100)}%` }}
          title={`${formatDay(d.date)} · ${minutesToHm(d.minutes)}`}
        />
      ))}
    </div>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(`/analytics?days=${days}`);
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const data = state.data;

  const maxSubjectMinutes = useMemo(
    () => Math.max(1, ...(data?.subjectMinutes || []).map((s) => s.minutes)),
    [data],
  );

  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        subtitle="Every number here is computed from sessions you actually logged."
        actions={
          <div className="row" style={{ gap: 4 }}>
            {RANGES.map((r) => (
              <button
                key={r.days}
                className={`mode-chip${days === r.days ? " active" : ""}`}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {state.loading || !data ? (
        <SkeletonRows rows={5} />
      ) : (
        <>
          <div className="grid grid-4">
            <Card className="stat">
              <div className="stat-top">
                <span>Total study</span>
                <span className="stat-icon">
                  <Clock size={14} />
                </span>
              </div>
              <strong>{minutesToHm(data.totals.minutes)}</strong>
              <small>{data.totals.sessions} sessions in {data.range.days} days</small>
            </Card>
            <Card className="stat">
              <div className="stat-top">
                <span>Consistency</span>
                <span className="stat-icon">
                  <Flame size={14} />
                </span>
              </div>
              <strong>{data.totals.consistency}%</strong>
              <small>{data.totals.activeDays} active days</small>
            </Card>
            <Card className="stat">
              <div className="stat-top">
                <span>Avg active day</span>
                <span className="stat-icon">
                  <TrendingUp size={14} />
                </span>
              </div>
              <strong>{minutesToHm(data.totals.averagePerActiveDay)}</strong>
              <small>Per day with at least 1 minute</small>
            </Card>
            <Card className="stat">
              <div className="stat-top">
                <span>Quiz accuracy</span>
                <span className="stat-icon">
                  <Target size={14} />
                </span>
              </div>
              <strong>{data.quiz.averageAccuracy === null ? "—" : `${data.quiz.averageAccuracy}%`}</strong>
              <small>{data.quiz.attempts} attempts</small>
            </Card>
          </div>

          <Card className="section-gap">
            <CardHeader icon={BarChart3} title="Daily minutes" subtitle={`Last ${data.range.days} days — hover a bar for the exact value`} />
            <Sparkline data={data.daily} height={100} />
            <div className="row-between">
              <span className="muted tiny">{formatDay(data.range.from)}</span>
              <span className="muted tiny">{formatDay(data.range.to)}</span>
            </div>
          </Card>

          <div className="grid grid-2 section-gap">
            <Card>
              <CardHeader title="Time per subject" subtitle="Where your hours actually went" />
              {data.subjectMinutes.length ? (
                <div className="stack" style={{ gap: 8 }}>
                  {data.subjectMinutes.map((s) => (
                    <div key={s.id} className="stack" style={{ gap: 3 }}>
                      <div className="row-between small">
                        <span className="grow">{s.name}</span>
                        <span className="muted tiny">
                          {minutesToHm(s.minutes)} · {s.completed}/{s.topics} topics
                        </span>
                      </div>
                      <Progress
                        value={Math.round((s.minutes / maxSubjectMinutes) * 100)}
                        tone={s.minutes ? "accent" : "neutral"}
                        size="sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No sessions yet — log one from the focus timer.</p>
              )}
            </Card>

            <Card>
              <CardHeader title="Workload health" subtitle="Tasks, assignments and exams" />
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <div className="row-between small">
                    <span>Task completion</span>
                    <span className="muted tiny">
                      {data.taskStats.done}/{data.taskStats.total}
                    </span>
                  </div>
                  <Progress value={data.taskStats.completionRate} tone="success" />
                </div>
                <div className="row-between small">
                  <span className="muted">Overdue tasks</span>
                  <strong>{data.taskStats.overdue}</strong>
                </div>
                <div className="row-between small">
                  <span className="muted">Assignments done</span>
                  <strong>
                    {data.assignments.done}/{data.assignments.total}
                  </strong>
                </div>
                <div className="row-between small">
                  <span className="muted">Exams completed</span>
                  <strong>
                    {data.exams.completed}/{data.exams.total}
                  </strong>
                </div>
                <div className="row-between small">
                  <span className="muted">Best study hour</span>
                  <strong>{data.bestStudyHour ? `${String(data.bestStudyHour).padStart(2, "0")}:00` : "—"}</strong>
                </div>
                <div className="row-between small">
                  <span className="muted">Coding problems solved</span>
                  <strong>
                    {data.coding.solved} <span className="muted tiny">(E{data.coding.easy} · M{data.coding.medium} · H{data.coding.hard})</span>
                  </strong>
                </div>
              </div>
            </Card>
          </div>

          {!data.totals.sessions ? (
            <Card className="section-gap">
              <CardHeader title="Nothing to chart yet" subtitle="Analytics need real study minutes." />
              <p className="muted small">
                Run one focus block or add a manual session — the charts fill in from your own records, nothing is
                estimated.
              </p>
              <Button variant="primary" onClick={load}>
                Refresh
              </Button>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
