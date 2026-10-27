import React from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import Button from "./Button";

export function Spinner({ label }) {
  return (
    <div className="loading-block">
      <Loader2 className="spin" size={18} />
      <span>{label || "Loading…"}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 3 }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skeleton-row" key={i}>
          <div className="skeleton skeleton-line" style={{ width: `${70 - i * 8}%` }} />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, body, action, compact = false }) {
  return (
    <div className={compact ? "empty compact" : "empty"}>
      <span className="empty-icon">
        <Icon size={compact ? 18 : 22} />
      </span>
      <div>
        <h4>{title}</h4>
        {body ? <p>{body}</p> : null}
      </div>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={18} />
      <div>
        <h4>Could not load this data</h4>
        <p>{error?.message || "Unknown error"}</p>
      </div>
      {onRetry ? (
        <Button size="sm" icon={RefreshCw} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
