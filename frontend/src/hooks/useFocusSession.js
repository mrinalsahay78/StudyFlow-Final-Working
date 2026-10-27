import { useCallback, useEffect, useRef, useState } from "react";
import { patch, post } from "../lib/api";
import { dayKey } from "../lib/format";

const STORAGE_KEY = "sf_focus_v1";

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

const EMPTY = {
  sessionId: null,
  mode: "pomodoro",
  phase: "focus",
  plannedMinutes: 25,
  breakMinutes: 5,
  accumulatedMs: 0,
  startedAt: null,
  running: false,
  label: "",
  subjectId: null,
  taskId: null,
  cycles: 0,
  interruptions: 0,
};

/**
 * Focus timer that survives reloads.
 *
 * Timing is derived from wall-clock timestamps (accumulated ms + last resume
 * time), never from a tick counter, so a refresh, a sleeping laptop or a
 * throttled background tab cannot drift the clock. The server holds the
 * authoritative FocusSession record; this hook mirrors start/pause/resume/finish
 * through `lib/api` so auth headers and error handling live in one place.
 */
export function useFocusSession() {
  const [state, setState] = useState(() => ({ ...EMPTY, ...(readStored() || {}) }));
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const tick = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage can be disabled */
    }
  }, [state]);

  useEffect(() => {
    if (!state.running) {
      clearInterval(tick.current);
      return undefined;
    }
    tick.current = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick.current);
  }, [state.running]);

  const elapsedMs =
    state.accumulatedMs + (state.running && state.startedAt ? Math.max(0, now - state.startedAt) : 0);
  const totalMs = (state.phase === "focus" ? state.plannedMinutes : state.breakMinutes) * 60 * 1000;

  const start = useCallback(
    async ({ mode = "pomodoro", plannedMinutes = 25, breakMinutes = 5, label, subjectId, taskId } = {}) => {
      setBusy(true);
      try {
        const data = await post("/study/focus", {
          mode,
          plannedMinutes,
          breakMinutes,
          label: label || "Focus session",
          subjectId: subjectId || null,
          taskId: taskId || null,
          date: dayKey(),
        });
        setState({
          sessionId: data._id,
          mode,
          phase: "focus",
          plannedMinutes,
          breakMinutes,
          accumulatedMs: 0,
          startedAt: Date.now(),
          running: true,
          label: label || "Focus session",
          subjectId: subjectId || null,
          taskId: taskId || null,
          cycles: 0,
          interruptions: 0,
        });
        setNow(Date.now());
        return data;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const pause = useCallback(async () => {
    setState((s) => {
      if (!s.running) return s;
      const extra = s.startedAt ? Math.max(0, Date.now() - s.startedAt) : 0;
      return { ...s, accumulatedMs: s.accumulatedMs + extra, startedAt: null, running: false };
    });
    if (state.sessionId) {
      try {
        await patch(`/study/focus/${state.sessionId}/pause`);
      } catch {
        /* the timer keeps working locally; the server record is reconciled on finish */
      }
    }
  }, [state.sessionId]);

  const resume = useCallback(async () => {
    setState((s) => ({
      ...s,
      startedAt: Date.now(),
      running: true,
      interruptions: s.interruptions + 1,
    }));
    if (state.sessionId) {
      try {
        await patch(`/study/focus/${state.sessionId}/resume`);
      } catch {
        /* ignore: local timer stays authoritative for the UI */
      }
    }
  }, [state.sessionId]);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      sessionId: null,
      accumulatedMs: 0,
      startedAt: null,
      running: false,
      cycles: 0,
      interruptions: 0,
      phase: "focus",
    }));
  }, []);

  const finish = useCallback(
    async ({ abandoned = false } = {}) => {
      const seconds = Math.round(elapsedMs / 1000);
      let result = null;
      if (state.sessionId) {
        try {
          result = await post(`/study/focus/${state.sessionId}/finish`, {
            actualSeconds: seconds,
            cyclesCompleted: state.cycles,
            interruptions: state.interruptions,
            status: abandoned ? "abandoned" : "completed",
          });
        } catch (err) {
          result = { error: err.message };
        }
      }
      setState((s) => ({
        ...s,
        sessionId: null,
        accumulatedMs: 0,
        startedAt: null,
        running: false,
        cycles: abandoned ? s.cycles : s.cycles + 1,
        phase: abandoned ? s.phase : s.mode === "pomodoro" ? "break" : "focus",
      }));
      return result;
    },
    [elapsedMs, state.sessionId, state.cycles, state.interruptions, state.mode],
  );

  const skipBreak = useCallback(() => {
    setState((s) => ({ ...s, phase: "focus", accumulatedMs: 0, startedAt: null, running: false }));
  }, []);

  const active = Boolean(state.sessionId);

  return {
    ...state,
    busy,
    active,
    elapsedMs: Math.min(elapsedMs, totalMs),
    remainingMs: Math.max(0, totalMs - elapsedMs),
    totalMs,
    progress: totalMs ? Math.min(1, elapsedMs / totalMs) : 0,
    start,
    pause,
    resume,
    reset,
    finish,
    skipBreak,
  };
}
