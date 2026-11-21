"use client";

import { toISODate } from "@/lib/format-date";
import type { RestoreSessionInput } from "@/lib/validations/gym";
import type { Answer } from "@/lib/validations/result";
import { useEffect, useRef, useState } from "react";
import { useOnce } from "../components/once";
import { undoWith, useToast } from "../components/toast";
import { emptyInput, canLog, type SetInput } from "./exercise-logger";
import type { ActiveSessionData, ExerciseItem, SplitDay, WorkoutSetData, WorkoutTimer } from "./types";
import {
  cancelSessionAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  pauseSessionAction,
  reopenSessionAction,
  restoreSessionAction,
  resumeSessionAction,
  startSessionAction,
} from "@/actions/gym";

type SessionSnapshot = { session: ActiveSessionData; notes: string };
type AnomalyReason = RestoreSessionInput["sets"][number]["anomalyReason"];

/** What an Undo toast of the workout touches (D-040): the workout's row, and the rows of the sets it names. */
const touchesOf = (sessionId: string, sets: { id: string }[] = []) => [`workout_sessions:${sessionId}`, ...sets.map((s) => `workout_sets:${s.id}`)];

/** 7:05 or 1:02:09. */
export function formatClock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * The seconds a workout's clock shows: the server's count (D-039) plus the time since it answered, ticking while the
 * timer runs. Every device asks the same row, so they show the same time.
 */
function useClock(timer: WorkoutTimer | undefined) {
  const [shown, setShown] = useState(timer?.seconds ?? 0);
  useEffect(() => {
    if (!timer) return;
    const from = Date.now();
    const show = () => setShown(timer.seconds + (timer.running ? Math.floor((Date.now() - from) / 1000) : 0));
    show();
    if (!timer.running) return;
    const tick = setInterval(show, 1000);
    return () => clearInterval(tick);
  }, [timer]);
  return shown;
}

/**
 * The workout in hand: starting, logging, pausing, leaving, resuming, finishing and cancelling it, each with its Undo.
 * The timer is the server's (D-039). `busy` is the page's one saving flag, so every control on the page waits for the
 * same write; Start, Pause or Resume and Finish also act once per tap burst (D-043).
 */
export function useWorkout({
  openSession,
  days,
  isDeloadMode,
  setBusy,
  selectDay,
}: {
  openSession: ActiveSessionData | null;
  days: SplitDay[];
  isDeloadMode: boolean;
  setBusy: (busy: boolean) => void;
  selectDay: (id: string) => void;
}) {
  const { showToast } = useToast();
  const once = useOnce();
  const warn = (message: string) => showToast({ message, type: "warning" });
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  // A workout left without finishing (Exit, or a reload): its sets stay saved and Resume brings it back.
  const [paused, setPaused] = useState<ActiveSessionData | null>(openSession);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  // Exercises opened in the workout; they start collapsed and are not kept between workouts.
  const [openEx, setOpenEx] = useState<string[]>([]);
  // Per-exercise quick log input state
  const [inputStates, setInputStates] = useState<Record<string, SetInput>>({});
  const clock = useClock((activeSession ?? paused)?.timer);
  const live = useRef<ActiveSessionData | null>(null); // the workout in hand, for an Undo that comes back later
  useEffect(() => {
    live.current = activeSession ?? paused;
  });

  const dropSet = (id: string) => setActiveSession((prev) => prev && { ...prev, sets: prev.sets.filter((s) => s.id !== id) });
  const putBackSet = (set: WorkoutSetData) => {
    setActiveSession((prev) =>
      prev && { ...prev, sets: [...prev.sets.filter((s) => s.id !== set.id), set].sort((a, b) => a.setOrder - b.setOrder) },
    );
  };
  const setTimer = (id: string, timer: WorkoutTimer) => {
    setActiveSession((prev) => (prev?.id === id ? { ...prev, timer } : prev));
    setPaused((prev) => (prev?.id === id ? { ...prev, timer } : prev));
  };
  // Selects the workout's own day on the page, when the routine still has it.
  const showDay = (dayId: string | null | undefined) => {
    if (dayId && days.some((d) => d.id === dayId)) selectDay(dayId);
  };
  // A write of the workout's own (Start, Pause or Resume, Finish, Exit): one at a time, with the page's saving flag.
  const write = (run: () => Promise<void>, failed: string, spot?: Element | null) =>
    once(
      "workout",
      async () => {
        setBusy(true);
        try {
          await run();
        } catch {
          warn(failed);
        } finally {
          setBusy(false);
        }
      },
      spot,
    );

  // Start on a day that already has a workout gets that one back (D-039); `from` says how, and Undo reverses just that.
  // The screen shows the workout the server answered (its day and sets), never just the day that was tapped.
  function start(day: SplitDay, spot?: Element | null) {
    if (day.isRest) return;
    write(async () => {
      const res = await startSessionAction({ id: crypto.randomUUID(), date: toISODate(), splitDayId: day.id, isDeload: isDeloadMode });
      if (!res.success) return warn(res.error);
      const { session, sets, timer, from, splitDayName: name } = res;
      const started: ActiveSessionData = {
        id: session.id,
        timer,
        createdAt: session.createdAt,
        date: session.date,
        isDeload: session.isDeload,
        splitDayId: session.splitDayId,
        splitDayName: name,
        sets,
      };
      showDay(session.splitDayId);
      setActiveSession(started);
      setPaused(null);
      setSessionNotes(session.notes ?? "");
      const touches = touchesOf(session.id);
      if (from === "running") return showToast({ message: `"${name}" is already under way`, type: "success" });
      if (from === "paused") {
        return showToast({
          message: `Resumed "${name}"`,
          type: "success",
          touches,
          onUndo: undoWith(showToast, async () => {
            const res = await pauseSessionAction({ sessionId: session.id });
            if (res.success) setTimer(session.id, res.timer);
            return res;
          }),
        });
      }
      if (from === "finished") {
        return showToast({
          message: `Reopened "${name}"`,
          type: "success",
          touches,
          onUndo: undoWith(showToast, async () => {
            if (live.current?.id !== session.id) {
              warn("Finish or leave the current workout first");
              return true;
            }
            const res = await finishSessionAction({ sessionId: session.id, notes: session.notes });
            if (res.success) {
              setActiveSession(null);
              setPaused((p) => (p?.id === session.id ? null : p));
              setSessionNotes("");
            }
            return res;
          }),
        });
      }
      showToast({
        message: `Started "${name}"`,
        type: "success",
        touches,
        // Only while nothing is logged: Undo must not delete sets.
        onUndo: undoWith(showToast, async () => {
          const now = live.current;
          if (now?.id !== session.id || now.sets.length > 0) {
            warn("Sets are logged; use Cancel workout instead");
            return true;
          }
          const gone = await cancelSessionAction({ sessionId: session.id }).catch(() => null);
          if (gone?.success) {
            setConfirmCancel(false);
            setActiveSession(null);
            setPaused((p) => (p?.id === session.id ? null : p));
            setSessionNotes("");
          }
          return gone;
        }),
      });
    }, "Failed to start workout", spot);
  }

  /** The Pause and Resume button: the server stops or restarts the workout's timer, and Undo turns it back. */
  function toggleTimer(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    const run = !session.timer.running;
    const turn = async (on: boolean) => {
      const res = on ? await resumeSessionAction({ sessionId: session.id }) : await pauseSessionAction({ sessionId: session.id });
      if (res.success) setTimer(session.id, res.timer);
      return res;
    };
    write(async () => {
      const res = await turn(run);
      if (!res.success) return warn(res.error);
      showToast({
        message: run ? "Resumed the timer" : "Paused the timer",
        type: "success",
        touches: touchesOf(session.id),
        onUndo: undoWith(showToast, () => turn(!run)),
      });
    }, run ? "Failed to resume the timer" : "Failed to pause the timer", spot);
  }

  async function logSet(exercise: ExerciseItem) {
    if (!activeSession) return;
    const state = inputStates[exercise.exerciseId] || emptyInput(exercise);
    if (!canLog(state)) return; // the button stays disabled until the set is complete

    const repsNum = Number(state.reps);
    const loadNum = Number(state.loadValue || 0);

    setBusy(true);
    try {
      const existingSetsForExercise = activeSession.sets.filter(
        (s) => s.exerciseId === exercise.exerciseId,
      );
      const setOrder = Math.max(0, ...existingSetsForExercise.map((s) => s.setOrder)) + 1; // not the count: a deleted middle set would repeat a number

      // The id is made here (D-040), so a set sent twice is one set.
      const res = await logSetAction({
        id: crypto.randomUUID(),
        sessionId: activeSession.id,
        exerciseId: exercise.exerciseId,
        setOrder,
        reps: repsNum,
        loadType: state.loadType,
        loadValue: loadNum,
        isFailure: state.isFailure,
        isPartial: state.isPartial,
        isGoodForm: state.isGoodForm,
        notes: state.notes || undefined,
      });

      if (res.success) {
        const logged: WorkoutSetData = {
          id: res.set.id,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          muscleGroup: exercise.muscleGroup,
          equipmentType: exercise.equipmentType,
          setOrder: res.set.setOrder,
          reps: res.set.reps,
          loadType: res.set.loadType,
          loadValue: res.set.loadValue,
          extraKg: res.set.extraKg,
          isFailure: res.set.isFailure,
          isPartial: res.set.isPartial,
          isGoodForm: res.set.isGoodForm,
          flagAnomaly: res.set.flagAnomaly,
          anomalyReason: res.set.anomalyReason,
          notes: res.set.notes,
          createdAt: res.set.createdAt,
        };
        setActiveSession((prev) => prev && { ...prev, sets: [...prev.sets, logged] });
        showToast({
          message: res.set.flagAnomaly
            ? `Added set ${setOrder} (below the ${exercise.minReps} – ${exercise.maxReps} target)`
            : `Added set ${setOrder}`,
          type: res.set.flagAnomaly ? "warning" : "success",
          touches: [`workout_sets:${logged.id}`],
          onUndo: undoWith(showToast, async () => {
            dropSet(logged.id);
            const gone = await deleteSetAction(logged.id).then((r) => r.success, () => false);
            if (!gone) putBackSet(logged);
            return gone;
          }),
        });
      } else {
        warn(res.error);
      }
    } catch {
      warn("Failed to add set");
    } finally {
      setBusy(false);
    }
  }

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function deleteSet(set: WorkoutSetData) {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    const deleted = deleteSetAction(set.id).then(
      (r) => r.success,
      () => false,
    );
    dropSet(set.id);
    showToast({
      message: `Removed set ${set.setOrder}`,
      touches: [`workout_sets:${set.id}`],
      onUndo: undoWith(showToast, async () => {
        if (!(await deleted)) return true; // the failure path below puts it back
        const res = await logSetAction({
          id: set.id,
          createdAt: set.createdAt,
          sessionId,
          exerciseId: set.exerciseId,
          setOrder: set.setOrder,
          reps: set.reps,
          loadType: set.loadType,
          loadValue: Number(set.loadValue),
          extraKg: Number(set.extraKg),
          isFailure: set.isFailure,
          isPartial: set.isPartial,
          isGoodForm: set.isGoodForm,
          flagAnomaly: set.flagAnomaly,
          anomalyReason: set.anomalyReason as AnomalyReason,
          notes: set.notes || undefined,
        }).catch(() => null);
        if (res?.success) putBackSet(set);
        return !!res?.success;
      }, "Failed to restore set"),
    });
    void deleted.then((ok) => {
      if (ok) return;
      putBackSet(set);
      warn("Failed to remove set");
    });
  }

  // Exit pauses the timer: a workout left for later does not count the time away. Resume (the banner) runs it again.
  function exit() {
    const session = activeSession;
    if (!session) return;
    write(async () => {
      const res = await pauseSessionAction({ sessionId: session.id });
      if (!res.success) return warn(res.error);
      setPaused({ ...session, timer: res.timer });
      setConfirmCancel(false);
      setActiveSession(null);
    }, "Failed to leave the workout");
  }

  function resume() {
    const session = paused;
    if (!session) return;
    write(async () => {
      const res = await resumeSessionAction({ sessionId: session.id });
      if (!res.success) return warn(res.error);
      showDay(session.splitDayId);
      setActiveSession({ ...session, timer: res.timer });
      setPaused(null);
    }, "Failed to resume the workout");
  }

  // Undo hands a workout back as it was, unless another one was started in the meantime. A refusal shows the server's
  // own words (D-040); `failed` only when no answer came.
  function takeBack(back: () => Promise<Answer<{ session: ActiveSessionData }>>, snap: SessionSnapshot, failed: string) {
    return undoWith(
      showToast,
      async () => {
        if (live.current) {
          warn("Finish or leave the current workout first");
          return true;
        }
        const res = await back();
        if (!res.success) return res;
        showDay(res.session.splitDayId);
        setSessionNotes(snap.notes);
        setActiveSession(res.session);
        return res;
      },
      (back) => (back && !back.success ? back.error : failed),
    );
  }

  /** Undo of Cancel, and of a Finish that deleted an empty workout: the workout comes back with its ids, sets and timer. */
  function restore(snap: SessionSnapshot, timer: WorkoutTimer) {
    return async (): Promise<Answer<{ session: ActiveSessionData }>> => {
      const res = await restoreSessionAction({
        id: snap.session.id,
        createdAt: snap.session.createdAt,
        date: snap.session.date,
        splitDayId: snap.session.splitDayId,
        isDeload: snap.session.isDeload,
        notes: snap.notes || null,
        timerSeconds: timer.seconds,
        timerRunning: timer.running,
        sets: snap.session.sets.map((x) => ({
          id: x.id,
          createdAt: x.createdAt,
          exerciseId: x.exerciseId,
          setOrder: x.setOrder,
          reps: x.reps,
          loadType: x.loadType as "kg" | "plates" | "bodyweight",
          loadValue: Number(x.loadValue),
          extraKg: Number(x.extraKg),
          isFailure: x.isFailure,
          isPartial: x.isPartial,
          isGoodForm: x.isGoodForm,
          flagAnomaly: x.flagAnomaly,
          anomalyReason: x.anomalyReason as AnomalyReason,
          notes: x.notes,
        })),
      });
      if (!res.success) return res;
      const { session, sets } = res.details;
      return {
        success: true,
        session: {
          id: session.id,
          timer: res.details.timer,
          createdAt: session.createdAt,
          date: session.date,
          isDeload: session.isDeload,
          splitDayId: session.splitDayId,
          splitDayName: snap.session.splitDayName,
          sets,
        },
      };
    };
  }

  async function cancel() {
    if (!activeSession) return;
    const snap = { session: activeSession, notes: sessionNotes };
    setBusy(true);
    try {
      const res = await cancelSessionAction({ sessionId: activeSession.id });
      if (!res.success) throw new Error("not cancelled");
      setConfirmCancel(false);
      setActiveSession(null);
      setSessionNotes("");
      showToast({
        message: "Cancelled the workout",
        type: "success",
        touches: touchesOf(snap.session.id, snap.session.sets),
        onUndo: takeBack(restore(snap, res.timer), snap, "Failed to restore the workout"),
      });
    } catch {
      warn("Failed to cancel workout");
    } finally {
      setBusy(false);
    }
  }

  // The server counts the duration (D-039); a workout with no sets is deleted, and Undo brings it back open.
  function finish(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    const snap = { session, notes: sessionNotes };
    write(async () => {
      const done = await finishSessionAction({ sessionId: session.id, notes: sessionNotes || undefined });
      if (!done.success) return warn(done.error);
      setActiveSession(null);
      setSessionNotes("");
      // The sets too: a set's Undo after Finish would take a set out of a finished workout.
      const touches = touchesOf(session.id, session.sets);
      if (done.deleted) {
        return showToast({
          message: "No sets logged: the workout was removed",
          type: "success",
          touches,
          onUndo: takeBack(restore(snap, done.timer), snap, "Failed to restore the workout"),
        });
      }
      showToast({
        message: `Finished the workout · ${done.session.durationMinutes} min`,
        type: "success",
        touches,
        onUndo: takeBack(
          async () => {
            const res = await reopenSessionAction({ sessionId: session.id });
            return res.success ? { success: true, session: { ...session, timer: res.timer } } : res;
          },
          snap,
          "Failed to reopen the workout",
        ),
      });
    }, "Failed to finish workout", spot);
  }

  return {
    activeSession,
    paused,
    confirmCancel,
    setConfirmCancel,
    sessionNotes,
    setSessionNotes,
    openEx,
    setOpenEx,
    inputStates,
    setInputStates,
    clock,
    start,
    toggleTimer,
    logSet,
    deleteSet,
    exit,
    resume,
    cancel,
    finish,
  };
}
