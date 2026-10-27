import React from "react";
import clsx from "clsx";

export function Field({ label, hint, error, children, className, htmlFor }) {
  return (
    <label className={clsx("field", className)} htmlFor={htmlFor}>
      {label ? <span className="field-label">{label}</span> : null}
      {children}
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }) {
  return <input className={clsx("input", className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={clsx("input textarea", className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={clsx("input select", className)} {...rest}>
      {children}
    </select>
  );
}
