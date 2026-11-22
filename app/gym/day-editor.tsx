"use client";

import { visible } from "@/lib/validations/common";
import { EXERCISE_NAME_MIN, exerciseNameKey, GYM_LIMITS, MIN_OVER_MAX, NAME_REQUIRED, NAME_TOO_SHORT, ROUTINE_RANGE } from "@/lib/validations/gym";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, muscleLabel, type MuscleGroupKey } from "@/lib/gym-muscles";
import { useRef, useState } from "react";
import { DeleteButton, DragHandle, ListBox, useDragSort } from "../components/lists";
import { EmptyNote, Field, FieldPair, FormActions, FormModal, Label, SelectField, Toggle } from "../components/blocks";
import { PlusIcon } from "../components/icons";
import { useOnce } from "../components/once";
import { undoWith, useToast } from "../components/toast";
import { DAY_NAMES, type DayDraft, type DraftExercise, type LibraryExercise, type SplitDay } from "./types";
import { addCustomExerciseAction, deleteCustomExerciseAction, restoreCustomExerciseAction, saveSplitDayAction } from "@/actions/gym";

const NEW_ROW = { targetSets: "2", minReps: "5", maxReps: "8" };

/** The days' routine as the server stores it: whole numbers, none for a rest day. */
const toRows = (day: Pick<SplitDay, "isRest" | "exercises">) =>
  day.isRest ? [] : day.exercises.map((x) => ({ exerciseId: x.exerciseId, targetSets: x.targetSets, minReps: x.minReps, maxReps: x.maxReps }));

/** The form's copy of a saved day. */
const toDraft = (day: SplitDay): DayDraft => ({
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

/**
 * What stops a day from being saved, in the server's words ("" when nothing does): the routine's numbers (whole, within
 * the limits), min reps at or below max reps, and a name. A row's problem starts with its exercise's name.
 */
export function dayProblem(name: string, rows: { exerciseId: string; targetSets: number; minReps: number; maxReps: number }[], nameOf: (id: string) => string) {
  const whole = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  const wrong = rows.find((r) => !whole(r.targetSets, GYM_LIMITS.targetSets) || !whole(r.minReps, GYM_LIMITS.targetReps) || !whole(r.maxReps, GYM_LIMITS.targetReps));
  if (wrong) return `${nameOf(wrong.exerciseId)}: ${ROUTINE_RANGE}`;
  const bad = rows.find((r) => r.minReps > r.maxReps);
  if (bad) return `${nameOf(bad.exerciseId)}: ${MIN_OVER_MAX}`;
  if (!visible(name)) return NAME_REQUIRED;
  return "";
}

/** An editing session that was dismissed: Undo of "Changes discarded" reopens the editor with it. */
export interface DiscardedEdit {
  draft: DayDraft;
  /** The exercises created in that session, which its Cancel deletes. */
  created: LibraryExercise[];
}

/**
 * The dialog that edits one training day: its name, whether it is a rest day, and its routine (add, remove, drag or
 * arrow keys to reorder, new exercise). Mounted only while open, so each opening starts fresh, or from `resume`.
 * Cancel discards on purpose and deletes the exercises created here; Escape, a click outside or the close button
 * discards with "Changes discarded" and an Undo that reopens it with the edits (D-039).
 */
export function DayEditor({
  day,
  exercises,
  busy,
  setBusy,
  resume,
  onClose,
  onReopen,
}: {
  day: SplitDay;
  exercises: LibraryExercise[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  resume?: DiscardedEdit;
  onClose: () => void;
  onReopen: (edit: DiscardedEdit) => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<DayDraft>(() => resume?.draft ?? toDraft(day));
  const [created, setCreated] = useState<LibraryExercise[]>(() => resume?.created ?? []);
  const [errorMsg, setErrorMsg] = useState("");
  const [addId, setAddId] = useState("");
  const [query, setQuery] = useState("");
  const move = (from: number, to: number) =>
    setDraft((d) => {
      const list = [...d.exercises];
      list.splice(to, 0, ...list.splice(from, 1));
      return { ...d, exercises: list };
    });
  const dragRow = useDragSort(move);
  const known = [...exercises, ...created.filter((c) => !exercises.some((e) => e.id === c.id))];
  // The names as the editor opened: a row whose exercise is deleted elsewhere keeps the name the user knows.
  const [seen] = useState(() => new Map([...day.exercises.map((e) => [e.exerciseId, e.exerciseName] as const), ...exercises.map((e) => [e.id, e.name] as const)]));
  const nameOf = (id: string) => known.find((e) => e.id === id)?.name ?? seen.get(id) ?? "Exercise";
  const addable = exercises.filter((e) => !draft.exercises.some((d) => d.exerciseId === e.id));
  // The search matches the way names are compared: spaces, case and a trailing "." do not matter.
  const found = addable.filter((e) => exerciseNameKey(e.name).includes(exerciseNameKey(query)));
  const groups = [...new Set(found.map((e) => e.muscleGroup))];
  const pick = found.some((e) => e.id === addId) ? addId : (found[0]?.id ?? "");

  // New exercise form
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroupKey | "other">("chest");
  const [customEquipment, setCustomEquipment] = useState<"barbell" | "dumbbell" | "cable" | "machine" | "bodyweight">("barbell");
  // "Create and add" acts once per tap burst (D-043); the tapped button is set before its own handler runs.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);

  // Cancel runs `cancel` and then `close`, like Escape, a click outside and the close button; this tells `close` the
  // exercises are being dealt with, so it does not also offer the discarded changes back.
  const cancelled = useRef(false);

  function close() {
    onClose();
    if (cancelled.current) return void (cancelled.current = false);
    if (JSON.stringify(draft) === JSON.stringify(toDraft(day))) return;
    const kept = { draft, created };
    showToast({
      message: "Changes discarded",
      touches: [`workout_split_days:${day.id}`],
      // Nothing to write: the editor reopens with the edits.
      onUndo: undoWith(showToast, async () => {
        onReopen(kept);
        return true;
      }),
    });
  }

  // Cancel deletes the exercises created in this session (only those), with an Undo that brings them back.
  async function cancel() {
    cancelled.current = true;
    if (!created.length) return;
    const answers = await Promise.all(created.map((x) => deleteCustomExerciseAction(x.id).catch(() => null)));
    const gone = created.filter((_, i) => answers[i]?.success);
    if (!gone.length) return;
    showToast({
      message: gone.length === 1 ? `Removed "${gone[0].name}"` : `Removed ${gone.length} new exercises`,
      touches: gone.map((x) => `exercises:${x.id}`),
      onUndo: undoWith(
        showToast,
        async () => {
          const back = await Promise.all(gone.map((x) => restoreCustomExerciseAction(x).catch(() => null)));
          return back.find((b) => !b?.success) ?? { success: true };
        },
        (back) => (back && !back.success ? back.error : "Failed to restore exercise"),
      ),
    });
  }

  function patchRow(i: number, patch: Partial<DraftExercise>) {
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  }

  function removeRow(id: string) {
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((e) => e.exerciseId !== id) }));
  }

  function addRow() {
    if (!pick) return;
    setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId: pick, ...NEW_ROW }] }));
    setAddId("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rows = draft.exercises.map((x) => ({
      exerciseId: x.exerciseId,
      targetSets: Number(x.targetSets),
      minReps: Number(x.minReps),
      maxReps: Number(x.maxReps),
    }));
    const problem = dayProblem(draft.name, rows, nameOf);
    if (problem) {
      setErrorMsg(problem);
      return;
    }
    setErrorMsg("");
    setBusy(true);
    try {
      const res = await saveSplitDayAction({ id: draft.id, name: draft.name, isRest: draft.isRest, exercises: draft.isRest ? [] : rows });
      if (res.success) {
        onClose();
        showToast({
          message: `Saved "${draft.name.trim()}"`,
          type: "success",
          // The day's row and its routine rows.
          touches: [`workout_split_days:${day.id}`],
          // Writes the old day back; the server refresh brings it to the list.
          onUndo: undoWith(
            showToast,
            () => saveSplitDayAction({ id: day.id, name: day.name, isRest: day.isRest, exercises: toRows(day) }),
            (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
          ),
        });
      } else {
        // The editor stays open with the day as it was typed, so nothing is lost.
        setErrorMsg(res.error);
      }
    } catch {
      setErrorMsg("Failed to save day");
    } finally {
      setBusy(false);
    }
  }

  async function addCustomExercise() {
    const name = customName.trim();
    if (!visible(name)) return;
    if (name.length < EXERCISE_NAME_MIN) {
      setErrorMsg(NAME_TOO_SHORT);
      return;
    }
    const same = known.find((e) => exerciseNameKey(e.name) === exerciseNameKey(name));
    if (same) {
      setErrorMsg(`"${same.name}" already exists.`);
      return;
    }
    setErrorMsg("");
    setBusy(true);
    try {
      // The id is made here (D-040), so an add sent twice is one exercise.
      const made = { id: crypto.randomUUID(), name, muscleGroup: customMuscle, equipmentType: customEquipment };
      const res = await addCustomExerciseAction(made);
      if (res.success) {
        // A new exercise is made for this day, so it goes straight into the routine.
        const exerciseId = res.exercise.id;
        setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId, ...NEW_ROW }] }));
        setCreated((list) => [...list, made]);
        setShowCustom(false);
        setCustomName("");
        showToast({
          message: `Created "${name}"`,
          type: "success",
          touches: [`exercises:${exerciseId}`],
          // Refused once a routine or a set uses it, so Undo never deletes data.
          onUndo: undoWith(
            showToast,
            async () => {
              const gone = await deleteCustomExerciseAction(exerciseId).catch(() => null);
              if (gone?.success) {
                setDraft((d) => ({ ...d, exercises: d.exercises.filter((x) => x.exerciseId !== exerciseId) }));
                setCreated((list) => list.filter((x) => x.id !== exerciseId));
              }
              return gone;
            },
            (back) => (back && !back.success ? back.error : "Failed to undo: the exercise is already in use"),
          ),
        });
      } else {
        setErrorMsg(res.error);
      }
    } catch {
      setErrorMsg("Failed to create exercise");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal
      isOpen
      onClose={close}
      onCancel={() => void cancel()}
      title={`Edit ${DAY_NAMES[draft.dayOfWeek]}`}
      onSubmit={save}
      error={errorMsg}
      busy={busy}
      canSubmit={visible(draft.name) && (draft.isRest || draft.exercises.every((x) => x.targetSets && x.minReps && x.maxReps))}
    >
      <Field
        label="Name"
        disabled={busy}
        type="text"
        required
        maxLength={GYM_LIMITS.dayName}
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
                  <DragHandle
                    disabled={busy}
                    label={`Drag ${name} to reorder`}
                    {...dragRow}
                    onKeyDown={(e) => {
                      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
                      if (to < 0 || to >= draft.exercises.length) return;
                      e.preventDefault();
                      move(i, to);
                    }}
                  />
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
              <Field
                label="Search exercises"
                disabled={busy}
                type="text"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter only searches; it does not submit the whole day.
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
              {found.length === 0 ? (
                <EmptyNote>No exercise matches.</EmptyNote>
              ) : (
                <>
                  <Label text="Exercise">
                    <select disabled={busy} value={pick} onChange={(e) => setAddId(e.target.value)}>
                      {groups.map((g) => (
                        <optgroup key={g} label={muscleLabel(g)}>
                          {found
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
                  <button type="button" className="secondary btn-sm" onClick={addRow}>
                    <PlusIcon size={14} />
                    Add exercise
                  </button>
                </>
              )}
            </div>
          )}

          {draft.exercises.length < 20 &&
            (showCustom ? (
              <div className="custom-exercise" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                <Field
                  label="New exercise"
                  disabled={busy}
                  type="text"
                  maxLength={GYM_LIMITS.exerciseName}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter creates the exercise instead of submitting the whole day.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      once("create", addCustomExercise, null);
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
                    onChange={(e) => setCustomEquipment(e.target.value as typeof customEquipment)}
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
                  onSubmit={() => once("create", addCustomExercise, tappedButton.current)}
                  canSubmit={!busy && visible(customName)}
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
    </FormModal>
  );
}
