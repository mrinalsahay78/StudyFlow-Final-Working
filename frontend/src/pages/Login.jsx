import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import { Field, Input } from "../components/ui/Field";
import AuthLayout from "../components/ui/AuthLayout";

/**
 * Sign-in form. Credentials are never pre-filled and no demo account shortcut
 * is offered — the user types their own email and password.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await login(form.email.trim(), form.password);
      const target = location.state?.from?.pathname || "/app";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email and password you registered with."
      footer={
        <>
          New here? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form onSubmit={submit} className="stack" autoComplete="on">
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Email" htmlFor="login-email">
          <Input
            id="login-email"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="you@college.edu"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            autoFocus
          />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <div className="input-row">
            <Input
              id="login-password"
              type={show ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <div className="auth-split">
          <span className="muted small">Sessions last 30 days on this device.</span>
          <Link to="/forgot-password" className="small">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" icon={LogIn} loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
