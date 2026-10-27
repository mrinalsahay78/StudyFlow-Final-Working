import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Layers,
  ListChecks,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import Card, { CardHeader } from "../components/ui/Card";
import { Ring, Progress, Pill } from "../components/ui/Progress";
import { EmptyState, ErrorState, PageHeader, SkeletonRows } from "../components/ui/States";
import Button from "../components/ui/Button";
import { formatDay, greeting, minutesToHm, relativeDay } from "../lib/format";

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {Icon ? (
          <span className="stat-icon">
            <Icon size={14} />
          </span>
        ) : null}
      </div>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function TrendChart({ points }) {
  const max = Math.max(30, ...points.map((p) => p.minutes));
  return (
    <div className="trend">
      {points.map((p) => {
        const h = Math.round((p.minutes / max) * 100);
        return (
          <div className="trend-col" key={p.date} title={`${formatDay(p.date)} · ${minutesToHm(p.minutes)}`}>
            <div className="trend-bar" style={{ height: `${Math.max(p.minutes ? 6 : 2, h)}%` }} />
            <span className="trend-label">{formatDay(p.date, "d")}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi("/dashboard");

  const stats = data?.stats;
  const trend = useMemo(() => data?.trend || [], [data]);
  const nextExam = data?.upcomingExams?.[0];
  const subjectRows = useMemo(
    () => [...(data?.subjects || [])].sort((a, b) => a.progress - b.progress).slice(0, 5),
    [data],
  );

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading || !data) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Loading your semester…" />
        <SkeletonRows rows={5} />
      </>
    );
  }

  return (
    <div className="stack section-gap">
      <PageHeader
        eyebrow={greeting()}
        title={`${user?.name?.split(" ")[0] || "Student"}, here is your day`}
        subtitle={
          stats.minutesToday
            ? `${minutesToHm(stats.minutesToday)} logged today — ${stats.goalProgress}% of your ${minutesToHm(stats.dailyGoal)} goal.`
            : `Nothing logged yet today. Your goal is ${minutesToHm(stats.dailyGoal)}.`
        }
        actions={
          <>
            <Button icon={Timer} variant="primary" onClick={() => navigate("/app/focus")}>
              Start focus
            </Button>
            <Button icon={CalendarDays} onClick={() => navigate("/app/planner")}>
              Planner
            </Button>
          </>
        }
      />

      <div className="stat-grid">
        <Stat
          icon={Clock}
          label="Today"
          value={minutesToHm(stats.minutesToday)}
          hint={`Goal ${minutesToHm(stats.dailyGoal)} · ${stats.goalProgress}%`}
        />
        <Stat icon={Flame} label="Streak" value={`${stats.streak}d`} hint="Consecutive study days" />
        <Stat
          icon={TrendingUp}
          label="This week"
          value={minutesToHm(stats.minutesWeek)}
          hint={`${stats.focusSessionsToday} focus session${stats.focusSessionsToday === 1 ? "" : "s"} today`}
        />
        <Stat
          icon={BookOpen}
          label="Syllabus"
          value={`${stats.syllabusProgress}%`}
          hint={`${stats.topicsCompleted}/${stats.topicsTotal} topics`}
        />
        <Stat
          icon={ListChecks}
          label="Open tasks"
          value={stats.openTasks}
          hint={`${stats.dueToday} due today · ${stats.overdueTasks} overdue`}
          tone={stats.overdueTasks ? "danger" : undefined}
        />
        <Stat
          icon={Layers}
          label="Cards due"
          value={stats.flashcardsDue}
          hint="Spaced repetition queue"
        />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader
            icon={Target}
            title="Today's plan"
            subtitle={formatDay(data.today, "EEEE d MMMM")}
            action={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate("/app/planner")}>
                Open
              </Button>
            }
          />
          {data.plannerToday.length ? (
            <div className="list">
              {data.plannerToday.map((entry) => (
                <div className="list-item" key={entry._id}>
                  <span className="plan-chip-time">
                    {entry.start}–{entry.end}
                  </span>
                  <div className="list-item-main">
                    <span className="list-item-title">{entry.title}</span>
                    <span className="list-item-sub">
                      {entry.kind} · {minutesToHm(entry.minutes)}
                      {entry.completed ? " · done" : ""}
                    </span>
                  </div>
                  <Pill tone={entry.completed ? "success" : "info"}>{entry.kind}</Pill>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No blocks planned today"
              body="Generate a plan for the next 7 days, or add a block manually."
              action={
                <Button size="sm" onClick={() => navigate("/app/planner")}>
                  Plan the week
                </Button>
              }
            />
          )}
          {data.timetable.length ? (
            <>
              <div className="divider" />
              <span className="eyebrow">Classes today</span>
              <div className="list section-gap">
                {data.timetable.map((cls) => (
                  <div className="list-item" key={cls._id}>
                    <span className="plan-chip-time">
                      {cls.start}–{cls.end}
                    </span>
                    <div className="list-item-main">
                      <span className="list-item-title">{cls.title}</span>
                      <span className="list-item-sub">{cls.room || "Class"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Card>

        <Card>
          <CardHeader icon={Sparkles} title="What to do next" subtitle="Derived from your own records" />
          {data.recommendations.length ? (
            <div className="list">
              {data.recommendations.map((rec) => (
                <button
                  key={rec.id}
                  className={`reco tone-${rec.tone === "danger" ? "danger" : rec.tone === "warn" ? "warning" : "info"}`}
                  onClick={() => navigate(`/app/${String(rec.href).replace(/^#/, "")}`)}
                >
                  <span className="reco-dot" />
                  <span className="grow">
                    <strong>{rec.title}</strong>
                    <span className="muted small">{rec.body}</span>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="Nothing needs attention" body="Your plan, deadlines and cards are all clear." />
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader
            icon={TrendingUp}
            title="Study trend"
            subtitle="Last 14 days"
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate("/app/analytics")}>
                Analytics
              </Button>
            }
          />
          <TrendChart points={trend} />
        </Card>

        <Card>
          <CardHeader
            icon={BookOpen}
            title="Syllabus progress"
            subtitle="Weakest subjects first"
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate("/app/subjects")}>
                Subjects
              </Button>
            }
          />
          {subjectRows.length ? (
            <div className="stack">
              {subjectRows.map((s) => (
                <div key={s.id} className="stack" style={{ gap: 4 }}>
                  <div className="row-between">
                    <Link to={`/app/subjects/${s.id}`} className="row" style={{ gap: 8 }}>
                      <span className="dot" style={{ background: s.color || "var(--accent)" }} />
                      <strong className="small">{s.name}</strong>
                    </Link>
                    <span className="muted small">
                      {s.completed}/{s.topics} topics · {minutesToHm(s.minutes)}
                    </span>
                  </div>
                  <Progress value={s.progress} size="sm" tone={s.progress < 40 ? "warning" : "accent"} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No subjects yet"
              body="Add a subject with its units to unlock syllabus tracking, planning and analytics."
              action={
                <Button size="sm" variant="primary" onClick={() => navigate("/app/subjects")}>
                  Add subject
                </Button>
              }
            />
          )}
        </Card>
      </div>

      <div className="grid grid-3">
        <Card>
          <CardHeader icon={GraduationCap} title="Next exam" />
          {nextExam ? (
            <div className="stack">
              <strong>{nextExam.title}</strong>
              <span className="muted small">
                {relativeDay(nextExam.date)} · {formatDay(nextExam.date, "EEEE d MMM")}
                {nextExam.time ? ` at ${nextExam.time}` : ""}
              </span>
              {nextExam.location ? <span className="muted small">{nextExam.location}</span> : null}
              <Button size="sm" onClick={() => navigate("/app/planner")}>
                Plan revision
              </Button>
            </div>
          ) : (
            <EmptyState compact icon={GraduationCap} title="No upcoming exams" body="Add exam dates to get a revision plan." />
          )}
        </Card>

        <Card>
          <CardHeader icon={AlertTriangle} title="Overdue & due soon" />
          {data.overdue.length || data.dueSoon.length ? (
            <div className="list">
              {data.overdue.map((t) => (
                <div className="list-item" key={t._id}>
                  <div className="list-item-main">
                    <span className="list-item-title">{t.title}</span>
                    <span className="list-item-sub">Due {formatDay(t.dueDate)}</span>
                  </div>
                  <Pill tone="danger">Overdue</Pill>
                </div>
              ))}
              {data.dueSoon.map((t) => (
                <div className="list-item" key={t._id}>
                  <div className="list-item-main">
                    <span className="list-item-title">{t.title}</span>
                    <span className="list-item-sub">{relativeDay(t.dueDate)}</span>
                  </div>
                  <Pill tone="warning">Soon</Pill>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={CheckCircle2} title="Nothing overdue" body="Every deadline is under control." />
          )}
        </Card>

        <Card>
          <CardHeader icon={Target} title="Daily goal" />
          <div className="row" style={{ justifyContent: "center", padding: "8px 0" }}>
            <Ring
              value={stats.goalProgress}
              label={minutesToHm(stats.minutesToday)}
              sub={`of ${minutesToHm(stats.dailyGoal)}`}
              size={128}
            />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row-between small">
              <span className="muted">Quiz accuracy</span>
              <strong>{stats.quizAccuracy === null ? "—" : `${stats.quizAccuracy}%`}</strong>
            </div>
            <div className="row-between small">
              <span className="muted">Problems solved</span>
              <strong>{stats.problemsSolved}</strong>
            </div>
            <div className="row-between small">
              <span className="muted">Active goals</span>
              <strong>{data.goals.length}</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
