"use client";

import { formatDMY } from "@/lib/format-date";
import { useState } from "react";
import { Navigation } from "../components/navigation";
import { Modal } from "../components/modal";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { useToast } from "../components/toast";
import { MuscleExplorer } from "./muscle-map";
import {
  createCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
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
  exercises: LibraryExercise[];
}

function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function GymClient({
  userName,
  split,
  deload,
  exercises,
}: GymClientProps) {
  const { showToast } = useToast();
  const setStatusMessage = (message: string) => {
    if (message) showToast({ message });
  };
  const todayDayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon, ...
  const [selectedDayId, setSelectedDayId] = useState<string>(() => {
    const todayMatch = split?.days.find((d) => d.dayOfWeek === todayDayOfWeek);
    return todayMatch ? todayMatch.id : split?.days[0]?.id ?? "";
  });

  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [isDeloadMode, setIsDeloadMode] = useState(deload.isDeloadDue);
  const [busy, setBusy] = useState(false);

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
    "chest" | "back" | "legs" | "shoulders" | "arms" | "calves" | "abs" | "other"
  >("chest");
  const [customEquipment, setCustomEquipment] = useState<
    "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"
  >("barbell");

  const currentDay = split?.days.find((d) => d.id === selectedDayId);

  // Routine editor
  const [draft, setDraft] = useState<DayDraft | null>(null);
  const [addId, setAddId] = useState("");
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? "Exercise";
  const addable = exercises.filter((e) => !draft?.exercises.some((d) => d.exerciseId === e.id));
  const groups = [...new Set(addable.map((e) => e.muscleGroup))];

  function openEditor(day: SplitDay) {
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
  }

  function patchRow(i: number, patch: Partial<DraftExercise>) {
    setDraft((d) => d && { ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }

  function moveRow(i: number, by: number) {
    setDraft((d) => {
      if (!d) return d;
      const list = [...d.exercises];
      [list[i], list[i + by]] = [list[i + by], list[i]];
      return { ...d, exercises: list };
    });
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
      showToast({ message: `${nameOf(bad.exerciseId)}: min reps must not be above max reps.`, type: "warning" });
      return;
    }
    setBusy(true);
    try {
      const res = await saveSplitDayAction({ id: draft.id, name: draft.name, isRest: draft.isRest, exercises: draft.isRest ? [] : rows });
      if (res.success) {
        setDraft(null);
        showToast({ message: "Routine saved.", type: "success" });
      } else {
        showToast({ message: "Could not save this day.", type: "warning" });
      }
    } catch {
      showToast({ message: "Could not save this day.", type: "warning" });
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
        date: getTodayString(),
        splitDayId: day.id,
        isDeload: isDeloadMode,
      });
      if (res.success && res.session) {
        setActiveSession({
          id: res.session.id,
          date: res.session.date,
          isDeload: res.session.isDeload,
          splitDayName: day.name,
          sets: [],
        });
        setStatusMessage(`Started session: ${day.name}`);
      }
    } catch {
      setStatusMessage("Failed to start workout session.");
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

    if (isNaN(repsNum) || repsNum <= 0) {
      setStatusMessage("Enter valid reps.");
      return;
    }

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
          setStatusMessage(
            `Set logged with '!!' anomaly (reps below target ${exercise.minReps}-${exercise.maxReps})`,
          );
        } else {
          setStatusMessage(`Set ${setOrder} logged!`);
        }
      }
    } catch {
      setStatusMessage("Failed to log set.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSet(setId: string) {
    if (!activeSession) return;
    try {
      await deleteSetAction(setId);
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              sets: prev.sets.filter((s) => s.id !== setId),
            }
          : null,
      );
      setStatusMessage("Set removed.");
    } catch {
      setStatusMessage("Failed to delete set.");
    }
  }

  async function handleFinishSession() {
    if (!activeSession) return;
    setBusy(true);
    try {
      const dur = parseInt(durationMinutes, 10);
      await finishSessionAction({
        sessionId: activeSession.id,
        durationMinutes: isNaN(dur) ? undefined : dur,
        notes: sessionNotes || undefined,
      });
      setActiveSession(null);
      setStatusMessage("Workout session finished and recorded!");
    } catch {
      setStatusMessage("Failed to finish session.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCustomExercise() {
    if (!customName.trim()) return;
    setBusy(true);
    try {
      const res = await createCustomExerciseAction({
        name: customName.trim(),
        muscleGroup: customMuscle,
        equipmentType: customEquipment,
      });
      if (res.success) {
        // A new exercise is made for this day, so it goes straight into the routine.
        const exerciseId = res.exercise.id;
        setDraft((d) => d && { ...d, exercises: [...d.exercises, { exerciseId, targetSets: "2", minReps: "5", maxReps: "8" }] });
        setShowCustom(false);
        setCustomName("");
      }
    } catch {
      setStatusMessage("Could not create custom exercise.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      {/* Deload Status Card */}
      <section
        className={`surface deload-card ${deload.isDeloadDue ? "due" : ""}`}
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
                {activeSession.splitDayName || "Workout Session"}
              </h2>
              <span className="muted">
                {formatDMY(activeSession.date)} {activeSession.isDeload ? "· Deload" : ""}
              </span>
            </div>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={handleFinishSession}
            >
              Finish workout
            </button>
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
                        Target: {exercise.targetSets} sets · {exercise.minReps}–
                        {exercise.maxReps} reps · 0 RIR failure
                      </span>
                    </div>
                    <span className="badge badge-info">
                      {exercise.muscleGroup}
                    </span>
                  </div>

                  {/* Previous logged sets */}
                  {exerciseSets.length > 0 && (
                    <div className="set-list">
                      {exerciseSets.map((s) => (
                        <div key={s.id} className="set-row">
                          <span>
                            <strong>Set {s.setOrder}:</strong> {s.reps} reps ×{" "}
                            {s.loadValue} {s.loadType}
                            {Number(s.extraKg) > 0 ? ` + ${s.extraKg} kg` : ""}
                            {s.isPartial ? " (partials)" : ""}
                            {s.flagAnomaly && (
                              <span className="badge badge-danger set-flag">
                                !! {s.anomalyReason || "Anomaly"}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="delete-icon-btn"
                            onClick={() => handleDeleteSet(s.id)}
                            aria-label={`Delete set ${s.setOrder} of ${exercise.exerciseName}`}
                            title="Delete"
                          >
                            <TrashIcon size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Set input row */}
                  <div className="set-input-grid">
                    <label>
                      Reps
                      <input
                        type="number"
                        min="1"
                        max="100"
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
                      Load Type
                      <select
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
                        <option value="plates">plates</option>
                        <option value="bodyweight">bodyweight</option>
                      </select>
                    </label>

                    <label>
                      Load Value
                      <input
                        type="number"
                        step="0.5"
                        min="0"
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
                      Extra kg
                      <input
                        type="number"
                        step="0.25"
                        min="0"
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
                      disabled={busy}
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
                      True Failure (0 RIR)
                    </label>

                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={currentState.isPartial}
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
              <label>
                Duration (min)
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
              </label>
              <label className="grow-2">
                Session notes
                <input
                  type="text"
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
                Save & Finish
              </button>
            </div>
          </div>
        </section>
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
                    <div className="row-actions gap">
                      <button type="button" className="secondary btn-sm" onClick={() => openEditor(currentDay)}>
                        <PencilIcon size={14} />
                        Edit
                      </button>
                      {!currentDay.isRest && (
                        <button
                          type="button"
                          className="btn-sm"
                          disabled={busy || currentDay.exercises.length === 0}
                          onClick={() => void handleStartSession(currentDay)}
                        >
                          Start
                        </button>
                      )}
                    </div>
                  </div>

                  {!currentDay.isRest &&
                    (currentDay.exercises.length > 0 ? (
                      <div className="entries">
                        {currentDay.exercises.map((ex, idx) => (
                          <div key={ex.id} className="entry-row">
                            <div className="entry-main">
                              <strong>
                                {idx + 1}. {ex.exerciseName}
                              </strong>
                              <span className="badge badge-rest">{ex.muscleGroup}</span>
                            </div>
                            <span className="muted number-tabular entry-side">
                              {ex.targetSets} × {ex.minReps}–{ex.maxReps}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-note">No exercises yet. Use Edit to add some.</p>
                    ))}
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

                <div className="split-day-list">
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
                            disabled={busy}
                            className="btn-sm"
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
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={draft !== null}
        onClose={() => setDraft(null)}
        title={draft ? `Edit ${DAY_NAMES[draft.dayOfWeek]}` : "Edit day"}
      >
        {draft && (
          <form onSubmit={handleSaveDay}>
            <div className="form-stack">
              <label>
                Name
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={draft.isRest}
                  onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })}
                />
                Rest day
              </label>

              {!draft.isRest && (
                <>
                  <div className="routine-list">
                    {draft.exercises.length === 0 && <p className="empty-note">No exercises yet.</p>}
                    {draft.exercises.map((row, i) => {
                      const name = nameOf(row.exerciseId);
                      return (
                        <div key={row.exerciseId} className="routine-row">
                          <div className="routine-row-head">
                            <strong>
                              {i + 1}. {name}
                            </strong>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="delete-icon-btn edit"
                                disabled={i === 0}
                                onClick={() => moveRow(i, -1)}
                                aria-label={`Move ${name} up`}
                                title="Move up"
                              >
                                <span aria-hidden="true">↑</span>
                              </button>
                              <button
                                type="button"
                                className="delete-icon-btn edit"
                                disabled={i === draft.exercises.length - 1}
                                onClick={() => moveRow(i, 1)}
                                aria-label={`Move ${name} down`}
                                title="Move down"
                              >
                                <span aria-hidden="true">↓</span>
                              </button>
                              <button
                                type="button"
                                className="delete-icon-btn"
                                onClick={() =>
                                  setDraft({ ...draft, exercises: draft.exercises.filter((_, j) => j !== i) })
                                }
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
                      );
                    })}
                  </div>

                  {addable.length > 0 && draft.exercises.length < 20 && (
                    <div className="routine-add">
                      <label>
                        Add exercise
                        <select value={addId || addable[0].id} onChange={(e) => setAddId(e.target.value)}>
                          {groups.map((g) => (
                            <optgroup key={g} label={g[0].toUpperCase() + g.slice(1)}>
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
                        Add
                      </button>
                    </div>
                  )}

                  {draft.exercises.length < 20 &&
                    (showCustom ? (
                      <div className="custom-exercise">
                        <label>
                          New exercise
                          <input
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
                              value={customMuscle}
                              onChange={(e) =>
                                setCustomMuscle(
                                  e.target.value as "chest" | "back" | "legs" | "shoulders" | "arms" | "calves" | "abs" | "other",
                                )
                              }
                            >
                              <option value="chest">Chest</option>
                              <option value="back">Back</option>
                              <option value="legs">Legs</option>
                              <option value="shoulders">Shoulders</option>
                              <option value="arms">Arms</option>
                              <option value="calves">Calves</option>
                              <option value="abs">Abs</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label>
                            Equipment
                            <select
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
                        <div className="custom-exercise-actions">
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
            </div>

            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !draft.name.trim()}>
                Save
              </button>
            </div>
          </form>
        )}
      </Modal>

    </main>
  );
}
