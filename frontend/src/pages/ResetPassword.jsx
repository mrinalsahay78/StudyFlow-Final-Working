import React, { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { post } from "../lib/api";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import AuthLayout from "../components/ui/AuthLayout";

/**
 * The backend emails `/#reset-password?token=...`; a hash is not visible to the
 * router, so the token is read from both the search string and the raw hash.
 */
function readToken(searchParams) {
  const fromQuery = searchParams.get("token");
  if (fromQuery) return fromQuery;
  if (typeof window === "undefined") return "";
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q === -1) return "";
  return new URLSearchParams(hash.slice(q + 1)).get("token") || "";
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => readToken(searchParams), [searchParams]);
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await post("/auth/reset-password", { token, password: form.password });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err.message || "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout
        title="Reset link missing"
        subtitle="Open the link from your reset email, or request a new one."
        footer={
          <Link to="/forgot-password">Request a new link</Link>
        }
      >
        <div className="auth-error">
          This page needs a valid reset token. The link you opened does not contain one.
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Your other sessions stay signed in."
      footer={
        <Link to="/login">Back to sign in</Link>
      }
    >
      {done ? (
        <div className="auth-note">Password updated. Redirecting you to sign in…</div>
      ) : (
        <form onSubmit={submit} className="stack">
          {error ? <div className="auth-error">{error}</div> : null}
          <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
            <Input
              id="reset-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password" htmlFor="reset-confirm">
            <Input
              id="reset-confirm"
              type="password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" variant="primary" icon={KeyRound} loading={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
