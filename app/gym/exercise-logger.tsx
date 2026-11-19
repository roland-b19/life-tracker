"use client";

import { formatDMY } from "@/lib/format-date";
import { showDecimal } from "@/lib/decimal-input";
import type { HistoryEntry } from "@/lib/gym-progress";
import { GYM_LIMITS } from "@/lib/validations/gym";
import { Badge, ErrorText, Field, SelectField, Toggle } from "../components/blocks";
import { ChevronRightIcon, PlusIcon } from "../components/icons";
import { DeleteButton, ListBox } from "../components/lists";
import { setText, type ActiveSessionData, type ExerciseItem, type WorkoutSetData } from "./types";
import { MuscleTag } from "./muscle-tag";

const ANOMALY_LABEL: Record<string, string> = { too_heavy: "Too heavy", form: "Form", pain: "Pain", other: "Other" };
const UNIT_LABEL: Record<string, string> = { kg: "kg", plates: "plates", bodyweight: "BW" };

export interface SetInput {
  reps: string;
  loadType: "kg" | "plates" | "bodyweight";
  loadValue: string;
  isFailure: boolean;
  isPartial: boolean;
  isGoodForm: boolean;
  notes: string;
}

/** A fresh set form: reps start at the day's minimum; the load is left empty, never a made-up 40 kg. */
export function emptyInput(e: ExerciseItem): SetInput {
  return {
    reps: String(e.minReps),
    loadType: e.equipmentType === "cable" ? "plates" : e.equipmentType === "bodyweight" ? "bodyweight" : "kg",
    loadValue: "",
    isFailure: true,
    isPartial: false,
    isGoodForm: true,
    notes: "",
  };
}

/** What stops a set from being logged, in the form's words ("" when nothing does); the limits are the server's. */
function inputProblem(i: SetInput) {
  const reps = Number(i.reps), load = Number(i.loadValue || 0);
  if (i.reps && (!Number.isInteger(reps) || reps < 1 || reps > GYM_LIMITS.reps)) return `Reps must be a whole number from 1 to ${GYM_LIMITS.reps}.`;
  if (load < 0 || load > GYM_LIMITS.load) return `Value can be at most ${GYM_LIMITS.load}.`;
  return "";
}
export const canLog = (i: SetInput) => Number(i.reps) > 0 && (i.loadType === "bodyweight" || Number(i.loadValue) > 0) && !inputProblem(i);

/** One exercise of the workout in hand: its target, last time's sets, the sets logged now and the form for the next one. */
export function ExerciseLogger({
  exercise,
  session,
  history,
  input,
  open,
  busy,
  onToggle,
  onPatch,
  onLog,
  onDeleteSet,
}: {
  exercise: ExerciseItem;
  session: ActiveSessionData;
  history: HistoryEntry[];
  input: SetInput;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPatch: (change: Partial<SetInput>) => void;
  onLog: () => void;
  onDeleteSet: (set: WorkoutSetData) => void;
}) {
  const exerciseSets = session.sets.filter((s) => s.exerciseId === exercise.exerciseId);
  const problem = inputProblem(input);
  // The same exercise the last time it was trained (this day first, any day otherwise): the numbers to beat
  const past = history.filter((h) => h.date < session.date && h.exercises.some((e) => e.id === exercise.exerciseId));
  const last = past.find((h) => h.dayId === session.splitDayId) ?? past[0];
  const lastSets = last?.exercises.find((e) => e.id === exercise.exerciseId)?.sets ?? [];

  return (
    <div className="entry-row workout-exercise-card">
      <div className="exercise-header">
        <h3 className="exercise-title">
          <button type="button" className="group-toggle" aria-expanded={open} onClick={onToggle}>
            {exercise.exerciseName}
            <ChevronRightIcon size={14} />
          </button>
        </h3>
        <MuscleTag group={exercise.muscleGroup} />
        <span className="muted exercise-meta">
          Target: {exercise.targetSets} sets · {exercise.minReps} – {exercise.maxReps} reps
        </span>
        {last && (
          <div className="last-time">
            <span className="muted">Last time · {formatDMY(last.date)}</span>
            {lastSets.map((set, i) => (
              <span key={i} className="number-tabular">
                {setText(set)}
              </span>
            ))}
          </div>
        )}
      </div>

      {open && (
        <>
          {/* Previous logged sets */}
          {exerciseSets.length > 0 && (
            <ListBox wash className="entries set-list">
              {exerciseSets.map((s) => (
                <div key={s.id} className="entry-row">
                  <span>
                    <strong>Set {s.setOrder}:</strong> {s.reps} reps ×{" "}
                    {showDecimal(String(s.loadValue))} {UNIT_LABEL[s.loadType] ?? s.loadType}
                    {Number(s.extraKg) > 0 ? ` + ${showDecimal(String(s.extraKg))} kg` : ""}
                    {s.isPartial ? " (partials)" : ""}
                    {s.isGoodForm ? "" : " (poor form)"}
                    {s.flagAnomaly && <Badge kind="danger" className="set-flag">{(s.anomalyReason && ANOMALY_LABEL[s.anomalyReason]) || "Anomaly"}</Badge>}
                  </span>
                  <DeleteButton label={`Delete set ${s.setOrder} of ${exercise.exerciseName}`} onClick={() => onDeleteSet(s)} />
                </div>
              ))}
            </ListBox>
          )}

          {/* Set input row */}
          <div className="set-input-grid">
            <Field
              label="Reps"
              type="number"
              min="1"
              max="200"
              inputMode="numeric"
              disabled={busy}
              value={input.reps}
              onChange={(e) => onPatch({ reps: e.target.value })}
            />
            <Field
              label="Value"
              type="number"
              step="0.5"
              min="0"
              inputMode="decimal"
              disabled={busy}
              value={input.loadValue}
              onChange={(e) => onPatch({ loadValue: e.target.value })}
            />
            <SelectField
              label="Unit"
              disabled={busy}
              value={input.loadType}
              onChange={(e) => onPatch({ loadType: e.target.value as SetInput["loadType"] })}
              options={[
                { value: "kg", label: "kg" },
                { value: "plates", label: "Plates" },
                { value: "bodyweight", label: "BW" },
              ]}
            />
          </div>

          <div className="toggle-row">
            <Toggle label="True failure (0 RIR)" checked={input.isFailure} disabled={busy} onChange={(e) => onPatch({ isFailure: e.target.checked })} />
            <Toggle label="Partial reps at end" checked={input.isPartial} disabled={busy} onChange={(e) => onPatch({ isPartial: e.target.checked })} />
            <Toggle label="Good form" checked={input.isGoodForm} disabled={busy} onChange={(e) => onPatch({ isGoodForm: e.target.checked })} />
          </div>

          {problem && <ErrorText>{problem}</ErrorText>}
          <button type="button" className="log-set" disabled={busy || !canLog(input)} onClick={onLog}>
            <PlusIcon size={14} />
            Log set
          </button>
        </>
      )}
    </div>
  );
}
