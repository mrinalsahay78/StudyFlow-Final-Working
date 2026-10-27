import React from "react";
import clsx from "clsx";

export function Progress({ value = 0, tone = "accent", size = "md", label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={clsx("progress", `progress-${size}`, `tone-${tone}`)}>
      {label ? (
        <div className="progress-head">
          <span>{label}</span>
          <strong>{pct}%</strong>
        </div>
      ) : null}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Ring({ value = 0, size = 96, stroke = 8, label, sub }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(pct)}%`}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ring-fg"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <strong>{label ?? `${Math.round(pct)}%`}</strong>
        {sub ? <span>{sub}</span> : null}
      </div>
    </div>
  );
}

export function Pill({ tone = "neutral", children, className }) {
  return <span className={clsx("pill", `pill-${tone}`, className)}>{children}</span>;
}
