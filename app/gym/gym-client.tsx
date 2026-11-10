"use client";

import { formatDMY, toISODate } from "@/lib/format-date";
import { kgDelta, type HistoryEntry } from "@/lib/gym-progress";
import type { RestoreSessionInput } from "@/lib/validations/gym";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, muscleLabel, type MuscleGroupKey } from "@/lib/gym-muscles";
import { Fragment, useEffect, useRef, useState } from "react";
import { AutoHeight, useDragSort, useListMotion, useMore } from "../components/list-motion";
import { Navigation } from "../components/navigation";
import { Modal, useAfterClose } from "../components/modal";
import { ChevronRightIcon, GripIcon, PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { useToast } from "../components/toast";
import { MuscleExplorer } from "./muscle-map";
import { ProgressPanel } from "./progress-panel";
import { Segmented } from "../components/segmented";
import { clearWorkoutTime, formatClock, saveWorkoutTime, useWorkoutTimer, workoutMinutes } from "./workout-timer";
import {
  cancelSessionAction,
  createCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  reopenSessionAction,
  restoreSessionAction,
  saveSplitDayAction,
  startSessionAction,
} from "@/app/actions/gym";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface LibraryExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipmentType: string;
}

/** Edit-form row: numbers stay strings so a cleared field is not silently 0. */
interface DraftExercise {
  exerciseId: string;
  targetSets: string;
  minReps: string;
  maxReps: string;
}

interface DayDraft {
  id: string;
  dayOfWeek: number;
  name: string;
  isRest: boolean;
  exercises: DraftExercise[];
}

interface ExerciseItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  equipmentType: string;
  targetSets: number;
  minReps: number;
  maxReps: number;
  orderIndex: number;
}

interface SplitDay {
  id: string;
  dayOfWeek: number;
  name: string;
  isRest: boolean;
  orderIndex: number;
  exercises: ExerciseItem[];
}

interface DeloadInfo {
  weeksSinceLastDeload: number;
  currentCycleWeek: number;
  isDeloadDue: boolean;
  lastDeloadDate: string | null;
}

interface WorkoutSetData {
  id: string;
  exerciseId: string;
  setOrder: number;
  reps: number;
  loadType: string;
  loadValue: string;
  extraKg: string;
  isFailure: boolean;
  isPartial: boolean;
  flagAnomaly: boolean;
  anomalyReason?: string | null;
  notes?: string | null;
}

interface ActiveSessionData {
  id: string;
  date: string;
  isDeload: boolean;
  splitDayId?: string | null;
  splitDayName?: string;
  sets: WorkoutSetData[];
}

interface GymClientProps {
  userName: string;
  split: {
    id: string;
    name: string;
    days: SplitDay[];
  } | null;
  deload: DeloadInfo;
  history: HistoryEntry[];
  exercises: LibraryExercise[];
  openSession: ActiveSessionData | null;
}

/** "8 × 52.5 kg": one logged set as the user reads it (the extra kg is already in `load`). */
function setText(x: { reps: number; loadType: string; load: number }) {
  const l = Math.round(x.load * 100) / 100;
  const w =
    x.loadType === "bodyweight" ? (l > 0 ? `BW + ${l} kg` : "BW") : `${l} ${x.loadType === "plates" ? "plates" : "kg"}`;
  return `${x.reps} × ${w}`;
}

export function GymClient({
  userName,
  split: serverSplit,
  deload,
  history,
  exercises,
  openSession,
}: GymClientProps) {
  const { showToast } = useToast();
  const { rowRef, enter, leave, fadeAll } = useListMotion();
  const setStatusMessage = (message: string) => {
    if (message) showToast({ message, type: "warning" });
  };
  // A save refreshes the days from the server; the list takes them once the editor has faded, not under it.
  const [split, setSplit] = useState(serverSplit);
  const { later, runAfterClose } = useAfterClose();
  const editing = useRef(false); // from opening the editor until it has faded out
  useEffect(() => {
    later(() => setSplit(serverSplit));
    if (!editing.current) runAfterClose();
  }, [serverSplit, later, runAfterClose]);
  const todayDayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon, ...
  const [selectedDayId, setSelectedDayId] = useState<string>(() => {
    const todayMatch = split?.days.find((d) => d.dayOfWeek === todayDayOfWeek);
    return todayMatch ? todayMatch.id : split?.days[0]?.id ?? "";
  });

  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  // A workout left without finishing (Exit, or a reload): its sets stay saved and Resume brings it back.
  const [paused, setPaused] = useState<ActiveSessionData | null>(openSession);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [view, setView] = useState<"workout" | "progress">("workout");
  const [sessionNotes, setSessionNotes] = useState("");
  const [timerPaused, setTimerPaused] = useState(false); // the Pause button; leaving the workout stops the timer too
  const [isDeloadMode, setIsDeloadMode] = useState(deload.isDeloadDue);
  const [busy, setBusy] = useState(false);
  const timer = useWorkoutTimer((activeSession ?? paused)?.id ?? null, Boolean(activeSession) && !timerPaused);
  const live = useRef<ActiveSessionData | null>(null); // the workout in hand, for an Undo that comes back later
  useEffect(() => {
    live.current = activeSession ?? paused;
  });
  const [shownHistory, moreHistory] = useMore(history);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  // Per-exercise quick log input state
  const [inputStates, setInputStates] = useState<
    Record<
      string,
      {
        reps: string;
        loadType: "kg" | "plates" | "bodyweight";
        loadValue: string;
        extraKg: string;
        isFailure: boolean;
        isPartial: boolean;
        notes: string;
      }
    >
  >({});

  // Custom exercise form state
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<
    MuscleGroupKey | "other"
  >("chest");
  const [customEquipment, setCustomEquipment] = useState<
    "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"
  >("barbell");

  const currentDay = split?.days.find((d) => d.id === selectedDayId);
  const [shownExercises, moreExercises] = useMore(currentDay?.exercises ?? []);

  // Routine editor
  // The draft outlives the open state, so the form keeps its content while it fades out.
  const [draft, setDraft] = useState<DayDraft | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftError, setDraftError] = useState("");
  const routineMotion = useListMotion(); // the day editor's exercise rows
  const dragRow = useDragSort(routineMotion.reorder, (from, to) =>
    setDraft((d) => {
      if (!d) return d;
      const list = [...d.exercises];
      list.splice(to, 0, ...list.splice(from, 1));
      return { ...d, exercises: list };
    }),
  );
  const [addId, setAddId] = useState("");
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? "Exercise";
  const addable = exercises.filter((e) => !draft?.exercises.some((d) => d.exerciseId === e.id));
  const groups = [...new Set(addable.map((e) => e.muscleGroup))];

  function openEditor(day: SplitDay) {
    runAfterClose(); // reopened before the last close finished
    editing.current = true;
    setDraftError("");
    setDraft({
      id: day.id,
      dayOfWeek: day.dayOfWeek,
      name: day.name,
      isRest: day.isRest,
      exercises: day.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        targetSets: String(e.targetSets),
        minReps: String(e.minReps),
        maxReps: String(e.maxReps),
      })),
    });
    setAddId("");
    setShowCustom(false);
    setEditorOpen(true);
  }

  function afterEditor() {
    editing.current = false;
    runAfterClose();
  }

  function patchRow(i: number, patch: Partial<DraftExercise>) {
    setDraft((d) => d && { ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }

  function removeRow(id: string) {
    routineMotion.leave(id, () => setDraft((d) => d && { ...d, exercises: d.exercises.filter((e) => e.exerciseId !== id) }));
  }

  function addRow() {
    const id = addId || addable[0]?.id;
    if (!id) return;
    routineMotion.enter(id);
    setDraft((d) => d && { ...d, exercises: [...d.exercises, { exerciseId: id, targetSets: "2", minReps: "5", maxReps: "8" }] });
    setAddId("");
  }

  async function handleSaveDay(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const rows = draft.exercises.map((x) => ({
      exerciseId: x.exerciseId,
      targetSets: Number(x.targetSets),
      minReps: Number(x.minReps),
      maxReps: Number(x.maxReps),
    }));
    const bad = rows.find((r) => r.minReps > r.maxReps);
    if (bad) {
      setDraftError(`Please keep min reps at or below max reps for ${nameOf(bad.exerciseId)}.`);
      return;
    }
    setDraftError("");
    setBusy(true);
    try {
      const res = await saveSplitDayAction({ id: draft.id, name: draft.name, isRest: draft.isRest, exercises: draft.isRest ? [] : rows });
      if (res.success) {
        const before = split?.days.find((d) => d.id === draft.id);
        setEditorOpen(false);
        showToast({
          message: `Saved "${draft.name.trim()}"`,
          type: "success",
          ...(before && {
            actionLabel: "Undo",
            // Writes the old day back; the server refresh brings it to the list.
            onAction: async () => {
              runAfterClose(); // the edit first, if the form is still closing
              const back = await saveSplitDayAction({
                id: before.id,
                name: before.name,
                isRest: before.isRest,
                exercises: before.isRest
                  ? []
                  : before.exercises.map((x) => ({
                      exerciseId: x.exerciseId,
                      targetSets: x.targetSets,
                      minReps: x.minReps,
                      maxReps: x.maxReps,
                    })),
              }).catch(() => null);
              if (!back?.success) showToast({ message: "Failed to undo the edit", type: "warning" });
            },
          }),
        });
      } else {
        setDraftError("Failed to save day");
      }
    } catch {
      setDraftError("Failed to save day");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSession(day: SplitDay) {
    if (day.isRest) return;
    setBusy(true);
    setStatusMessage("");
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
          date: res.session.date,
          isDeload: res.session.isDeload,
          splitDayId: day.id,
          splitDayName: day.name,
          sets: [],
        });
        showToast({ message: `Started "${day.name}"`, type: "success" });
      } else {
        setStatusMessage("Failed to start workout");
      }
    } catch {
      setStatusMessage("Failed to start workout");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogSet(exercise: ExerciseItem) {
    if (!activeSession) return;
    const state = inputStates[exercise.exerciseId] || {
      reps: String(exercise.minReps),
      loadType: exercise.equipmentType === "cable" ? "plates" : exercise.equipmentType === "bodyweight" ? "bodyweight" : "kg",
      loadValue: "40",
      extraKg: "0",
      isFailure: true,
      isPartial: false,
      notes: "",
    };

    const repsNum = parseInt(state.reps, 10);
    const loadNum = parseFloat(state.loadValue) || 0;
    const extraNum = parseFloat(state.extraKg) || 0;

    if (isNaN(repsNum) || repsNum <= 0) return; // the button stays disabled until reps are filled

    setBusy(true);
    try {
      const existingSetsForExercise = activeSession.sets.filter(
        (s) => s.exerciseId === exercise.exerciseId,
      );
      const setOrder = existingSetsForExercise.length + 1;

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
        notes: state.notes || undefined,
        minTargetReps: exercise.minReps,
        maxTargetReps: exercise.maxReps,
      });

      if (res.success && res.set) {
        enter(res.set.id);
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                sets: [
                  ...prev.sets,
                  {
                    id: res.set.id,
                    exerciseId: exercise.exerciseId,
                    setOrder: res.set.setOrder,
                    reps: res.set.reps,
                    loadType: res.set.loadType,
                    loadValue: res.set.loadValue,
                    extraKg: res.set.extraKg,
                    isFailure: res.set.isFailure,
                    isPartial: res.set.isPartial,
                    flagAnomaly: res.set.flagAnomaly,
                    anomalyReason: res.set.anomalyReason,
                    notes: res.set.notes,
                  },
                ],
              }
            : null,
        );

        if (res.set.flagAnomaly) {
          showToast({
            message: `Added set ${setOrder} (below the ${exercise.minReps} – ${exercise.maxReps} target)`,
            type: "warning",
          });
        } else {
          showToast({ message: `Added set ${setOrder}`, type: "success" });
        }
      } else {
        setStatusMessage("Failed to add set");
      }
    } catch {
      setStatusMessage("Failed to add set");
    } finally {
      setBusy(false);
    }
  }

  type LoggedSet = NonNullable<typeof activeSession>["sets"][number];
  const putBackSet = (set: LoggedSet) => {
    enter(set.id);
    setActiveSession((prev) =>
      prev && { ...prev, sets: [...prev.sets.filter((s) => s.id !== set.id), set].sort((a, b) => a.setOrder - b.setOrder) },
    );
  };

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function handleDeleteSet(set: LoggedSet, exercise: ExerciseItem) {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    const deleted = deleteSetAction(set.id).then(
      () => true,
      () => false,
    );
    // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
    const gone = new Promise<void>((done) =>
      leave(set.id, () => {
        setActiveSession((prev) => prev && { ...prev, sets: prev.sets.filter((s) => s.id !== set.id) });
        done();
      }),
    );
    showToast({
      message: `Removed set ${set.setOrder}`,
      actionLabel: "Undo",
      onAction: async () => {
        await gone;
        if (!(await deleted)) return; // the failure path below puts it back
        const res = await logSetAction({
          sessionId,
          exerciseId: set.exerciseId,
          setOrder: set.setOrder,
          reps: set.reps,
          loadType: set.loadType,
          loadValue: Number(set.loadValue),
          extraKg: Number(set.extraKg),
          isFailure: set.isFailure,
          isPartial: set.isPartial,
          notes: set.notes || undefined,
          minTargetReps: exercise.minReps,
          maxTargetReps: exercise.maxReps,
        }).catch(() => null);
        if (res?.success && res.set) putBackSet({ ...set, id: res.set.id });
        else showToast({ message: "Failed to restore set", type: "warning" });
      },
    });
    void Promise.all([deleted, gone]).then(([ok]) => {
      if (ok) return;
      putBackSet(set);
      showToast({ message: "Failed to remove set", type: "warning" });
    });
  }

  function handleExitSession() {
    setPaused(activeSession);
    setConfirmCancel(false);
    setActiveSession(null);
  }

  function handleResumeSession() {
    if (!paused) return;
    const dayId = paused.splitDayId;
    if (dayId && split?.days.some((d) => d.id === dayId)) setSelectedDayId(dayId);
    setTimerPaused(false);
    setActiveSession(paused);
    setPaused(null);
  }

  type SessionSnapshot = { session: ActiveSessionData; seconds: number; notes: string };

  // Undo hands a workout back as it was, unless another one was started in the meantime.
  function takeBack(back: () => Promise<ActiveSessionData | null>, snap: SessionSnapshot, failed: string) {
    return async () => {
      if (live.current) {
        showToast({ message: "Finish or leave the current workout first", type: "warning" });
        return;
      }
      const restored = await back().catch(() => null);
      if (!restored) {
        showToast({ message: failed, type: "warning" });
        return;
      }
      saveWorkoutTime(restored.id, snap.seconds); // before the workout shows, so the timer picks it up
      setTimerPaused(false);
      setSessionNotes(snap.notes);
      setActiveSession(restored);
    };
  }

  async function handleCancelSession() {
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
        actionLabel: "Undo",
        onAction: takeBack(
          async () => {
            const res = await restoreSessionAction({
              date: snap.session.date,
              splitDayId: snap.session.splitDayId,
              isDeload: snap.session.isDeload,
              notes: snap.notes || null,
              sets: snap.session.sets.map((x) => ({
                exerciseId: x.exerciseId,
                setOrder: x.setOrder,
                reps: x.reps,
                loadType: x.loadType as "kg" | "plates" | "bodyweight",
                loadValue: Number(x.loadValue),
                extraKg: Number(x.extraKg),
                isFailure: x.isFailure,
                isPartial: x.isPartial,
                flagAnomaly: x.flagAnomaly,
                anomalyReason: x.anomalyReason as RestoreSessionInput["sets"][number]["anomalyReason"],
                notes: x.notes,
              })),
            });
            if (!res.success || !res.details) return null;
            const { session, sets } = res.details;
            return {
              id: session.id,
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
      setStatusMessage("Failed to cancel workout");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishSession() {
    if (!activeSession) return;
    const snap = { session: activeSession, seconds: timer.seconds(), notes: sessionNotes };
    const minutes = workoutMinutes(snap.seconds);
    setBusy(true);
    try {
      await finishSessionAction({
        sessionId: activeSession.id,
        durationMinutes: minutes,
        notes: sessionNotes || undefined,
      });
      clearWorkoutTime(snap.session.id);
      setActiveSession(null);
      setSessionNotes("");
      showToast({
        message: `Finished the workout · ${minutes} min`,
        type: "success",
        actionLabel: "Undo",
        onAction: takeBack(
          async () => ((await reopenSessionAction({ sessionId: snap.session.id })).success ? snap.session : null),
          snap,
          "Failed to reopen the workout",
        ),
      });
    } catch {
      setStatusMessage("Failed to finish workout");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCustomExercise() {
    const name = customName.trim();
    if (!name) return;
    if (exercises.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) {
      setDraftError(`"${name}" already exists.`);
      return;
    }
    setDraftError("");
    setBusy(true);
    try {
      const res = await createCustomExerciseAction({
        name,
        muscleGroup: customMuscle,
        equipmentType: customEquipment,
      });
      if (res.success) {
        // A new exercise is made for this day, so it goes straight into the routine.
        const exerciseId = res.exercise.id;
        routineMotion.enter(exerciseId);
        setDraft((d) => d && { ...d, exercises: [...d.exercises, { exerciseId, targetSets: "2", minReps: "5", maxReps: "8" }] });
        setShowCustom(false);
        setCustomName("");
      }
    } catch {
      setDraftError("Failed to create exercise");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      {/* Deload Status Card */}
      <section
        className="surface deload-card"
        aria-labelledby="deload-title"
      >
        <div>
          <h2 id="deload-title" className="section-title">
            {deload.isDeloadDue
              ? "Deload week due"
              : `Week ${deload.currentCycleWeek} of 5`}
          </h2>
          <p className="muted card-sub">
            {deload.isDeloadDue
              ? "Deload sessions are excluded from PRs."
              : `${5 - deload.currentCycleWeek} ${5 - deload.currentCycleWeek === 1 ? "week" : "weeks"} until deload.`}
          </p>
        </div>
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={isDeloadMode}
            disabled={busy}
            onChange={(e) => setIsDeloadMode(e.target.checked)}
          />
          Deload session
        </label>
      </section>

      {/* Active Workout Session Logger */}
      {activeSession ? (
        <section className="surface" aria-labelledby="active-session-title">
          <div className="section-head">
            <div>
              <h2 id="active-session-title" className="section-title">
                {activeSession.splitDayName || "Workout session"}
              </h2>
              <p className="muted card-sub">
                {formatDMY(activeSession.date)} {activeSession.isDeload ? "· Deload" : ""}
              </p>
            </div>
            <span className="head-actions">
              <span className={`session-timer number-tabular${timerPaused ? " paused" : ""}`} role="timer" aria-label="Workout time">
                {formatClock(timer.shown)}
              </span>
              <button type="button" className="btn-sm tint" onClick={() => setTimerPaused((p) => !p)}>
                {timerPaused ? "Resume" : "Pause"}
              </button>
            </span>
          </div>

          <div>
            {currentDay?.exercises.map((exercise) => {
              const exerciseSets = activeSession.sets.filter(
                (s) => s.exerciseId === exercise.exerciseId,
              );
              const currentState = inputStates[exercise.exerciseId] || {
                reps: String(exercise.minReps),
                loadType:
                  exercise.equipmentType === "cable"
                    ? "plates"
                    : exercise.equipmentType === "bodyweight"
                    ? "bodyweight"
                    : "kg",
                loadValue: "40",
                extraKg: "0",
                isFailure: true,
                isPartial: false,
                notes: "",
              };

              return (
                <div key={exercise.id} className="workout-exercise-card">
                  <div className="exercise-header">
                    <div>
                      <h3 className="exercise-title">
                        {exercise.exerciseName}
                      </h3>
                      <span className="muted exercise-meta">
                        Target: {exercise.targetSets} sets · {exercise.minReps} – {exercise.maxReps} reps · 0 RIR
                        failure
                      </span>
                    </div>
                    <span className="badge badge-rest">
                      {muscleLabel(exercise.muscleGroup)}
                    </span>
                  </div>

                  {/* The same exercise the last time this day was trained: the numbers to beat */}
                  {(() => {
                    const last = history.find(
                      (h) =>
                        h.dayId === activeSession.splitDayId &&
                        !h.isDeload &&
                        h.date < activeSession.date &&
                        h.exercises.some((e) => e.id === exercise.exerciseId),
                    );
                    const sets = last?.exercises.find((e) => e.id === exercise.exerciseId)?.sets ?? [];
                    if (!last) return null;
                    return (
                      <p className="last-time">
                        <span className="muted">Last time · {formatDMY(last.date)}</span>
                        <span className="number-tabular">{sets.map(setText).join("  ·  ")}</span>
                      </p>
                    );
                  })()}

                  {/* Previous logged sets */}
                  <AutoHeight wash className="entries set-list">
                      {exerciseSets.map((s) => (
                        <div key={s.id} ref={rowRef(s.id)} className="entry-row">
                          <span>
                            <strong>Set {s.setOrder}:</strong> {s.reps} reps ×{" "}
                            {s.loadValue} {s.loadType}
                            {Number(s.extraKg) > 0 ? ` + ${s.extraKg} kg` : ""}
                            {s.isPartial ? " (partials)" : ""}
                            {s.flagAnomaly && (
                              <span className="badge badge-danger set-flag">
                                {s.anomalyReason || "Anomaly"}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="delete-icon-btn"
                            onClick={() => handleDeleteSet(s, exercise)}
                            aria-label={`Delete set ${s.setOrder} of ${exercise.exerciseName}`}
                            title="Delete"
                          >
                            <TrashIcon size={17} />
                          </button>
                        </div>
                      ))}
                  </AutoHeight>

                  {/* Set input row */}
                  <div className="set-input-grid">
                    <label>
                      Reps
                      <input
                        type="number"
                        min="1"
                        max="100"
                        inputMode="numeric"
                        disabled={busy}
                        value={currentState.reps}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              reps: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>

                    <label>
                      Load type
                      <select
                        disabled={busy}
                        value={currentState.loadType}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              loadType: e.target.value as "kg" | "plates" | "bodyweight",
                            },
                          }))
                        }
                      >
                        <option value="kg">kg</option>
                        <option value="plates">Plates</option>
                        <option value="bodyweight">Bodyweight</option>
                      </select>
                    </label>

                    <label>
                      Load value
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        inputMode="decimal"
                        disabled={busy}
                        value={currentState.loadValue}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              loadValue: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>

                    <label>
                      Extra (kg)
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        inputMode="decimal"
                        disabled={busy}
                        value={currentState.extraKg}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              extraKg: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>

                    <button
                      type="button"
                      disabled={busy || !(parseInt(currentState.reps, 10) > 0)}
                      onClick={() => handleLogSet(exercise)}
                    >
                      <PlusIcon size={14} />
                      Log set
                    </button>
                  </div>

                  <div className="toggle-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={currentState.isFailure}
                        disabled={busy}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              isFailure: e.target.checked,
                            },
                          }))
                        }
                      />
                      True failure (0 RIR)
                    </label>

                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={currentState.isPartial}
                        disabled={busy}
                        onChange={(e) =>
                          setInputStates((prev) => ({
                            ...prev,
                            [exercise.exerciseId]: {
                              ...currentState,
                              isPartial: e.target.checked,
                            },
                          }))
                        }
                      />
                      Partial reps at end
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="session-footer">
            <div className="form-row">
              <label className="grow-2">
                Session notes (optional)
                <input
                  type="text"
                  disabled={busy}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={handleFinishSession}
              >
                Finish workout
              </button>
            </div>
            <div className="session-exit">
              {confirmCancel ? (
                <>
                  <span className="muted">Delete this workout and its sets?</span>
                  <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>
                    Keep
                  </button>
                  <button type="button" className="danger" disabled={busy} onClick={() => void handleCancelSession()}>
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="secondary" disabled={busy} onClick={handleExitSession}>
                    Exit, finish later
                  </button>
                  <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmCancel(true)}>
                    Cancel workout
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          {paused && (
            <section className="surface resume-bar" aria-label="Workout in progress">
              <div>
                <h2 className="section-title">Workout in progress</h2>
                <p className="muted card-sub">
                  {paused.splitDayName || "Workout"} · {formatDMY(paused.date)} · {paused.sets.length}{" "}
                  {paused.sets.length === 1 ? "set" : "sets"} logged
                </p>
              </div>
              <button type="button" className="btn-sm tint" onClick={handleResumeSession}>
                Resume
              </button>
            </section>
          )}
          <div className="toolbar">
            <Segmented
              label="Gym view"
              value={view}
              options={[
                { value: "workout", label: "Workout" },
                { value: "progress", label: "Progress" },
              ]}
              onChange={setView}
            />
          </div>
          {view === "progress" ? (
            <ProgressPanel days={(split?.days ?? []).filter((d) => !d.isRest).map((d) => ({ id: d.id, name: d.name }))} />
          ) : (
            <>
          <MuscleExplorer
            planned={(split?.days ?? []).flatMap((d) => d.exercises.map((ex) => ({ ...ex, dayName: d.name })))}
          />
          <div className="dashboard-grid">
            <div className="dashboard-main">
              {currentDay && (
                <section className="surface" aria-labelledby="preview-title">
                  <div className="section-head">
                    <div>
                      <h2 id="preview-title" className="section-title">
                        {currentDay.isRest ? "Rest day" : currentDay.name}
                      </h2>
                      <p className="muted card-sub">{DAY_NAMES[currentDay.dayOfWeek]}</p>
                    </div>
                    <span className="head-actions">
                      <button type="button" className="btn-sm tint" onClick={() => openEditor(currentDay)}>
                        <PencilIcon size={14} />
                        Edit
                      </button>
                      {!currentDay.isRest && (
                        <button
                          type="button"
                          className="btn-sm tint"
                          disabled={busy || Boolean(paused) || currentDay.exercises.length === 0}
                          onClick={() => void handleStartSession(currentDay)}
                        >
                          Start
                        </button>
                      )}
                    </span>
                  </div>

                  {!currentDay.isRest && (
                    <AutoHeight wash className="entries">
                      {currentDay.exercises.length > 0 ? (
                        // Keyed by the day so every switch mounts fresh rows that play row-in.
                        <Fragment key={currentDay.id}>
                        {shownExercises.map((ex, idx) => (
                          <div key={ex.id} ref={rowRef(ex.id)} className="entry-row">
                            <div className="entry-main">
                              <strong>
                                {idx + 1}. {ex.exerciseName}
                              </strong>
                              <span className="badge badge-rest">{muscleLabel(ex.muscleGroup)}</span>
                            </div>
                            <span className="muted number-tabular entry-side">
                              {ex.targetSets} × {ex.minReps} – {ex.maxReps}
                            </span>
                          </div>
                        ))}
                        {moreExercises}
                        </Fragment>
                      ) : (
                        <p key={`empty-${currentDay.id}`} ref={rowRef("empty")} className="empty-note">No exercises yet.</p>
                      )}
                    </AutoHeight>
                  )}
                </section>
              )}
            </div>

            <div className="dashboard-aside">
              <section className="surface" aria-labelledby="split-title">
                <div className="section-head">
                  <h2 id="split-title" className="section-title">
                    Training days
                  </h2>
                </div>

                <AutoHeight className="split-day-list">
                  {split?.days.map((day) => {
                    const isToday = day.dayOfWeek === todayDayOfWeek;
                    const isSelected = day.id === selectedDayId;
                    return (
                      <div
                        key={day.id}
                        className={`split-day-card${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="split-day-select"
                          aria-pressed={isSelected}
                          onClick={() => day.id !== selectedDayId && fadeAll(() => setSelectedDayId(day.id))}
                        >
                          <span className="split-day-title">
                            <strong>{DAY_NAMES[day.dayOfWeek]}</strong>
                            {isToday && <span className="badge badge-info">Today</span>}
                            {day.isRest ? (
                              <span className="badge badge-rest">Rest</span>
                            ) : (
                              <span className="badge badge-info number-tabular">{day.exercises.length}</span>
                            )}
                          </span>
                          <span className="muted split-day-sub">{day.name}</span>
                        </button>
                        {!day.isRest && day.exercises.length > 0 && (
                          <button
                            type="button"
                            disabled={busy || Boolean(paused)}
                            className="btn-sm tint"
                            onClick={() => {
                              setSelectedDayId(day.id);
                              void handleStartSession(day);
                            }}
                          >
                            Start
                          </button>
                        )}
                      </div>
                    );
                  })}
                </AutoHeight>
              </section>
            </div>
          </div>
          <section className="surface gym-history" aria-labelledby="history-title">
            <div className="section-head">
              <h2 id="history-title" className="section-title">
                History
              </h2>
              <span className="muted number-tabular">
                {history.length} {history.length === 1 ? "workout" : "workouts"}
              </span>
            </div>
            <AutoHeight wash className="entries">
              {history.length > 0 ? (
                <>
                  {shownHistory.map((h) => {
                    const open = openHistoryId === h.id;
                    return (
                      <div key={h.id} ref={rowRef(h.id)} className="entry-row history-entry">
                        <button
                          type="button"
                          className="history-toggle"
                          aria-expanded={open}
                          aria-controls={`history-${h.id}`}
                          onClick={() => setOpenHistoryId(open ? null : h.id)}
                        >
                          <span className="history-entry-head">
                            <strong>{h.dayName ?? "Workout"}</strong>
                            {h.isDeload && <span className="badge badge-rest">Deload</span>}
                            <span className="muted number-tabular history-entry-side">{formatDMY(h.date)}</span>
                            <ChevronRightIcon size={14} className="history-chevron" aria-hidden />
                          </span>
                          <span className="muted number-tabular history-progress">
                            {h.isDeload
                              ? "Deload week, not counted"
                              : h.progress !== null
                                ? `Weight ${kgDelta(h.progress)} vs the week before`
                                : "Nothing to compare with yet"}
                          </span>
                        </button>
                        {open && (
                          <div id={`history-${h.id}`} className="history-details">
                            {h.durationMinutes ? <div className="muted number-tabular history-duration">{h.durationMinutes} min</div> : null}
                            {h.exercises.map((ex) => (
                              <p key={ex.id} className="history-exercise">
                                <strong>{ex.name}</strong>
                                <span className="muted number-tabular">{ex.sets.map(setText).join("  ·  ")}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {moreHistory}
                </>
              ) : (
                <p key="empty-history" ref={rowRef("empty-history")} className="empty-note">
                  No finished workouts yet.
                </p>
              )}
            </AutoHeight>
          </section>
            </>
          )}
        </>
      )}

      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onExited={afterEditor}
        title={draft ? `Edit ${DAY_NAMES[draft.dayOfWeek]}` : "Edit day"}
      >
        {draft && (
          <form onSubmit={handleSaveDay}>
            <div className="form-stack">
              <label>
                Name
                <input
                  disabled={busy}
                  type="text"
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="toggle-label">
                <input
                  disabled={busy}
                  type="checkbox"
                  checked={draft.isRest}
                  onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })}
                />
                Rest day
              </label>

              {!draft.isRest && (
                <>
                  <AutoHeight className="routine-list">
                    {draft.exercises.length === 0 && (
                      <p key="empty" ref={routineMotion.rowRef("empty")} className="empty-note">
                        No exercises yet.
                      </p>
                    )}
                    {draft.exercises.map((row, i) => {
                      const name = nameOf(row.exerciseId);
                      return (
                        <div key={row.exerciseId} ref={routineMotion.rowRef(row.exerciseId)} className="routine-row" data-sort>
                          <button
                            type="button"
                            className="delete-icon-btn edit drag-handle"
                            disabled={busy}
                            aria-label={`Drag ${name} to reorder`}
                            title="Drag to reorder"
                            {...dragRow}
                          >
                            <GripIcon size={22} />
                          </button>
                          <div className="routine-row-body">
                          <div className="routine-row-head">
                            <strong>
                              {i + 1}. {name}
                            </strong>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="delete-icon-btn"
                                onClick={() => removeRow(row.exerciseId)}
                                aria-label={`Remove ${name}`}
                                title="Remove"
                              >
                                <TrashIcon size={17} />
                              </button>
                            </div>
                          </div>
                          <div className="routine-fields">
                            <label>
                              Sets
                              <input
                                disabled={busy}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={10}
                                required
                                className="number-tabular"
                                value={row.targetSets}
                                onChange={(e) => patchRow(i, { targetSets: e.target.value })}
                              />
                            </label>
                            <label>
                              Min reps
                              <input
                                disabled={busy}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={100}
                                required
                                className="number-tabular"
                                value={row.minReps}
                                onChange={(e) => patchRow(i, { minReps: e.target.value })}
                              />
                            </label>
                            <label>
                              Max reps
                              <input
                                disabled={busy}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={100}
                                required
                                className="number-tabular"
                                value={row.maxReps}
                                onChange={(e) => patchRow(i, { maxReps: e.target.value })}
                              />
                            </label>
                          </div>
                          </div>
                        </div>
                      );
                    })}
                  </AutoHeight>

                  {addable.length > 0 && draft.exercises.length < 20 && (
                    <div className="routine-add">
                      <label>
                        Exercise
                        <select disabled={busy} value={addId || addable[0].id} onChange={(e) => setAddId(e.target.value)}>
                          {groups.map((g) => (
                            <optgroup key={g} label={muscleLabel(g)}>
                              {addable
                                .filter((e) => e.muscleGroup === g)
                                .map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="secondary" onClick={addRow}>
                        <PlusIcon size={14} />
                        Add exercise
                      </button>
                    </div>
                  )}

                  {draft.exercises.length < 20 &&
                    (showCustom ? (
                      <div className="custom-exercise">
                        <label>
                          New exercise
                          <input
                            disabled={busy}
                            type="text"
                            maxLength={100}
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            onKeyDown={(e) => {
                              // Enter creates the exercise instead of submitting the whole day.
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleCreateCustomExercise();
                              }
                            }}
                          />
                        </label>
                        <div className="form-pair">
                          <label>
                            Muscle group
                            <select
                              disabled={busy}
                              value={customMuscle}
                              onChange={(e) =>
                                setCustomMuscle(
                                  e.target.value as MuscleGroupKey | "other",
                                )
                              }
                            >
                              {MUSCLE_GROUP_KEYS.map((g) => (
                                <option key={g} value={g}>
                                  {MUSCLE_GROUP_LABEL[g]}
                                </option>
                              ))}
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label>
                            Equipment
                            <select
                              disabled={busy}
                              value={customEquipment}
                              onChange={(e) =>
                                setCustomEquipment(
                                  e.target.value as "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight",
                                )
                              }
                            >
                              <option value="barbell">Barbell</option>
                              <option value="dumbbell">Dumbbell</option>
                              <option value="cable">Cable</option>
                              <option value="machine">Machine</option>
                              <option value="bodyweight">Bodyweight</option>
                            </select>
                          </label>
                        </div>
                        <div className="form-actions">
                          <button type="button" className="secondary btn-sm" onClick={() => setShowCustom(false)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-sm tint"
                            disabled={busy || !customName.trim()}
                            onClick={handleCreateCustomExercise}
                          >
                            Create and add
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="secondary btn-sm custom-exercise-btn" onClick={() => setShowCustom(true)}>
                        <PlusIcon size={14} />
                        New exercise
                      </button>
                    ))}
                </>
              )}
              {draftError && <p className="error" role="alert">{draftError}</p>}
            </div>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !draft.name.trim()}>
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>

    </main>
  );
}
