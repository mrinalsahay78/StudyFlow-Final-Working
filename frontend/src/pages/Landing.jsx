import React from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Layers,
  LineChart,
  Lock,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Syllabus that knows where you are",
    body: "Subjects → units → topics with completion, revision status, difficulty and estimated minutes. Progress is computed, never guessed.",
  },
  {
    icon: CalendarCheck,
    title: "A planner that fits your real week",
    body: "Blocks are generated around your timetable, existing plans and deadlines — and conflicts are reported instead of silently overlapping.",
  },
  {
    icon: Timer,
    title: "Focus sessions that get logged",
    body: "Pomodoro or continuous timer with pause/resume. Every finished session becomes study minutes you can audit.",
  },
  {
    icon: Brain,
    title: "Spaced repetition, not re-reading",
    body: "Flashcards and quizzes score themselves, and cards come back exactly when you are about to forget them.",
  },
  {
    icon: LineChart,
    title: "Analytics you can act on",
    body: "Study hours, consistency, weakest topics, best study hour and accuracy trend — all from your own records.",
  },
  {
    icon: Sparkles,
    title: "An assistant with your context",
    body: "Explain, summarise, generate flashcards or a quiz, plan revision or drill you for a viva — with your subjects in the prompt.",
  },
];

const STEPS = [
  { title: "Add your subjects", body: "Pick a starter template or build your syllabus unit by unit." },
  { title: "Plan the week", body: "Generate study blocks around classes, then drag your priorities in." },
  { title: "Study and revise", body: "Run focus sessions, take quizzes, review the cards that are due." },
  { title: "See what worked", body: "Analytics show which subjects and topics need the next hour." },
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-mark">✦</span>
          <span className="brand-text">
            StudyFlow<span className="brand-ai">AI</span>
          </span>
        </Link>
        <div className="landing-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
        </div>
        <div className="landing-cta">
          <Link to="/login" className="btn btn-ghost">
            <span>Sign in</span>
          </Link>
          <Link to="/register" className="btn btn-primary">
            <span>Get started</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </nav>

      <header className="hero">
        <div>
          <span className="eyebrow">Built for engineering students</span>
          <h1>
            Your semester, <span className="accent-text">planned and measured</span> — not just noted
            down.
          </h1>
          <p className="lede">
            StudyFlow tracks your syllabus topic by topic, builds a study plan around your timetable,
            logs the minutes you actually study, and brings topics back for revision exactly when you
            need them.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              <span>Create your account</span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              <span>I already have one</span>
            </Link>
          </div>
          <div className="hero-trust">
            <span>
              <CheckCircle2 size={15} /> No demo data in your account
            </span>
            <span>
              <Lock size={15} /> Your notes stay private
            </span>
            <span>
              <Clock size={15} /> Works without a paid AI key
            </span>
          </div>
        </div>

        <div className="hero-card">
          <div className="mock-window">
            <div className="mock-top">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="muted small">studyflow / dashboard</span>
            </div>
            <div className="mock-body">
              <div className="mock-stats">
                <div className="mock-stat">
                  <span>Today</span>
                  <strong>1h 40m</strong>
                </div>
                <div className="mock-stat">
                  <span>Streak</span>
                  <strong>6 days</strong>
                </div>
                <div className="mock-stat">
                  <span>Syllabus</span>
                  <strong>48%</strong>
                </div>
              </div>
              <div className="mock-bars" aria-hidden>
                {[38, 62, 45, 80, 54, 92, 70, 48, 66, 84, 40, 58, 74, 52].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mock-list">
                <div className="mock-row">
                  <Target size={14} /> <span>Operating Systems — Process scheduling</span>
                </div>
                <div className="mock-row">
                  <Layers size={14} /> <span>DBMS quiz due · 12 cards</span>
                </div>
                <div className="mock-row">
                  <BarChart3 size={14} /> <span>Weakest topic: Normalisation</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="section" id="features">
        <div className="section-head">
          <span className="eyebrow">What it does</span>
          <h2>Six systems that cover a real semester</h2>
          <p className="muted">
            Each one is a working feature backed by stored data — not a placeholder card.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon">
                <Icon size={18} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Four steps, then it runs itself</h2>
        </div>
        <div className="grid-4">
          {STEPS.map((step, i) => (
            <article className="card" key={step.title}>
              <div className="card-header">
                <div className="card-heading">
                  <span className="card-icon">{i + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                  </div>
                </div>
              </div>
              <p className="muted small">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="privacy">
        <div className="card">
          <div className="card-header">
            <div className="card-heading">
              <span className="card-icon">
                <Lock size={16} />
              </span>
              <div>
                <h3>Your data is yours</h3>
                <p>Ownership is enforced on every single query, not just the UI.</p>
              </div>
            </div>
          </div>
          <ul className="checklist">
            <li>Every record is scoped to your user id on the server — one student can never read another's data.</li>
            <li>Uploaded files are served only through an authenticated route that re-checks ownership.</li>
            <li>Passwords are hashed with bcrypt; sessions use signed tokens with httpOnly cookies.</li>
            <li>You can export or delete your account and everything in it from Settings.</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="cta-band">
          <div>
            <h2>Start with your own subjects</h2>
            <p className="muted">No seeded demo account, no fake progress. Just your semester.</p>
          </div>
          <Link to="/register" className="btn btn-primary btn-lg">
            <span>Create your account</span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span className="muted small">StudyFlow AI — an engineering study platform.</span>
        <div className="landing-links">
          <Link to="/login">Sign in</Link>
          <Link to="/register">Register</Link>
        </div>
      </footer>
    </div>
  );
}
