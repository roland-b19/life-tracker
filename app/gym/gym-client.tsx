"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import {
  createCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  startSessionAction,
} from "@/app/actions/gym";

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
  recentSessions: Array<{
    id: string;
    date: string;
    durationMinutes: number | null;
    isDeload: boolean;
    notes: string | null;
    splitDayName: string | null;
    setCount: number;
  }>;
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
  recentSessions,
}: GymClientProps) {
  const todayDayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon, ...
  const [selectedDayId, setSelectedDayId] = useState<string>(() => {
    const todayMatch = split?.days.find((d) => d.dayOfWeek === todayDayOfWeek);
    return todayMatch ? todayMatch.id : split?.days[0]?.id ?? "";
  });

  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [isDeloadMode, setIsDeloadMode] = useState(deload.isDeloadDue);
  const [statusMessage, setStatusMessage] = useState("");
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
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<
    "chest" | "back" | "legs" | "shoulders" | "arms" | "calves" | "abs" | "other"
  >("chest");
  const [customEquipment, setCustomEquipment] = useState<
    "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"
  >("barbell");

  const currentDay = split?.days.find((d) => d.id === selectedDayId);

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
            `⚠️ Set logged with '!!' anomaly (reps below target ${exercise.minReps}-${exercise.maxReps})`,
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
        setShowCustomModal(false);
        setCustomName("");
        setStatusMessage(`Added custom exercise: ${res.exercise.name}`);
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
          <span className="badge badge-warning">5-Week Cycle</span>
          <h2 id="deload-title" style={{ marginTop: "0.25rem" }}>
            {deload.isDeloadDue
              ? "⚡ Deload Week Due"
              : `Week ${deload.currentCycleWeek} of 5`}
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {deload.isDeloadDue
              ? "Time for recovery. Deload sessions reduce fatigue and are excluded from PR calculations."
              : `${5 - deload.currentCycleWeek} week(s) until your scheduled deload week.`}
          </p>
        </div>
        <label className="toggle-label" style={{ minWidth: "8.5rem" }}>
          <input
            type="checkbox"
            checked={isDeloadMode}
            onChange={(e) => setIsDeloadMode(e.target.checked)}
          />
          Deload Session
        </label>
      </section>

      {/* Active Workout Session Logger */}
      {activeSession ? (
        <section className="surface" aria-labelledby="active-session-title">
          <div className="section-heading">
            <div>
              <span className="badge badge-info">Active Workout</span>
              <h2 id="active-session-title" style={{ marginTop: "0.25rem" }}>
                {activeSession.splitDayName || "Workout Session"}
              </h2>
              <span className="muted">
                {activeSession.date} {activeSession.isDeload ? "· Deload" : ""}
              </span>
            </div>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={handleFinishSession}
            >
              Finish Workout
            </button>
          </div>

          <div style={{ marginTop: "1rem" }}>
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
                      <h3 style={{ margin: 0, fontSize: "1.15rem" }}>
                        {exercise.exerciseName}
                      </h3>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
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
                    <div style={{ margin: "0.5rem 0" }}>
                      {exerciseSets.map((s) => (
                        <div key={s.id} className="set-row">
                          <span>
                            <strong>Set {s.setOrder}:</strong> {s.reps} reps ×{" "}
                            {s.loadValue} {s.loadType}
                            {Number(s.extraKg) > 0 ? ` + ${s.extraKg} kg` : ""}
                            {s.isPartial ? " (partials)" : ""}
                            {s.flagAnomaly && (
                              <span
                                className="badge badge-danger"
                                style={{ marginLeft: "0.5rem" }}
                              >
                                ⚠️ !! {s.anomalyReason || "Anomaly"}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="danger"
                            style={{
                              minHeight: "1.8rem",
                              padding: "0.2rem 0.5rem",
                              fontSize: "0.8rem",
                            }}
                            onClick={() => handleDeleteSet(s.id)}
                          >
                            Delete
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
                        style={{
                          minHeight: "2.75rem",
                          borderRadius: "0.65rem",
                          border: "1px solid var(--separator)",
                          background: "var(--surface)",
                          color: "var(--text)",
                          padding: "0.5rem",
                          font: "inherit",
                        }}
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
                        placeholder="+ kg"
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
                      + Log Set
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "1.25rem",
                      marginTop: "0.5rem",
                    }}
                  >
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

          <div
            style={{
              marginTop: "1.25rem",
              borderTop: "1px solid var(--separator)",
              paddingTop: "1rem",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <div className="form-row" style={{ margin: 0 }}>
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
              <label style={{ flex: "2 1 15rem" }}>
                Session Notes
                <input
                  type="text"
                  placeholder="How did the session feel?"
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
        /* Routine / Split Overview in Dashboard Grid */
        <div className="dashboard-grid">
          {/* Left Column: Planned Routine Preview & Recent History */}
          <div className="dashboard-main">
            {/* Selected Day Exercise Preview */}
            {currentDay && !currentDay.isRest ? (
              <section className="surface" aria-labelledby="preview-title">
                <div className="section-heading">
                  <div>
                    <span className="badge badge-info">{currentDay.exercises.length} Exercises Planned</span>
                    <h2 id="preview-title" style={{ marginTop: "0.25rem" }}>
                      {currentDay.name} Routine
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleStartSession(currentDay)}
                    style={{ padding: "0.5rem 1.15rem" }}
                  >
                    Start Workout Now →
                  </button>
                </div>

                <div className="entries" style={{ marginTop: "1rem" }}>
                  {currentDay.exercises.map((ex, idx) => (
                    <div key={ex.id} className="entry-row">
                      <div>
                        <strong>{idx + 1}. {ex.exerciseName}</strong>
                        <span className="badge badge-rest" style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>
                          {ex.muscleGroup}
                        </span>
                      </div>
                      <span className="muted" style={{ fontSize: "0.9rem" }}>
                        {ex.targetSets} sets × {ex.minReps}–{ex.maxReps} reps ({ex.equipmentType})
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="surface">
                <h2>Rest & Recovery Day</h2>
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  No high-intensity resistance training scheduled for this day. Hydrate, eat adequate protein, and allow central nervous system recovery.
                </p>
              </section>
            )}

            {/* Recent Workout History */}
            <section
              className="surface"
              aria-labelledby="recent-title"
            >
              <div className="section-heading">
                <h2 id="recent-title">Recent Workouts</h2>
                <span className="muted">{recentSessions.length} recorded</span>
              </div>
              <div className="entries" style={{ marginTop: "0.75rem" }}>
                {recentSessions.length === 0 && (
                  <p className="muted" style={{ textAlign: "center", padding: "1.5rem 0" }}>
                    No workouts logged yet. Start your first session above!
                  </p>
                )}
                {recentSessions.map((s) => (
                  <div key={s.id} className="entry-row">
                    <div>
                      <strong>{s.splitDayName || "Workout"}</strong>
                      <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                        {s.date}
                      </span>
                      {s.isDeload && (
                        <span className="badge badge-warning" style={{ marginLeft: "0.4rem" }}>
                          Deload
                        </span>
                      )}
                      {s.notes && (
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.85rem" }} className="muted">
                          📝 {s.notes}
                        </p>
                      )}
                    </div>
                    <span className="entry-value">
                      {s.setCount} sets {s.durationMinutes ? `· ${s.durationMinutes} min` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Split Days Selector & Custom Exercise CTA */}
          <div className="dashboard-aside sticky">
            <section className="surface" aria-labelledby="split-title">
              <div className="section-heading" style={{ marginBottom: "0.85rem" }}>
                <div>
                  <h2 id="split-title" style={{ fontSize: "1.2rem" }}>Training Days</h2>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>5-Day Upper / Lower Split</span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCustomModal(true)}
                  style={{ minHeight: "2.1rem", padding: "0.25rem 0.65rem", fontSize: "0.8rem" }}
                >
                  + Custom
                </button>
              </div>

              <div style={{ display: "grid", gap: "0.6rem" }}>
                {split?.days.map((day) => {
                  const isToday = day.dayOfWeek === todayDayOfWeek;
                  const isSelected = day.id === selectedDayId;
                  const dayNames = [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ];

                  return (
                    <div
                      key={day.id}
                      className={`split-day-card ${isToday ? "today" : ""}`}
                      style={{
                        outline: isSelected ? "2px solid var(--tint)" : "none",
                        padding: "0.85rem 1rem",
                      }}
                      onClick={() => setSelectedDayId(day.id)}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <strong style={{ fontSize: "0.95rem" }}>{dayNames[day.dayOfWeek]}</strong>
                          {isToday && <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>Today</span>}
                          {day.isRest ? (
                            <span className="badge badge-rest" style={{ fontSize: "0.7rem" }}>Rest</span>
                          ) : (
                            <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>{day.exercises.length}</span>
                          )}
                        </div>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }} className="muted">
                          {day.name}
                        </p>
                      </div>

                      {!day.isRest && (
                        <button
                          type="button"
                          disabled={busy}
                          style={{ minHeight: "2.1rem", padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
                          onClick={(e) => {
                            e.stopPropagation();
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
      )}

      {/* Status banner */}
      {statusMessage && (
        <p className="error" style={{ color: "var(--tint)", marginTop: "1rem" }}>
          {statusMessage}
        </p>
      )}

      {/* Modal: Custom Exercise */}
      {showCustomModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 100,
          }}
          onClick={() => setShowCustomModal(false)}
        >
          <div
            className="surface"
            style={{ width: "min(100%, 28rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Create Custom Exercise</h2>
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
              <label>
                Exercise Name
                <input
                  type="text"
                  placeholder="e.g. Incline Smith Machine Press"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </label>

              <label>
                Muscle Group
                <select
                  style={{
                    minHeight: "2.75rem",
                    borderRadius: "0.65rem",
                    border: "1px solid var(--separator)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    padding: "0.5rem",
                  }}
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
                  style={{
                    minHeight: "2.75rem",
                    borderRadius: "0.65rem",
                    border: "1px solid var(--separator)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    padding: "0.5rem",
                  }}
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

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  style={{ flex: 1 }}
                  disabled={busy || !customName.trim()}
                  onClick={handleCreateCustomExercise}
                >
                  Save Exercise
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCustomModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
