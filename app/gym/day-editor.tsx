"use client";

import { visible } from "@/lib/validations/common";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL, muscleLabel, type MuscleGroupKey } from "@/lib/gym-muscles";
import { useState } from "react";
import { DeleteButton, DragHandle, ListBox, useDragSort } from "../components/lists";
import { EmptyNote, Field, FieldPair, FormActions, FormModal, Label, SelectField, Toggle } from "../components/blocks";
import { PlusIcon } from "../components/icons";
import { undoWith, useToast } from "../components/toast";
import { DAY_NAMES, type DayDraft, type DraftExercise, type LibraryExercise, type SplitDay } from "./types";
import { addCustomExerciseAction, deleteCustomExerciseAction, saveSplitDayAction } from "@/actions/gym";

const NEW_ROW = { targetSets: "2", minReps: "5", maxReps: "8" };

/** The days' routine as the server stores it: whole numbers, none for a rest day. */
const toRows = (day: Pick<SplitDay, "isRest" | "exercises">) =>
  day.isRest ? [] : day.exercises.map((x) => ({ exerciseId: x.exerciseId, targetSets: x.targetSets, minReps: x.minReps, maxReps: x.maxReps }));

/** The dialog that edits one training day: its name, whether it is a rest day, and its routine (add, remove, drag to reorder, new exercise). Mounted only while open, so each opening starts fresh. */
export function DayEditor({
  day,
  exercises,
  busy,
  setBusy,
  onClose,
}: {
  day: SplitDay;
  exercises: LibraryExercise[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<DayDraft>(() => ({
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
  }));
  const [errorMsg, setErrorMsg] = useState("");
  const [addId, setAddId] = useState("");
  const dragRow = useDragSort((from, to) =>
    setDraft((d) => {
      const list = [...d.exercises];
      list.splice(to, 0, ...list.splice(from, 1));
      return { ...d, exercises: list };
    }),
  );
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? "Exercise";
  const addable = exercises.filter((e) => !draft.exercises.some((d) => d.exerciseId === e.id));
  const groups = [...new Set(addable.map((e) => e.muscleGroup))];

  // New exercise form
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState<MuscleGroupKey | "other">("chest");
  const [customEquipment, setCustomEquipment] = useState<"barbell" | "dumbbell" | "cable" | "machine" | "bodyweight">("barbell");

  function patchRow(i: number, patch: Partial<DraftExercise>) {
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  }

  function removeRow(id: string) {
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((e) => e.exerciseId !== id) }));
  }

  function addRow() {
    const id = addId || addable[0]?.id;
    if (!id) return;
    setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId: id, ...NEW_ROW }] }));
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
    // Same limits as saveSplitDaySchema: sets 1-10, reps 1-100, whole numbers.
    const whole = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
    const wrong = rows.find((r) => !whole(r.targetSets, 10) || !whole(r.minReps, 100) || !whole(r.maxReps, 100));
    if (wrong) {
      setErrorMsg(`Please enter sets from 1 to 10 and reps from 1 to 100 for ${nameOf(wrong.exerciseId)}.`);
      return;
    }
    const bad = rows.find((r) => r.minReps > r.maxReps);
    if (bad) {
      setErrorMsg(`Please keep min reps at or below max reps for ${nameOf(bad.exerciseId)}.`);
      return;
    }
    if (!visible(draft.name)) {
      setErrorMsg("Please enter a name for the day.");
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
          // Writes the old day back; the server refresh brings it to the list.
          onUndo: undoWith(showToast, () => saveSplitDayAction({ id: day.id, name: day.name, isRest: day.isRest, exercises: toRows(day) }), "Failed to undo the edit"),
        });
      } else {
        setErrorMsg("Failed to save day");
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
    if (name.length < 2) {
      setErrorMsg("The name must have at least 2 characters.");
      return;
    }
    if (exercises.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) {
      setErrorMsg(`"${name}" already exists.`);
      return;
    }
    setErrorMsg("");
    setBusy(true);
    try {
      const res = await addCustomExerciseAction({ name, muscleGroup: customMuscle, equipmentType: customEquipment });
      if (res.success) {
        // A new exercise is made for this day, so it goes straight into the routine.
        const exerciseId = res.exercise.id;
        setDraft((d) => ({ ...d, exercises: [...d.exercises, { exerciseId, ...NEW_ROW }] }));
        setShowCustom(false);
        setCustomName("");
        showToast({
          message: `Created "${name}"`,
          type: "success",
          // Refused once a routine or a set uses it, so Undo never deletes data.
          onUndo: undoWith(
            showToast,
            async () => {
              const gone = await deleteCustomExerciseAction(exerciseId).catch(() => null);
              if (gone?.success) setDraft((d) => ({ ...d, exercises: d.exercises.filter((x) => x.exerciseId !== exerciseId) }));
              return gone;
            },
            "Failed to undo: the exercise is already in use",
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
      onClose={onClose}
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
                      void addCustomExercise();
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
                  onSubmit={addCustomExercise}
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
