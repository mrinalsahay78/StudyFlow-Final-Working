# StudyFlow v7 → v8 baseline audit

Audit performed on `~/Downloads/StudyFlow-Final-Working` before any changes.
Backup of the untouched original: `~/StudyFlow-Backups/StudyFlow-Final-Working-20261027-233512.tar.gz`
Database dump of the existing data: `~/StudyFlow-Backups/mongo-20261027-233512/`

## What the existing project actually contained

| Area | Finding |
| --- | --- |
| Frontend | React 18 + Vite 6, **all 1,603 lines in a single `src/main.jsx`**, 1,442-line `styles.css`, hash-based manual routing |
| Backend | Express 4, **all 592 lines in `server.js`**, one generic `crud()` factory |
| Database | MongoDB via Mongoose 8 — running locally (`mongodb-community`), data present |
| Auth | JWT in `localStorage`, bcrypt hashing, no rate limiting, no reset flow, no cookie session |
| Tests | none |
| Env files | only `.env.example`, no `.gitignore` (`.env` would have been committed) |
| GitHub | remote `mrinalsahay78/StudyFlow-Final-Working` exists but the repository is **empty** — no code was ever pushed |

## Verified defects (reproduced, not guessed)

1. **Login impossible from any non-5173 port.** CORS whitelist is hard-coded to
   `http://127.0.0.1:5173` / `localhost:5173`. Starting Vite on 5273 (or any other
   port, or a deployed domain) makes every request fail with `Failed to fetch`.
   Reproduced in the browser: the login form shows "Failed to fetch" and the whole
   app is unreachable behind it.
2. **Bundled demo credentials.** `demo@studyflow.com / Demo@123` was pre-filled in the
   login form, printed on screen and seeded by `npm run seed`. Explicitly disallowed.
3. **No password recovery, no logout invalidation, no rate limiting, no server-side
   input validation** (Mongoose errors were returned to the client verbatim).
4. **`GET /api/analytics` was wrong**: `weekly` used `sessions.slice(-7)` (the last seven
   *records*, not seven days) and counted sessions regardless of completion.
5. **Timetable and planner had no conflict detection**, and no way to tell a missed
   session from a completed one.
6. **N+1 and unbounded queries**: `GET /api/dashboard` loaded every document for the user
   on every page load; no pagination anywhere.
7. **`server.js` bound to `127.0.0.1` only**, so the API could never be deployed.
8. **Dependency vulnerabilities**: `body-parser` (high, DoS), `qs` (moderate) — both
   fixed by upgrading the express tree; `npm audit` now reports 0.
9. No `.gitignore` → `.env`, `node_modules` and build output would be committed.
10. Data model was flat: no syllabus tree (units/topics), no quizzes, notes, files,
    flashcards, projects, coding log, lab journal, achievements or AI hooks.

## Baseline that was confirmed working (and is preserved)

- bcrypt password hashing, JWT issuance, `auth` middleware attaching `req.user`
- every planner collection scoped by `userId` (no cross-user leak was found)
- the "universal completion" contract: `completed` + `completedAt` on every planner
  collection, plus the History view that aggregates them
- dark UI shell, error boundary, and the free-form focus timer (no forced 25 minutes)

## Existing data preserved

`users` (1 account, demo@studyflow.com), `subjects` (3). No tasks, sessions, exams,
assignments or goals existed yet. The v8 migration adds new fields in place and folds
the old `assignments` collection into `tasks` without deleting documents.
