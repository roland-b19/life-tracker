"use client";

import { useEffect, useRef, useState } from "react";

const key = (sessionId: string) => `gym-timer:${sessionId}`;

/** The saved time of a workout, in seconds (0 when none, or when storage is blocked). */
function load(sessionId: string) {
  try {
    return Number(localStorage.getItem(key(sessionId))) || 0;
  } catch {
    return 0;
  }
}

/** Put a workout's time away, or back (Undo hands a finished or cancelled workout its time again). */
export function saveWorkoutTime(sessionId: string, seconds: number) {
  try {
    localStorage.setItem(key(sessionId), String(seconds));
  } catch {
    // Storage blocked: the timer then restarts from 0 after a reload.
  }
}

export function clearWorkoutTime(sessionId: string) {
  try {
    localStorage.removeItem(key(sessionId));
  } catch {
    // Nothing to clear.
  }
}

/**
 * Elapsed workout time. It counts while `running`, and stays put otherwise (workout paused or left). The time is
 * kept in this browser per workout, so Exit, Resume and reloads carry on from where it stopped.
 * shortcut: the time lives in localStorage, so another device starts from 0; upgrade: a column on the session.
 */
export function useWorkoutTimer(sessionId: string | null, running: boolean) {
  const seconds = useRef(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    seconds.current = sessionId ? load(sessionId) : 0;
    setShown(Math.floor(seconds.current));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !running) return;
    let last = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      seconds.current += (now - last) / 1000; // real elapsed time, so a throttled background tab loses nothing
      last = now;
      saveWorkoutTime(sessionId, seconds.current);
      setShown(Math.floor(seconds.current));
    }, 1000);
    return () => clearInterval(tick);
  }, [sessionId, running]);

  return { shown, seconds: () => seconds.current };
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
