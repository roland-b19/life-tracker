"use client";

import { useEffect, useRef, useState } from "react";

const key = (sessionId: string) => `gym-timer:${sessionId}`;

/** A workout's time: the seconds counted so far, plus the running stretch since `since` (epoch ms; null when stopped). */
type Stored = { seconds: number; since: number | null };
const stopped = (seconds = 0): Stored => ({ seconds, since: null });

function load(sessionId: string): Stored {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return stopped();
    const v: unknown = JSON.parse(raw);
    if (typeof v === "number") return stopped(v); // the older format: plain seconds
    const { seconds, since } = (v ?? {}) as Partial<Stored>;
    return { seconds: Number(seconds) || 0, since: typeof since === "number" ? since : null };
  } catch {
    return stopped();
  }
}

function save(sessionId: string, time: Stored) {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(time));
  } catch {
    // Storage blocked: the timer then restarts from 0 after a reload.
  }
}

const elapsed = (time: Stored) => time.seconds + (time.since === null ? 0 : Math.max(0, Date.now() - time.since) / 1000);

/** Put a workout's time back, stopped (Undo hands a finished or cancelled workout its time again). */
export function saveWorkoutTime(sessionId: string, seconds: number) {
  save(sessionId, stopped(seconds));
}

export function clearWorkoutTime(sessionId: string) {
  try {
    localStorage.removeItem(key(sessionId));
  } catch {
    // Nothing to clear.
  }
}

/**
 * Elapsed workout time, kept in this browser per workout. `running` true starts or keeps the clock, false stops it
 * (Pause, Exit), and null leaves it as it was: a workout whose page or app was closed while it ran keeps counting,
 * since the clock is the start of the running stretch, not a tick.
 * shortcut: the time lives in localStorage, so another device starts from 0; upgrade: a column on the session.
 */
export function useWorkoutTimer(sessionId: string | null, running: boolean | null) {
  const time = useRef<Stored>(stopped());
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const now = sessionId ? load(sessionId) : stopped();
    const since = now.since;
    if (sessionId && running === true && now.since === null) now.since = Date.now();
    if (running === false && now.since !== null) Object.assign(now, stopped(elapsed(now)));
    time.current = now;
    if (sessionId && now.since !== since) save(sessionId, now);
    setShown(Math.floor(elapsed(time.current)));
    // Only the open workout shows the clock: a workout left open keeps its start in storage but needs no tick.
    if (running !== true) return;
    const tick = setInterval(() => setShown(Math.floor(elapsed(time.current))), 1000);
    return () => clearInterval(tick);
  }, [sessionId, running]);

  return { shown, seconds: () => elapsed(time.current) };
}

/** 7:05 or 1:02:09. */
export function formatClock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Whole minutes for the saved duration: at least 1, at most the schema's 600. */
export function workoutMinutes(seconds: number) {
  return Math.min(600, Math.max(1, Math.round(seconds / 60)));
}
