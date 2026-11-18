"use client";

import { toISODate } from "@/lib/format-date";
import type { RestoreSessionInput } from "@/lib/validations/gym";
import { useEffect, useRef, useState } from "react";
import { undoWith, useToast } from "../components/toast";
import { emptyInput, canLog, type SetInput } from "./exercise-logger";
import type { ActiveSessionData, ExerciseItem, SplitDay, WorkoutSetData } from "./types";
import { clearWorkoutTime, saveWorkoutTime, useWorkoutTimer, workoutMinutes } from "./workout-timer";
import {
  cancelSessionAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  reopenSessionAction,
  restoreSessionAction,
  startSessionAction,
} from "@/app/actions/gym";

type SessionSnapshot = { session: ActiveSessionData; seconds: number; notes: string };

/**
 * The workout in hand: starting, logging, leaving, resuming, finishing and cancelling it, each with its Undo.
 * `busy` is the page's one saving flag, so every control on the page waits for the same write.
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
  const warn = (message: string) => showToast({ message, type: "warning" });
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  // A workout left without finishing (Exit, or a reload): its sets stay saved and Resume brings it back.
  const [paused, setPaused] = useState<ActiveSessionData | null>(openSession);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [timerPaused, setTimerPaused] = useState(false); // the Pause button; leaving the workout stops the timer too
  // Exercises opened in the workout; they start collapsed and are not kept between workouts.
  const [openEx, setOpenEx] = useState<string[]>([]);
  // Per-exercise quick log input state
  const [inputStates, setInputStates] = useState<Record<string, SetInput>>({});
  const timer = useWorkoutTimer((activeSession ?? paused)?.id ?? null, Boolean(activeSession) && !timerPaused);
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

  async function start(day: SplitDay) {
    if (day.isRest) return;
    setBusy(true);
    try {
      const res = await startSessionAction({
        date: toISODate(),
        splitDayId: day.id,
        isDeload: isDeloadMode,
      });
      if (res.success && res.session) {
        setTimerPaused(false);
        setActiveSession({
          id: res.session.id,
          createdAt: res.session.createdAt,
          date: res.session.date,
          isDeload: res.session.isDeload,
          splitDayId: day.id,
          splitDayName: day.name,
          sets: [],
        });
        const started = res.session.id;
        showToast({
          message: `Started "${day.name}"`,
          type: "success",
          // Only while nothing is logged: Undo must not delete sets.
          onUndo: undoWith(showToast, async () => {
            const now = live.current;
            if (now?.id !== started || now.sets.length > 0) {
              warn("Sets are logged; use Cancel workout instead");
              return true;
            }
            const gone = await cancelSessionAction({ sessionId: started }).catch(() => null);
            if (gone?.success) {
              clearWorkoutTime(started);
              setConfirmCancel(false);
              setActiveSession(null);
              setPaused((p) => (p?.id === started ? null : p));
              setSessionNotes("");
            }
            return gone;
          }),
        });
      } else {
        warn(("error" in res && res.error) || "Failed to start workout");
      }
    } catch {
      warn("Failed to start workout");
    } finally {
      setBusy(false);
    }
  }

  async function logSet(exercise: ExerciseItem) {
    if (!activeSession) return;
    const state = inputStates[exercise.exerciseId] || emptyInput(exercise);
    if (!canLog(state)) return; // the button stays disabled until the set is complete

    const repsNum = Number(state.reps);
    const loadNum = Number(state.loadValue || 0);
    const extraNum = Number(state.extraKg || 0);

    setBusy(true);
    try {
      const existingSetsForExercise = activeSession.sets.filter(
        (s) => s.exerciseId === exercise.exerciseId,
      );
      const setOrder = Math.max(0, ...existingSetsForExercise.map((s) => s.setOrder)) + 1; // not the count: a deleted middle set would repeat a number

      const res = await logSetAction({
        sessionId: activeSession.id,
        exerciseId: exercise.exerciseId,
        setOrder,
        reps: repsNum,
        loadType: state.loadType,
        loadValue: loadNum,
        extraKg: extraNum,
        isFailure: state.isFailure,
        isPartial: state.isPartial,
        isGoodForm: state.isGoodForm,
        notes: state.notes || undefined,
      });

      if (res.success && res.set) {
        const logged: WorkoutSetData = {
          id: res.set.id,
          exerciseId: exercise.exerciseId,
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
          onUndo: undoWith(showToast, async () => {
            dropSet(logged.id);
            const gone = await deleteSetAction(logged.id).then(() => true, () => false);
            if (!gone) putBackSet(logged);
            return gone;
          }),
        });
      } else {
        warn(res.error ?? "Failed to add set");
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
          anomalyReason: set.anomalyReason as RestoreSessionInput["sets"][number]["anomalyReason"],
          notes: set.notes || undefined,
        }).catch(() => null);
        if (res?.success && res.set) putBackSet(set);
        return !!res?.success && !!res.set;
      }, "Failed to restore set"),
    });
    void deleted.then((ok) => {
      if (ok) return;
      putBackSet(set);
      warn("Failed to remove set");
    });
  }

  function exit() {
    setPaused(activeSession);
    setConfirmCancel(false);
    setActiveSession(null);
  }

  function resume() {
    if (!paused) return;
    const dayId = paused.splitDayId;
    if (dayId && days.some((d) => d.id === dayId)) selectDay(dayId);
    setTimerPaused(false);
    setActiveSession(paused);
    setPaused(null);
  }

  // Undo hands a workout back as it was, unless another one was started in the meantime.
  function takeBack(back: () => Promise<ActiveSessionData | null>, snap: SessionSnapshot, failed: string) {
    return undoWith(
      showToast,
      async () => {
        if (live.current) {
          warn("Finish or leave the current workout first");
          return true;
        }
        const restored = await back().catch(() => null);
        if (!restored) return false;
        saveWorkoutTime(restored.id, snap.seconds); // before the workout shows, so the timer picks it up
        if (restored.splitDayId && days.some((d) => d.id === restored.splitDayId)) selectDay(restored.splitDayId);
        setTimerPaused(false);
        setSessionNotes(snap.notes);
        setActiveSession(restored);
        return true;
      },
      failed,
    );
  }

  async function cancel() {
    if (!activeSession) return;
    const snap = { session: activeSession, seconds: timer.seconds(), notes: sessionNotes };
    setBusy(true);
    try {
      const res = await cancelSessionAction({ sessionId: activeSession.id });
      if (!res.success) throw new Error("not cancelled");
      clearWorkoutTime(snap.session.id);
      setConfirmCancel(false);
      setActiveSession(null);
      setSessionNotes("");
      showToast({
        message: "Cancelled the workout",
        type: "success",
        onUndo: takeBack(
          async () => {
            const res = await restoreSessionAction({
              id: snap.session.id,
              createdAt: snap.session.createdAt,
              date: snap.session.date,
              splitDayId: snap.session.splitDayId,
              isDeload: snap.session.isDeload,
              notes: snap.notes || null,
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
                anomalyReason: x.anomalyReason as RestoreSessionInput["sets"][number]["anomalyReason"],
                notes: x.notes,
              })),
            });
            if (!res.success || !res.details) return null;
            const { session, sets } = res.details;
            return {
              id: session.id,
              createdAt: session.createdAt,
              date: session.date,
              isDeload: session.isDeload,
              splitDayId: session.splitDayId,
              splitDayName: snap.session.splitDayName,
              sets,
            };
          },
          snap,
          "Failed to restore the workout",
        ),
      });
    } catch {
      warn("Failed to cancel workout");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!activeSession) return;
    const snap = { session: activeSession, seconds: timer.seconds(), notes: sessionNotes };
    const minutes = workoutMinutes(snap.seconds);
    setBusy(true);
    try {
      const done = await finishSessionAction({
        sessionId: activeSession.id,
        durationMinutes: minutes,
        notes: sessionNotes || undefined,
      });
      if (!done.success) {
        warn(done.error);
        return;
      }
      clearWorkoutTime(snap.session.id);
      setActiveSession(null);
      setSessionNotes("");
      showToast({
        message: `Finished the workout · ${minutes} min`,
        type: "success",
        onUndo: takeBack(
          async () => ((await reopenSessionAction({ sessionId: snap.session.id })).success ? snap.session : null),
          snap,
          "Failed to reopen the workout",
        ),
      });
    } catch {
      warn("Failed to finish workout");
    } finally {
      setBusy(false);
    }
  }

  return {
    activeSession,
    paused,
    confirmCancel,
    setConfirmCancel,
    sessionNotes,
    setSessionNotes,
    timerPaused,
    setTimerPaused,
    openEx,
    setOpenEx,
    inputStates,
    setInputStates,
    timer,
    start,
    logSet,
    deleteSet,
    exit,
    resume,
    cancel,
    finish,
  };
}
