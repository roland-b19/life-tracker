"use client";

import { visible } from "@/lib/validations/common";
import { EXERCISE_NAME_MIN, exerciseNameKey, GYM_LIMITS, MIN_OVER_MAX, NAME_REQUIRED, NAME_TOO_SHORT, ROUTINE_RANGE } from "@/lib/validations/gym";
import { alreadyExists } from "@/lib/validations/result";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, muscleLabel, type MuscleGroupKey } from "@/lib/gym-muscles";
import { useRef, useState } from "react";
import { DeleteButton, DragHandle, ListBox, useDragSort } from "../components/lists";
import { EmptyNote, Field, FieldPair, FormActions, FormModal, Label, SelectField, Toggle, type FormOpening } from "../components/blocks";
import { refusal } from "../components/forms";
import { PlusIcon } from "../components/icons";
import { useOnce } from "../components/once";
import { undoWith, useToast } from "../components/toast";
import { DAY_NAMES, type DayDraft, type DraftExercise, type LibraryExercise, type SplitDay } from "./types";
import { addCustomExerciseAction, deleteCustomExerciseAction, restoreCustomExerciseAction, saveSplitDayAction } from "@/actions/gym";

const NEW_ROW = { targetSets: "2", minReps: "5", maxReps: "8" };

/** A draft's routine as the server takes it: numbers. */
const toRows = (draft: DayDraft) =>
  draft.exercises.map((x) => ({ exerciseId: x.exerciseId, targetSets: Number(x.targetSets), minReps: Number(x.minReps), maxReps: Number(x.maxReps) }));

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

/**
 * What stops a new exercise from being made, in the server's words ("" when nothing does): a name shorter than the
 * minimum, or one an exercise in `known` already has (compared as the server does).
 */
export function exerciseNameProblem(name: string, known: { name: string }[]) {
  if (name.length < EXERCISE_NAME_MIN) return NAME_TOO_SHORT;
  const same = known.find((e) => exerciseNameKey(e.name) === exerciseNameKey(name));
  return same ? alreadyExists(same.name) : "";
}

/** An editing session that was dismissed: Undo of "Changes discarded" reopens the editor with it. */
export interface DiscardedEdit {
  draft: DayDraft;
  /** The exercises created in that session, which its Cancel deletes. */
  created: LibraryExercise[];
}

/**
 * The dialog that edits one training day: its name, whether it is a rest day, and its routine (add, remove, drag or
 * arrow keys to reorder, new exercise). Its form keeps its opening while its save is out (D-047): opened again before
 * the answer, also after the page was left, it waits for that save with the day it sent, as a fresh opening would show
 * the day from before it and its Save would undo it. Each new opening starts from the day as saved (what the last save
 * sent, until the refresh brings it), or from `resume`. Cancel discards on purpose and deletes the exercises created
 * here; Escape, a click outside or the close button discards with "Changes discarded" and an Undo that reopens it with
 * the edits (D-039). Left while its save is out, it only closes: the save goes on, so nothing is discarded.
 */
export function DayEditor({
  isOpen,
  day,
  exercises,
  resume,
  onClose,
  onReopen,
}: {
  isOpen: boolean;
  day: SplitDay;
  exercises: LibraryExercise[];
  resume?: DiscardedEdit;
  onClose: () => void;
  onReopen: (edit: DiscardedEdit) => void;
}) {
  const { showToast } = useToast();
  const warn = (message: string) => showToast({ message, type: "warning" });
  const [draft, setDraft] = useState<DayDraft>(() => resume?.draft ?? toDraft(day));
  const [created, setCreated] = useState<LibraryExercise[]>(() => resume?.created ?? []);
  const [errorMsg, setErrorMsg] = useState("");
  const [addId, setAddId] = useState("");
  const [query, setQuery] = useState("");
  // `at`, not `from`: the day's save sends no compare-and-set `from` (D-043), and the static check reads this code with it.
  const move = (at: number, to: number) =>
    setDraft((d) => {
      const list = [...d.exercises];
      list.splice(to, 0, ...list.splice(at, 1));
      return { ...d, exercises: list };
    });
  const dragRow = useDragSort(move);
  const known = [...exercises, ...created.filter((c) => !exercises.some((e) => e.id === c.id))];
  // The names as the editor opened: a row whose exercise is deleted elsewhere keeps the name the user knows.
  const names = () => new Map([...day.exercises.map((e) => [e.exerciseId, e.exerciseName] as const), ...exercises.map((e) => [e.id, e.name] as const)]);
  const [seen, setSeen] = useState(names);
  const nameOf = (id: string) => known.find((e) => e.id === id)?.name ?? seen.get(id) ?? "Exercise";

  // New exercise form
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroupKey | "other">("chest");
  const [customEquipment, setCustomEquipment] = useState<"barbell" | "dumbbell" | "cable" | "machine" | "bodyweight">("barbell");
  // "Create and add" acts once per tap burst (D-043); the tapped button is set before its own handler runs.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);
  // The new exercise's id, made when its form opens and kept until that opening closes (D-040, D-047): Create and add
  // sent again after a lost answer is the same exercise, and the name check skips it, as the refresh already lists it.
  const customId = useRef("");
  // While "Create and add" is out, its fields wait and the day's Save waits for the exercise it adds (D-047: a flag that
  // disables and labels, never the guard). It belongs to one opening: a new opening starts without it.
  const [creating, setCreating] = useState(false);
  // The day as this opening found it saved: what its Save's Undo writes back and its edits are compared with. A save
  // that succeeded is the day as saved until the refresh brings it (`saved`).
  const [base, setBase] = useState<DayDraft | null>(null);
  const saved = base ?? toDraft(day);
  // Each new opening starts from the day as saved, or from `resume`; one opened again while its save is out shows the
  // day it sent.
  function start(sent?: DayDraft, done?: boolean) {
    setBase(done && sent ? sent : null);
    setDraft(resume?.draft ?? sent ?? toDraft(day));
    setCreated(resume?.created ?? []);
    setSeen(names());
    setErrorMsg("");
    setCreating(false);
    setAddId("");
    setQuery("");
    setShowCustom(false);
    setCustomName("");
    setCustomMuscle("chest");
    setCustomEquipment("barbell");
  }
  function openCustom() {
    customId.current = crypto.randomUUID();
    setShowCustom(true);
  }

  // Escape, a click outside or the close button, with no save out: the edits can come back with Undo.
  function discarded() {
    if (JSON.stringify(draft) === JSON.stringify(saved)) return;
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

  function addRow(id: string) {
    setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId: id, ...NEW_ROW }] }));
    setAddId("");
  }

  async function save(e: React.FormEvent, { stillOpen, saved: succeeded }: FormOpening) {
    e.preventDefault();
    const rows = toRows(draft);
    const problem = dayProblem(draft.name, rows, nameOf);
    if (problem) {
      setErrorMsg(problem);
      return;
    }
    setErrorMsg("");
    // A refusal shows in the editor while it is on screen, else as a toast.
    const refused = refusal(stillOpen, setErrorMsg, warn);
    const before = saved;
    const res = await saveSplitDayAction({ id: draft.id, name: draft.name, isRest: draft.isRest, exercises: draft.isRest ? [] : rows }).catch(() => null);
    // The editor stays open with the day as it was typed, so nothing is lost.
    if (!res?.success) return refused(res?.error ?? "Failed to save day");
    succeeded();
    if (stillOpen()) onClose();
    showToast({
      message: `Saved "${draft.name.trim()}"`,
      type: "success",
      // The day's row and its routine rows.
      touches: [`workout_split_days:${day.id}`],
      // Writes back the day as this opening found it saved; the server refresh brings it to the list.
      onUndo: undoWith(
        showToast,
        () => saveSplitDayAction({ id: before.id, name: before.name, isRest: before.isRest, exercises: before.isRest ? [] : toRows(before) }),
        (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
      ),
    });
  }

  // The answer changes the draft, the new exercise's form and the error only in the opening it was sent from (D-047): after
  // that opening closed, a refusal shows as a toast and a new exercise stays in the library with its toast and Undo.
  async function addCustomExercise(stillOpen: () => boolean) {
    const name = customName.trim();
    if (!visible(name)) return;
    const problem = exerciseNameProblem(name, known.filter((e) => e.id !== customId.current));
    if (problem) {
      setErrorMsg(problem);
      return;
    }
    setErrorMsg("");
    setCreating(true);
    const refused = refusal(stillOpen, setErrorMsg, warn);
    const res = await addCustomExerciseAction({ id: customId.current, name, muscleGroup: customMuscle, equipmentType: customEquipment }).catch(() => null);
    if (stillOpen()) setCreating(false);
    if (!res?.success) return refused(res?.error ?? "Failed to add exercise");
    // A new exercise is made for this day, so it goes straight into the routine. A repeat answers the row the first
    // add made, so the screen takes the server's row.
    const { id: exerciseId, name: madeName, muscleGroup, equipmentType } = res.exercise;
    const added = stillOpen();
    if (added) {
      setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId, ...NEW_ROW }] }));
      setCreated((list) => [...list, { id: exerciseId, name: madeName, muscleGroup, equipmentType }]);
      setShowCustom(false);
      setCustomName("");
    }
    showToast({
      message: `Created "${madeName}"`,
      type: "success",
      touches: [`exercises:${exerciseId}`],
      // Refused once a routine or a set uses it, so Undo never deletes data. It takes the row out of the draft it went into.
      onUndo: undoWith(
        showToast,
        async () => {
          const gone = await deleteCustomExerciseAction(exerciseId).catch(() => null);
          if (gone?.success && added) {
            setDraft((d) => ({ ...d, exercises: d.exercises.filter((x) => x.exerciseId !== exerciseId) }));
            setCreated((list) => list.filter((x) => x.id !== exerciseId));
          }
          return gone;
        },
        (back) => (back && !back.success ? back.error : "Failed to undo: the exercise is already in use"),
      ),
    });
  }

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onDiscard={(how) => (how === "cancel" ? void cancel() : discarded())}
      keepsOpening
      snapshot={() => draft}
      data={day}
      onOpen={start}
      title={`Edit ${DAY_NAMES[draft.dayOfWeek]}`}
      onSubmit={save}
      error={errorMsg}
      canSubmit={!creating && visible(draft.name) && (draft.isRest || draft.exercises.every((x) => x.targetSets && x.minReps && x.maxReps))}
    >
      {({ stillOpen }) => (
        <>
          <Field
            label="Name"
            type="text"
            required
            maxLength={GYM_LIMITS.dayName}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Toggle label="Rest day" checked={draft.isRest} onChange={(e) => setDraft({ ...draft, isRest: e.target.checked })} />

          {!draft.isRest && (
            <>
              <ListBox className="routine-list">
                {draft.exercises.length === 0 && <EmptyNote>No exercises yet.</EmptyNote>}
                {draft.exercises.map((row, i) => {
                  const name = nameOf(row.exerciseId);
                  return (
                    <div key={row.exerciseId} className="routine-row" data-sort>
                      <DragHandle
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

              {draft.exercises.length < 20 && (
                <ExercisePicker exercises={exercises} routine={draft.exercises} query={query} onQuery={setQuery} addId={addId} onPick={setAddId} onAdd={addRow} />
              )}

              {draft.exercises.length < 20 &&
                (showCustom ? (
                  <div className="custom-exercise" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                    <Field
                      label="New exercise"
                      disabled={creating}
                      type="text"
                      maxLength={GYM_LIMITS.exerciseName}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter creates the exercise instead of submitting the whole day.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          once(`create:${customId.current}`, () => addCustomExercise(stillOpen), null);
                        }
                      }}
                    />
                    <FieldPair>
                      <SelectField
                        label="Muscle group"
                        disabled={creating}
                        value={customMuscle}
                        onChange={(e) => setCustomMuscle(e.target.value as MuscleGroupKey | "other")}
                        options={[...MUSCLE_GROUP_KEYS.map((g) => ({ value: g, label: MUSCLE_GROUP_LABEL[g] })), { value: "other", label: "Other" }]}
                      />
                      <SelectField
                        label="Equipment"
                        disabled={creating}
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
                      onSubmit={() => once(`create:${customId.current}`, () => addCustomExercise(stillOpen), tappedButton.current)}
                      canSubmit={!creating && visible(customName)}
                      submitLabel="Create and add"
                    />
                  </div>
                ) : (
                  <button type="button" className="secondary btn-sm custom-exercise-btn" onClick={openCustom}>
                    <PlusIcon size={14} />
                    New exercise
                  </button>
                ))}
            </>
          )}
        </>
      )}
    </FormModal>
  );
}

/**
 * The day editor's picker: a search and the library's exercises not in the routine, by muscle group, to add one. Its
 * lists are built only while it is on screen (the editor stays mounted while closed, D-047). Nothing when every
 * exercise is in the routine.
 */
function ExercisePicker({
  exercises,
  routine,
  query,
  onQuery,
  addId,
  onPick,
  onAdd,
}: {
  exercises: LibraryExercise[];
  routine: DraftExercise[];
  query: string;
  onQuery: (query: string) => void;
  addId: string;
  onPick: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  const addable = exercises.filter((e) => !routine.some((d) => d.exerciseId === e.id));
  // The search matches the way names are compared: spaces, case and a trailing "." do not matter.
  const found = addable.filter((e) => exerciseNameKey(e.name).includes(exerciseNameKey(query)));
  const groups = [...new Set(found.map((e) => e.muscleGroup))];
  const pick = found.some((e) => e.id === addId) ? addId : (found[0]?.id ?? "");
  if (addable.length === 0) return null;
  return (
    <div className="routine-add">
      <Field
        label="Search exercises"
        type="text"
        enterKeyHint="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
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
            <select value={pick} onChange={(e) => onPick(e.target.value)}>
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
          <button type="button" className="secondary btn-sm" onClick={() => onAdd(pick)}>
            <PlusIcon size={14} />
            Add exercise
          </button>
        </>
      )}
    </div>
  );
}
