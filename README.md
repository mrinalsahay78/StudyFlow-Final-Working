# StudyFlow v7 — Advanced Student Study Planner

A polished local full-stack student study planner for macOS: React/Vite + Express + MongoDB/Mongoose.

## What is included

- Creative public home page before login
- Separate Login and Register screens
- JWT + bcrypt authentication
- Dashboard
- Subjects, Tasks, Study Sessions, Timetable, Exams, Assignments and Goals
- Analytics
- Profile
- Custom focus timer: choose any minutes/seconds instead of being locked to 25 minutes
- Timer presets plus custom session name
- Timer state saved in the browser
- Dark visual design and responsive layout
- Error boundary so unexpected React errors do not leave a blank page
- Task priority normalization for low/medium/high

## Demo account

- Email: `demo@studyflow.com`
- Password: `Demo@123`

## Terminal 1 — MongoDB

```bash
docker start studyflow-mongo 2>/dev/null || docker run -d \
  --name studyflow-mongo \
  -p 27017:27017 \
  -v studyflow_mongo_data:/data/db \
  mongo:7
```

## Terminal 2 — Backend

```bash
cd ~/Downloads/StudyFlow-Final-Working-v7/backend
PID=$(lsof -ti :5001); [ -n "$PID" ] && kill -9 $PID
npm install
npm run seed
npm run dev
```

Backend: http://127.0.0.1:5001

Verify:

```bash
curl http://127.0.0.1:5001/api/health
```

Expected JSON contains `"status":"ok"` and `"version":"7.0.0"`.

## Terminal 3 — Frontend

```bash
cd ~/Downloads/StudyFlow-Final-Working-v7/frontend
npm install
npm run dev -- --host 127.0.0.1
```

Frontend: http://127.0.0.1:5173

## First screen

Opening `http://127.0.0.1:5173` shows the StudyFlow home page. Click **Log in** or **Create free account**.

## Focus timer

Open **Focus Timer** after login. You can enter any value from 0–999 minutes and 0–59 seconds, apply it, name the session, start/pause it and reset it. The timer is intentionally not fixed at 25 minutes.

## Notes

Run Terminal 1, Terminal 2 and Terminal 3 in separate windows. Do not run an old StudyFlow backend on port 5001 at the same time. The Terminal 2 command stops an existing process on port 5001 before starting this version.

## v6 task upgrades

- Complete/restore tasks with one click.
- Completed tasks are persisted with completion timestamps.
- Task filters: Active, Completed, All.
- Dedicated Task History page with search, 7/30 day filters, completion statistics, and restore.
- Dashboard completion counts remain database-backed.

## v7 universal completion system

Every planner item now uses the same completion workflow as Tasks:

- Subjects: Complete / Restore
- Study Sessions: Complete / Restore
- Exams: Complete / Restore
- Assignments: Complete / Restore
- Goals: Complete / Restore
- Timetable blocks: Complete / Restore
- Active / Completed / All filters on each page
- Completion counters and percentage on each page
- Completion timestamp saved to MongoDB
- Complete History combines finished work from every planner module
- Restore from History returns the item to active work

The Task page keeps its dedicated priority/status workflow, while the universal completion field provides a consistent finish/restore experience across the rest of the planner.
# StudyFlow-Final-Working
# StudyFlow-Final-Working
# StudyFlow-Final-Working
# StudyFlow-Final-Working
