# StudyFlow AI

Study platform for engineering students: syllabus tracking, smart planner, focus timer,
quizzes, spaced repetition, an AI study assistant, and analytics.

- **Frontend** — React 18 + Vite 6 + React Router 7 (`frontend/`)
- **Backend** — Node 20 + Express 4 + Mongoose 8 (`backend/`), version 8.0.0
- **Database** — MongoDB (local `mongod` in development, MongoDB Atlas in production)

## Layout

```
backend/            Express API (routes, models, middleware, config)
frontend/           React SPA (pages, components, hooks, lib/api.js)
docs/DEPLOY.md      Production deployment (Render + Atlas, optional Vercel UI)
docs/BASELINE-AUDIT.md
Dockerfile          Single-origin production image (API + built SPA)
render.yaml         Render blueprint for the Docker image
frontend/vercel.json  Optional static hosting for the UI
```

## Run it locally

Requirements: Node 20+, MongoDB 7 (`brew services start mongodb-community`, or Docker).

**1. Configure**

```bash
cp backend/.env.example backend/.env     # then edit values
```

At minimum set `MONGO_URI`. For local development the defaults work:
`PORT=5001`, `HOST=127.0.0.1`, `MONGO_URI=mongodb://127.0.0.1:27017/studyflow`.

**2. Backend**

```bash
cd backend
npm install
npm run seed:demo     # optional: starter subjects + demo account
npm run dev           # http://127.0.0.1:5001
curl http://127.0.0.1:5001/api/health
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev           # http://127.0.0.1:5173 (proxies /api to :5001)
```

The Vite dev server proxies `/api` to `http://127.0.0.1:5001`, so the browser only ever
talks to one origin and no CORS setup is needed. Override the proxy target with
`VITE_DEV_API`, and point the SPA at a remote API with `VITE_API_URL` (see
`frontend/.env.example`).

**Demo account** (only if you ran `npm run seed:demo`): `demo@studyflow.com` / `Demo@123`.
The login form is always empty — credentials are never pre-filled in the UI.

## Production

The API and the built SPA are served by **one Express process on one origin** (see
`Dockerfile`), which removes CORS from the equation:

```bash
docker build -t studyflow .
docker run -p 5001:5001 -e JWT_SECRET=$(openssl rand -hex 48) \
  -e MONGO_URI="mongodb+srv://..." -e PUBLIC_URL="https://your-host" studyflow
```

In production the server **refuses to start** without `JWT_SECRET`, and `/api/health`
reports `database: true` once MongoDB is reachable. Full step-by-step (Atlas, Render
blueprint, optional Vercel UI, post-deploy checklist): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Notes

- `AI_PROVIDER` / `AI_API_KEY` are optional. Unset, the assistant labels its answers as
  built-in frameworks instead of pretending to be model output.
- Password reset logs the reset link to the server console when SMTP is not configured.
- `npm test` in `backend/` runs the API suite with Node's built-in runner
  (`node --test "tests/**/*.test.js"`). It boots the real Express app against an in-memory
  MongoDB (`mongodb-memory-server`, which fetches a `mongod` binary on first run), so it
  needs no local database and no running server. Coverage: auth flows, core CRUD,
  user-to-user data isolation, file upload/download and validation errors.
