import React, { useState } from "react";
import { KeyRound, Monitor, Moon, Palette, Save, Sun, Trash2, User } from "lucide-react";
import { del, put } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Field";
import { Card, CardHeader } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/States";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export default function Settings() {
  const { user, updateProfile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  const [profile, setProfile] = useState({
    name: user?.name || "",
    course: user?.course || "",
    college: user?.college || "",
    branch: user?.branch || "",
    semester: user?.semester ?? "",
  });
  const [prefs, setPrefs] = useState({
    dailyGoalMinutes: user?.prefs?.dailyGoalMinutes ?? 120,
    studyDays: user?.prefs?.studyDays ?? [0, 1, 2, 3, 4, 5, 6],
    dayStart: user?.prefs?.dayStart || "08:00",
    dayEnd: user?.prefs?.dayEnd || "23:00",
    pomodoroFocus: user?.prefs?.pomodoroFocus ?? 25,
    pomodoroBreak: user?.prefs?.pomodoroBreak ?? 5,
    notifications: user?.prefs?.notifications ?? true,
  });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({
        ...profile,
        semester: profile.semester === "" ? undefined : Number(profile.semester),
      });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePrefs = async (e) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      await updateProfile({
        prefs: {
          ...prefs,
          dailyGoalMinutes: Number(prefs.dailyGoalMinutes) || 0,
          pomodoroFocus: Number(prefs.pomodoroFocus) || 25,
          pomodoroBreak: Number(prefs.pomodoroBreak) || 5,
        },
      });
      toast.success("Preferences saved");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingPrefs(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwords.newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      await put("/auth/password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Password changed");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await del("/auth/account", { password: deletePassword });
      toast.success("Account deleted");
      await logout();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleDay = (idx) => {
    setPrefs((p) => ({
      ...p,
      studyDays: p.studyDays.includes(idx) ? p.studyDays.filter((d) => d !== idx) : [...p.studyDays, idx].sort(),
    }));
  };

  const chooseTheme = async (value) => {
    setTheme(value);
    try {
      await updateProfile({ theme: value });
    } catch {
      /* theme is a local preference too — a failed sync is not worth an error toast */
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Account" title="Settings" subtitle="Your details, study defaults and session security." />

      <div className="grid grid-2">
        <Card>
          <CardHeader icon={User} title="Profile" subtitle="Used on your dashboard and in exports." />
          <form className="form-grid" onSubmit={saveProfile}>
            <Field label="Full name" htmlFor="set-name" required>
              <Input
                id="set-name"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                required
                minLength={2}
              />
            </Field>
            <Field label="Email" htmlFor="set-email" hint="Email changes are not supported — contact an admin.">
              <Input id="set-email" value={user?.email || ""} disabled />
            </Field>
            <div className="form-row">
              <Field label="Course" htmlFor="set-course">
                <Input
                  id="set-course"
                  value={profile.course}
                  onChange={(e) => setProfile((p) => ({ ...p, course: e.target.value }))}
                  placeholder="B.Tech Computer Science"
                />
              </Field>
              <Field label="Semester" htmlFor="set-semester">
                <Input
                  id="set-semester"
                  type="number"
                  min="1"
                  max="12"
                  value={profile.semester}
                  onChange={(e) => setProfile((p) => ({ ...p, semester: e.target.value }))}
                />
              </Field>
            </div>
            <div className="form-row">
              <Field label="College" htmlFor="set-college">
                <Input
                  id="set-college"
                  value={profile.college}
                  onChange={(e) => setProfile((p) => ({ ...p, college: e.target.value }))}
                />
              </Field>
              <Field label="Branch" htmlFor="set-branch">
                <Input
                  id="set-branch"
                  value={profile.branch}
                  onChange={(e) => setProfile((p) => ({ ...p, branch: e.target.value }))}
                />
              </Field>
            </div>
            <div className="row-between">
              <span className="muted tiny">Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span>
              <Button variant="primary" icon={Save} type="submit" loading={savingProfile}>
                Save profile
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader icon={Palette} title="Appearance" subtitle="Applies instantly, saved to your account." />
          <div className="stack" style={{ gap: 8 }}>
            {THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  className={`mode-row${theme === t.value ? " active" : ""}`}
                  onClick={() => chooseTheme(t.value)}
                >
                  <Icon size={14} />
                  <span className="grow">{t.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="section-gap">
        <CardHeader title="Study defaults" subtitle="The planner and pomodoro timer read these." />
        <form className="form-grid" onSubmit={savePrefs}>
          <div className="form-row">
            <Field label="Daily goal (minutes)" htmlFor="pref-goal">
              <Input
                id="pref-goal"
                type="number"
                min="0"
                max="1440"
                value={prefs.dailyGoalMinutes}
                onChange={(e) => setPrefs((p) => ({ ...p, dailyGoalMinutes: e.target.value }))}
              />
            </Field>
            <Field label="Notifications" htmlFor="pref-notifications">
              <Select
                id="pref-notifications"
                value={prefs.notifications ? "on" : "off"}
                onChange={(e) => setPrefs((p) => ({ ...p, notifications: e.target.value === "on" }))}
              >
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </Select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="Day starts" htmlFor="pref-start">
              <Input
                id="pref-start"
                type="time"
                value={prefs.dayStart}
                onChange={(e) => setPrefs((p) => ({ ...p, dayStart: e.target.value }))}
              />
            </Field>
            <Field label="Day ends" htmlFor="pref-end">
              <Input
                id="pref-end"
                type="time"
                value={prefs.dayEnd}
                onChange={(e) => setPrefs((p) => ({ ...p, dayEnd: e.target.value }))}
              />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Pomodoro focus (min)" htmlFor="pref-focus">
              <Input
                id="pref-focus"
                type="number"
                min="1"
                max="180"
                value={prefs.pomodoroFocus}
                onChange={(e) => setPrefs((p) => ({ ...p, pomodoroFocus: e.target.value }))}
              />
            </Field>
            <Field label="Pomodoro break (min)" htmlFor="pref-break">
              <Input
                id="pref-break"
                type="number"
                min="1"
                max="60"
                value={prefs.pomodoroBreak}
                onChange={(e) => setPrefs((p) => ({ ...p, pomodoroBreak: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Study days" hint="Used when the planner spreads work across the week.">
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={`mode-chip${prefs.studyDays.includes(idx) ? " active" : ""}`}
                  onClick={() => toggleDay(idx)}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <div className="row-between">
            <span className="muted tiny">Leave at least one study day or the planner will refuse to generate.</span>
            <Button variant="primary" icon={Save} type="submit" loading={savingPrefs}>
              Save preferences
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid grid-2 section-gap">
        <Card>
          <CardHeader icon={KeyRound} title="Password" subtitle="Changing it keeps this session signed in." />
          <form className="form-grid" onSubmit={changePassword}>
            <Field label="Current password" htmlFor="pwd-current" required>
              <Input
                id="pwd-current"
                type="password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </Field>
            <div className="form-row">
              <Field label="New password" htmlFor="pwd-new" required>
                <Input
                  id="pwd-new"
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm new password" htmlFor="pwd-confirm" required>
                <Input
                  id="pwd-confirm"
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <Button variant="primary" icon={KeyRound} type="submit" loading={savingPassword}>
              Change password
            </Button>
          </form>
        </Card>

        <Card className="danger-card">
          <CardHeader icon={Trash2} title="Delete account" subtitle="Irreversible." />
          <p className="muted small">
            This removes your account and every document it owns — subjects, topics, tasks, sessions, quizzes,
            notes and uploaded files. There is no recovery.
          </p>
          <Button variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </Card>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete account" subtitle="Confirm with your password.">
        <div className="form-grid">
          <Field label="Password" htmlFor="delete-password" required>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <div className="row-between">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} disabled={!deletePassword} onClick={deleteAccount}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
