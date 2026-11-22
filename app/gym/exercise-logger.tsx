"use client";

import { formatDMY } from "@/lib/format-date";
import { setLoad, type HistoryEntry } from "@/lib/gym-progress";
import { formatAmount } from "@/lib/number-format";
import { AT_MOST_LOAD, GYM_LIMITS, NOT_NEGATIVE, REPS_RANGE, TWO_DECIMALS, twoDecimals, ZERO_LOAD } from "@/lib/validations/gym";
import { useRef, useState } from "react";
import { Badge, ErrorText, Field, FoldButton, SelectField, Toggle } from "../components/blocks";
import { PlusIcon } from "../components/icons";
import { DeleteButton, ListBox } from "../components/lists";
import { useOnce } from "../components/once";
import { setText, type ActiveSessionData, type ExerciseItem, type WorkoutSetData } from "./types";
import { MuscleTag } from "./muscle-tag";

const ANOMALY_LABEL: Record<string, string> = { too_heavy: "Too heavy", form: "Form", pain: "Pain", other: "Other" };

export interface SetInput {
  reps: string;
  loadType: "kg" | "plates" | "bodyweight";
  loadValue: string;
  isFailure: boolean;
  isPartial: boolean;
  isGoodForm: boolean;
  notes: string;
}

/** The set checks, all off: each new set starts with them unchecked (D-039). */
export const UNCHECKED = { isFailure: false, isPartial: false, isGoodForm: false } as const;

/** A fresh set form: reps start at the day's minimum; the load is left empty, never a made-up 40 kg. */
export function emptyInput(e: ExerciseItem): SetInput {
  return {
    reps: String(e.minReps),
    loadType: e.equipmentType === "cable" ? "plates" : e.equipmentType === "bodyweight" ? "bodyweight" : "kg",
    loadValue: "",
    ...UNCHECKED,
    notes: "",
  };
}

/**
 * What stops a set from being logged, in the server's words ("" when nothing does); the limits are the server's. Text
 * that is not a number is the number field's own error.
 */
export function inputProblem(i: SetInput) {
  const reps = Number(i.reps), load = Number(i.loadValue || 0);
  if (i.reps && (!Number.isInteger(reps) || reps < 1 || reps > GYM_LIMITS.reps)) return REPS_RANGE;
  if (!Number.isFinite(load)) return "";
  if (load < 0) return NOT_NEGATIVE;
  if (load > GYM_LIMITS.load) return AT_MOST_LOAD;
  if (!twoDecimals(load)) return TWO_DECIMALS;
  if (i.loadValue !== "" && load === 0 && i.loadType !== "bodyweight") return ZERO_LOAD;
  return "";
}
export const canLog = (i: SetInput) => Number(i.reps) > 0 && (i.loadType === "bodyweight" || Number(i.loadValue) > 0) && !inputProblem(i);

/**
 * D-038: the exercise's best load in the same unit (`sets`: its past and this workout's), when `load` is more than 50%
 * above it, so the set needs a second tap; null otherwise. Plates compare with plates until they count in kg.
 */
export function outlierBest(load: number, loadType: string, sets: { loadType: string; load: number }[]): number | null {
  const best = Math.max(0, ...sets.filter((s) => s.loadType === loadType).map((s) => s.load));
  return best > 0 && load > best * 1.5 ? best : null;
}

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
  onLog: (spot: Element) => void;
  onDeleteSet: (set: WorkoutSetData, spot: Element | null) => void;
}) {
  const exerciseSets = session.sets.filter((s) => s.exerciseId === exercise.exerciseId);
  const problem = inputProblem(input);
  // A set far above the best (D-038) is logged on a second tap; a change of value or unit asks again.
  const [armed, setArmed] = useState("");
  const once = useOnce();
  // The button last tapped in a set row, set before its own handler runs.
  const tappedButton = useRef<Element | null>(null);
  const asked = `${input.loadType}:${input.loadValue}`;
  const known = [
    ...history.flatMap((h) => h.exercises.find((e) => e.id === exercise.exerciseId)?.sets ?? []),
    ...exerciseSets.map((s) => ({ loadType: s.loadType, load: setLoad(s.loadType, s.loadValue, s.extraKg) })),
  ];
  const best = canLog(input) ? outlierBest(setLoad(input.loadType, input.loadValue || 0, 0), input.loadType, known) : null;
  // The same exercise the last time it was trained (this day first, any day otherwise): the numbers to beat
  const past = history.filter((h) => h.date < session.date && h.exercises.some((e) => e.id === exercise.exerciseId));
  const last = past.find((h) => h.dayId === session.splitDayId) ?? past[0];
  const lastSets = last?.exercises.find((e) => e.id === exercise.exerciseId)?.sets ?? [];

  return (
    <div className="entry-row workout-exercise-card">
      <div className="exercise-header">
        {/* The arrow folds the exercise, like a card's fold arrow; the name is plain text (D-033) */}
        <h3 className="exercise-title">
          {exercise.exerciseName}{" "}
          <FoldButton open={open} label={`Show ${exercise.exerciseName}`} onToggle={onToggle} />
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
                <div key={s.id} className="entry-row" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                  <span className="number-tabular">
                    <strong>Set {s.setOrder}:</strong> {setText({ reps: s.reps, loadType: s.loadType, load: setLoad(s.loadType, s.loadValue, s.extraKg) })}
                    {s.isPartial ? " (partials)" : ""}
                    {s.isGoodForm ? "" : " (poor form)"}
                    {s.flagAnomaly && <Badge kind="danger" className="set-flag">{(s.anomalyReason && ANOMALY_LABEL[s.anomalyReason]) || "Anomaly"}</Badge>}
                  </span>
                  <DeleteButton label={`Delete set ${s.setOrder} of ${exercise.exerciseName}`} onClick={() => onDeleteSet(s, tappedButton.current)} />
                </div>
              ))}
            </ListBox>
          )}

          {/* Set input row */}
          <div className="set-input-grid">
            <Field
              label="Reps"
              type="number"
              inputMode="numeric"
              disabled={busy}
              value={input.reps}
              onChange={(e) => onPatch({ reps: e.target.value })}
            />
            <Field
              label="Value"
              type="number"
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
          {best !== null && armed === asked && (
            <ErrorText>
              Much more than your best ({formatAmount(best, 2)} {input.loadType === "plates" ? "plates" : "kg"}). Tap again to log.
            </ErrorText>
          )}
          <button
            type="button"
            className="log-set"
            disabled={busy || !canLog(input)}
            onClick={(e) => {
              if (best === null || armed === asked) return onLog(e.currentTarget);
              // The first tap only asks; the rest of its double tap is swallowed, so it cannot confirm by itself (D-043).
              setArmed(asked);
              once("ask", () => undefined, e.currentTarget);
            }}
          >
            <PlusIcon size={14} />
            Log set
          </button>
        </>
      )}
    </div>
  );
}
