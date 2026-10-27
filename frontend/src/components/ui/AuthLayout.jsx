import React from "react";
import { Link } from "react-router-dom";

/**
 * Shared two-column shell for login, register and password reset.
 * `points` renders as a checklist on the marketing side.
 */
export default function AuthLayout({ title, lede, points = [], footer, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <span className="brand-mark">✦</span>
          <span className="brand-text">
            StudyFlow<span className="brand-ai">AI</span>
          </span>
        </Link>
        <div>
          <h1>{title}</h1>
          {lede ? <p className="lede">{lede}</p> : null}
          {points.length ? (
            <div className="auth-points">
              {points.map((p) => (
                <span className="auth-point" key={p}>
                  <span aria-hidden>✓</span> {p}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <p className="small muted">{footer || "Your data stays private to your account."}</p>
      </aside>
      <div className="auth-form-wrap">{children}</div>
    </div>
  );
}
