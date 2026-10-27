import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Button from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import AuthLayout from "../components/ui/AuthLayout";

const SEMESTERS = Array.from({ length: 12 }, (_, i) => i + 1);

const empty = {
  name: "",
  email: "",
  password: "",
  confirm: "",
  course: "Computer Engineering",
  branch: "",
  college: "",
  semester: "1",
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        course: form.course.trim() || undefined,
        branch: form.branch.trim() || undefined,
        college: form.college.trim() || undefined,
        semester: Number(form.semester) || 1,
      });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.message || "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Two minutes now saves you a semester of guesswork."
      footer={
        <>
          Already registered? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} className="stack" autoComplete="on">
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Full name" htmlFor="reg-name">
          <Input id="reg-name" value={form.name} onChange={set("name")} autoComplete="name" placeholder="Omkar Sahay" required />
        </Field>
        <Field label="Email" htmlFor="reg-email">
          <Input
            id="reg-email"
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
            placeholder="you@college.edu"
            required
          />
        </Field>
        <div className="form-row">
          <Field label="Password" htmlFor="reg-password" hint="At least 8 characters.">
            <Input
              id="reg-password"
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm password" htmlFor="reg-confirm">
            <Input
              id="reg-confirm"
              type="password"
              value={form.confirm}
              onChange={set("confirm")}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Course" htmlFor="reg-course">
            <Input id="reg-course" value={form.course} onChange={set("course")} placeholder="Computer Engineering" />
          </Field>
          <Field label="Semester" htmlFor="reg-sem">
            <Select id="reg-sem" value={form.semester} onChange={set("semester")}>
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Branch" htmlFor="reg-branch" hint="Optional">
            <Input id="reg-branch" value={form.branch} onChange={set("branch")} placeholder="AI & ML" />
          </Field>
          <Field label="College" htmlFor="reg-college" hint="Optional">
            <Input id="reg-college" value={form.college} onChange={set("college")} placeholder="College name" />
          </Field>
        </div>
        <Button type="submit" variant="primary" icon={UserPlus} loading={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
