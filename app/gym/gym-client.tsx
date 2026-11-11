"use client";

import { formatDMY, toISODate } from "@/lib/format-date";
import { kgDelta, type HistoryEntry } from "@/lib/gym-progress";
import type { RestoreSessionInput } from "@/lib/validations/gym";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, muscleLabel, type MuscleGroupKey } from "@/lib/gym-muscles";
import { useEffect, useRef, useState } from "react";
import { DeleteButton, DragHandle, ListBox, useDragSort, useMore } from "../components/lists";
import { Banner, Badge, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FieldPair, FormActions, FormModal, Label, Page, SelectField, TintButton, Toggle, Toolbar } from "../components/blocks";
import { ChevronRightIcon, PencilIcon, PlusIcon } from "../components/icons";
import { useToast } from "../components/toast";
import { MuscleExplorer } from "./muscle-map";
import { ProgressPanel } from "./progress-panel";
import { Segmented } from "../components/segmented";
import { clearWorkoutTime, formatClock, saveWorkoutTime, useWorkoutTimer, workoutMinutes } from "./workout-timer";
import {
  cancelSessionAction,
  createCustomExerciseAction,
  deleteCustomExerciseAction,
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
  createdAt?: Date | string;
}

interface ActiveSessionData {
  id: string;
  createdAt?: Date | string;
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

type LoggedSet = WorkoutSetData;

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
  const setStatusMessage = (message: string) => {
    if (message) showToast({ message, type: "warning" });
  };
  const split = serverSplit; // a save refreshes the days from the server
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
  const [draft, setDraft] = useState<DayDraft | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftError, setDraftError] = useState("");
  const dragRow = useDragSort((from, to) =>
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

  function patchRow(i: number, patch: Partial<DraftExercise>) {
    setDraft((d) => d && { ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }

  function removeRow(id: string) {
    setDraft((d) => d && { ...d, exercises: d.exercises.filter((e) => e.exerciseId !== id) });
  }

  function addRow() {
    const id = addId || addable[0]?.id;
    if (!id) return;
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
            // Writes the old day back; the server refresh brings it to the list.
            onUndo: async () => {
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
          onUndo: async () => {
            const now = live.current;
            if (now?.id !== started || now.sets.length > 0) {
              showToast({ message: "Sets are logged; use Cancel workout instead", type: "warning" });
              return;
            }
            const gone = await cancelSessionAction({ sessionId: started }).catch(() => null);
            if (!gone?.success) {
              showToast({ message: "Failed to undo", type: "warning" });
              return;
            }
            clearWorkoutTime(started);
            setConfirmCancel(false);
            setActiveSession(null);
            setPaused((p) => (p?.id === started ? null : p));
            setSessionNotes("");
          },
        });
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
        const logged: LoggedSet = {
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
          createdAt: res.set.createdAt,
        };
        setActiveSession((prev) => prev && { ...prev, sets: [...prev.sets, logged] });
        showToast({
          message: res.set.flagAnomaly
            ? `Added set ${setOrder} (below the ${exercise.minReps} – ${exercise.maxReps} target)`
            : `Added set ${setOrder}`,
          type: res.set.flagAnomaly ? "warning" : "success",
          onUndo: async () => {
            dropSet(logged.id);
            if (await deleteSetAction(logged.id).then(() => true, () => false)) return;
            putBackSet(logged);
            showToast({ message: "Failed to undo", type: "warning" });
          },
        });
      } else {
        setStatusMessage("Failed to add set");
      }
    } catch {
      setStatusMessage("Failed to add set");
    } finally {
      setBusy(false);
    }
  }

  const dropSet = (id: string) => setActiveSession((prev) => prev && { ...prev, sets: prev.sets.filter((s) => s.id !== id) });
  const putBackSet = (set: LoggedSet) => {
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
    dropSet(set.id);
    showToast({
      message: `Removed set ${set.setOrder}`,
      onUndo: async () => {
        if (!(await deleted)) return; // the failure path below puts it back
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
          notes: set.notes || undefined,
          minTargetReps: exercise.minReps,
          maxTargetReps: exercise.maxReps,
        }).catch(() => null);
        if (res?.success && res.set) putBackSet(set);
        else showToast({ message: "Failed to restore set", type: "warning" });
      },
    });
    void deleted.then((ok) => {
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
        onUndo: takeBack(
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
        setDraft((d) => d && { ...d, exercises: [...d.exercises, { exerciseId, targetSets: "2", minReps: "5", maxReps: "8" }] });
        setShowCustom(false);
        setCustomName("");
        showToast({
          message: `Created "${name}"`,
          type: "success",
          // Refused once a routine or a set uses it, so Undo never deletes data.
          onUndo: async () => {
            const gone = await deleteCustomExerciseAction(exerciseId).catch(() => null);
            if (!gone?.success) {
              showToast({ message: "Failed to undo: the exercise is already in use", type: "warning" });
              return;
            }
            setDraft((d) => d && { ...d, exercises: d.exercises.filter((x) => x.exerciseId !== exerciseId) });
          },
        });
      }
    } catch {
      setDraftError("Failed to create exercise");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page userName={userName}>
      {/* Deload Status Card */}
      <Banner
        id="deload-title"
        className="deload-card"
        title={deload.isDeloadDue ? "Deload week due" : `Week ${deload.currentCycleWeek} of 5`}
        sub={
          deload.isDeloadDue
            ? "Deload sessions are excluded from PRs."
            : `${5 - deload.currentCycleWeek} ${5 - deload.currentCycleWeek === 1 ? "week" : "weeks"} until deload.`
        }
      >
        <Toggle label="Deload session" checked={isDeloadMode} disabled={busy} onChange={(e) => setIsDeloadMode(e.target.checked)} />
      </Banner>

      {/* Active Workout Session Logger */}
      {activeSession ? (
        <Card
          id="active-session-title"
          title={activeSession.splitDayName || "Workout session"}
          sub={`${formatDMY(activeSession.date)} ${activeSession.isDeload ? "· Deload" : ""}`}
          actions={
            <>
              <span className={`session-timer number-tabular${timerPaused ? " paused" : ""}`} role="timer" aria-label="Workout time">
                {formatClock(timer.shown)}
              </span>
              <TintButton onClick={() => setTimerPaused((p) => !p)}>{timerPaused ? "Resume" : "Pause"}</TintButton>
            </>
          }
        >
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
              const patch = (change: Partial<typeof currentState>) =>
                setInputStates((prev) => ({ ...prev, [exercise.exerciseId]: { ...currentState, ...change } }));

              return (
                <div key={exercise.id} className="workout-exercise-card">
                  <div className="exercise-header">
                    <div>
                      <h3 className="exercise-title">
                        {exercise.exerciseName}
                      </h3>
                      <span className="muted exercise-meta">
                        Target: {exercise.targetSets} sets · {exercise.minReps} – {exercise.maxReps} reps
                      </span>
                    </div>
                    <Badge kind="rest">{muscleLabel(exercise.muscleGroup)}</Badge>
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
                      <div className="last-time">
                        <span className="muted">Last time · {formatDMY(last.date)}</span>
                        {sets.map((set, i) => (
                          <span key={i} className="number-tabular">
                            {setText(set)}
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Previous logged sets */}
                  <ListBox wash className="entries set-list">
                    {exerciseSets.map((s) => (
                      <div key={s.id} className="entry-row">
                        <span>
                          <strong>Set {s.setOrder}:</strong> {s.reps} reps ×{" "}
                          {s.loadValue} {s.loadType}
                          {Number(s.extraKg) > 0 ? ` + ${s.extraKg} kg` : ""}
                          {s.isPartial ? " (partials)" : ""}
                          {s.flagAnomaly && <Badge kind="danger" className="set-flag">{s.anomalyReason || "Anomaly"}</Badge>}
                        </span>
                        <DeleteButton label={`Delete set ${s.setOrder} of ${exercise.exerciseName}`} onClick={() => handleDeleteSet(s, exercise)} />
                      </div>
                    ))}
                  </ListBox>

                  {/* Set input row */}
                  <div className="set-input-grid">
                    <Field
                      label="Reps"
                      type="number"
                      min="1"
                      max="200"
                      inputMode="numeric"
                      disabled={busy}
                      value={currentState.reps}
                      onChange={(e) => patch({ reps: e.target.value })}
                    />
                    <SelectField
                      label="Unit"
                      disabled={busy}
                      value={currentState.loadType}
                      onChange={(e) => patch({ loadType: e.target.value as "kg" | "plates" | "bodyweight" })}
                      options={[
                        { value: "kg", label: "kg" },
                        { value: "plates", label: "Plates" },
                        { value: "bodyweight", label: "BW" },
                      ]}
                    />
                    <Field
                      label="Value"
                      type="number"
                      step="0.5"
                      min="0"
                      inputMode="decimal"
                      disabled={busy}
                      value={currentState.loadValue}
                      onChange={(e) => patch({ loadValue: e.target.value })}
                    />
                    <Field
                      label="Extra"
                      title="Extra weight in kg"
                      type="number"
                      step="0.25"
                      min="0"
                      inputMode="decimal"
                      disabled={busy}
                      value={currentState.extraKg}
                      onChange={(e) => patch({ extraKg: e.target.value })}
                    />
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
                    <Toggle label="True failure (0 RIR)" checked={currentState.isFailure} disabled={busy} onChange={(e) => patch({ isFailure: e.target.checked })} />
                    <Toggle label="Partial reps at end" checked={currentState.isPartial} disabled={busy} onChange={(e) => patch({ isPartial: e.target.checked })} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="session-footer">
            <div className="form-row">
              <Field
                label="Session notes (optional)"
                labelClassName="grow-2"
                type="text"
                disabled={busy}
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
              />
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
        </Card>
      ) : (
        <>
          {paused && (
            <Banner
              label="Workout in progress"
              className="resume-bar"
              title="Workout in progress"
              sub={`${paused.splitDayName || "Workout"} · ${formatDMY(paused.date)} · ${paused.sets.length} ${paused.sets.length === 1 ? "set" : "sets"} logged`}
            >
              <TintButton onClick={handleResumeSession}>Resume</TintButton>
            </Banner>
          )}
          <Toolbar>
            <Segmented
              label="Gym view"
              value={view}
              options={[
                { value: "workout", label: "Workout" },
                { value: "progress", label: "Progress" },
              ]}
              onChange={setView}
            />
          </Toolbar>
          {view === "progress" ? (
            <ProgressPanel days={(split?.days ?? []).filter((d) => !d.isRest).map((d) => ({ id: d.id, name: d.name }))} />
          ) : (
            <>
              <MuscleExplorer
                planned={(split?.days ?? []).flatMap((d) => d.exercises.map((ex) => ({ ...ex, dayName: d.name })))}
              />
              <Dashboard>
                <DashboardMain>
                  {currentDay && (
                    <Card
                      id="preview-title"
                      title={currentDay.isRest ? "Rest day" : currentDay.name}
                      sub={DAY_NAMES[currentDay.dayOfWeek]}
                      below
                      actions={
                        <>
                          <TintButton icon={<PencilIcon size={14} />} onClick={() => openEditor(currentDay)}>
                            Edit
                          </TintButton>
                          {!currentDay.isRest && (
                            <TintButton
                              disabled={busy || Boolean(paused) || currentDay.exercises.length === 0}
                              onClick={() => void handleStartSession(currentDay)}
                            >
                              Start
                            </TintButton>
                          )}
                        </>
                      }
                    >
                      {!currentDay.isRest && (
                        <ListBox wash className="entries">
                          {currentDay.exercises.length > 0 ? (
                            <>
                              {shownExercises.map((ex, idx) => (
                                <div key={ex.id} className="entry-row">
                                  <div className="entry-main">
                                    <strong>
                                      {idx + 1}. {ex.exerciseName}
                                    </strong>
                                    <Badge kind="rest">{muscleLabel(ex.muscleGroup)}</Badge>
                                  </div>
                                  <span className="muted number-tabular entry-side">
                                    {ex.targetSets} × {ex.minReps} – {ex.maxReps}
                                  </span>
                                </div>
                              ))}
                              {moreExercises}
                            </>
                          ) : (
                            <EmptyNote>No exercises yet.</EmptyNote>
                          )}
                        </ListBox>
                      )}
                    </Card>
                  )}
                </DashboardMain>

                <DashboardAside>
                  <Card id="split-title" title="Training days">
                    <ListBox className="split-day-list">
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
                              onClick={() => setSelectedDayId(day.id)}
                            >
                              <span className="split-day-title">
                                <strong>{DAY_NAMES[day.dayOfWeek]}</strong>
                                {isToday && <Badge kind="info">Today</Badge>}
                                {day.isRest ? (
                                  <Badge kind="rest">Rest</Badge>
                                ) : (
                                  <Badge kind="info" className="number-tabular">{day.exercises.length}</Badge>
                                )}
                              </span>
                              <span className="muted split-day-sub">{day.name}</span>
                            </button>
                            {!day.isRest && day.exercises.length > 0 && (
                              <TintButton
                                disabled={busy || Boolean(paused)}
                                onClick={() => {
                                  setSelectedDayId(day.id);
                                  void handleStartSession(day);
                                }}
                              >
                                Start
                              </TintButton>
                            )}
                          </div>
                        );
                      })}
                    </ListBox>
                  </Card>
                </DashboardAside>
              </Dashboard>
              <Card
                id="history-title"
                title="History"
                className="gym-history"
                end={
                  <span className="muted number-tabular">
                    {history.length} {history.length === 1 ? "workout" : "workouts"}
                  </span>
                }
              >
                <ListBox wash className="entries">
                  {history.length > 0 ? (
                    <>
                      {shownHistory.map((h) => {
                        const open = openHistoryId === h.id;
                        return (
                          <div key={h.id} className={`entry-row history-entry${open ? " open" : ""}`}>
                            <button
                              type="button"
                              className="history-toggle"
                              aria-expanded={open}
                              aria-controls={`history-${h.id}`}
                              onClick={() => setOpenHistoryId(open ? null : h.id)}
                            >
                              <span className="history-entry-head">
                                <strong>{h.dayName ?? "Workout"}</strong>
                                {h.isDeload && <Badge kind="rest">Deload</Badge>}
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
                    <EmptyNote>No finished workouts yet.</EmptyNote>
                  )}
                </ListBox>
              </Card>
            </>
          )}
        </>
      )}

      <FormModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={draft ? `Edit ${DAY_NAMES[draft.dayOfWeek]}` : "Edit day"}
        onSubmit={handleSaveDay}
        error={draftError}
        busy={busy}
        canSubmit={!!draft?.name.trim()}
      >
        {draft && (
          <>
            <Field
              label="Name"
              disabled={busy}
              type="text"
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Toggle label="Rest day" disabled={busy} checked={draft.isRest} onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })} />

            {!draft.isRest && (
              <>
                <ListBox className="routine-list">
                  {draft.exercises.length === 0 && <EmptyNote>No exercises yet.</EmptyNote>}
                  {draft.exercises.map((row, i) => {
                    const name = nameOf(row.exerciseId);
                    return (
                      <div key={row.exerciseId} className="routine-row" data-sort>
                        <DragHandle disabled={busy} label={`Drag ${name} to reorder`} {...dragRow} />
                        <div className="routine-row-body">
                          <div className="routine-row-head">
                            <strong>
                              {i + 1}. {name}
                            </strong>
                            <div className="row-actions">
                              <DeleteButton label={`Remove ${name}`} title="Remove" onClick={() => removeRow(row.exerciseId)} />
                            </div>
                          </div>
                          <div className="routine-fields">
                            <Field
                              label="Sets"
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
                            <Field
                              label="Min reps"
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
                            <Field
                              label="Max reps"
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
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </ListBox>

                {addable.length > 0 && draft.exercises.length < 20 && (
                  <div className="routine-add">
                    <Label text="Exercise">
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
                    </Label>
                    <button type="button" className="secondary" onClick={addRow}>
                      <PlusIcon size={14} />
                      Add exercise
                    </button>
                  </div>
                )}

                {draft.exercises.length < 20 &&
                  (showCustom ? (
                    <div className="custom-exercise">
                      <Field
                        label="New exercise"
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
                      <FieldPair>
                        <SelectField
                          label="Muscle group"
                          disabled={busy}
                          value={customMuscle}
                          onChange={(e) => setCustomMuscle(e.target.value as MuscleGroupKey | "other")}
                          options={[...MUSCLE_GROUP_KEYS.map((g) => ({ value: g, label: MUSCLE_GROUP_LABEL[g] })), { value: "other", label: "Other" }]}
                        />
                        <SelectField
                          label="Equipment"
                          disabled={busy}
                          value={customEquipment}
                          onChange={(e) => setCustomEquipment(e.target.value as "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight")}
                          options={[
                            { value: "barbell", label: "Barbell" },
                            { value: "dumbbell", label: "Dumbbell" },
                            { value: "cable", label: "Cable" },
                            { value: "machine", label: "Machine" },
                            { value: "bodyweight", label: "Bodyweight" },
                          ]}
                        />
                      </FieldPair>
                      <FormActions
                        compact
                        onCancel={() => setShowCustom(false)}
                        onSubmit={handleCreateCustomExercise}
                        canSubmit={!busy && !!customName.trim()}
                        submitLabel="Create and add"
                      />
                    </div>
                  ) : (
                    <button type="button" className="secondary btn-sm custom-exercise-btn" onClick={() => setShowCustom(true)}>
                      <PlusIcon size={14} />
                      New exercise
                    </button>
                  ))}
              </>
            )}
          </>
        )}
      </FormModal>
    </Page>
  );
}
