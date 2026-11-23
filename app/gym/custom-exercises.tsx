"use client";

import { useRef, useState } from "react";
import { visible } from "@/lib/validations/common";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL } from "@/lib/gym-muscles";
import { Card, EmptyNote, Field, FieldPair, FormModal, SelectField, type FormOpening } from "../components/blocks";
import { ListBox, RowActions } from "../components/lists";
import { useOnce } from "../components/once";
import { undoWith, useToast } from "../components/toast";
import { deleteCustomExerciseAction, restoreCustomExerciseAction, updateCustomExerciseAction } from "@/actions/gym";
import { GYM_LIMITS } from "@/lib/validations/gym";
import { MuscleTag } from "./muscle-tag";

export interface CustomExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipmentType: string;
}

const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The user's own exercises: rename or re-file one, or delete it while no routine or workout uses it. Both have an Undo. */
export function CustomExercises({ exercises, fold }: { exercises: CustomExercise[]; fold: { folded: boolean; onToggle: () => void } }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState<CustomExercise | null>(null);
  const [form, setForm] = useState({ name: "", muscleGroup: "chest", equipmentType: "barbell" });
  const [errorMsg, setErrorMsg] = useState("");
  // A deleted row leaves at once; the refreshed page then no longer holds it.
  const [gone, setGone] = useState<string[]>([]);
  const shown = exercises.filter((e) => !gone.includes(e.id));
  // A Delete acts once per tap burst (D-043), locked per exercise, as in the categories card; Save gets the same from FormModal.
  const once = useOnce();
  // The button last tapped in a row, set before its own handler runs.
  const tappedButton = useRef<Element | null>(null);
  const touches = (id: string) => [`exercises:${id}`];

  // A new opening starts from the exercise as listed; the save's opening, shown again, from what it sent.
  function start(sent?: typeof form) {
    if (!editing) return;
    setForm(sent ?? { name: editing.name, muscleGroup: editing.muscleGroup, equipmentType: editing.equipmentType });
    setErrorMsg("");
  }

  async function save(e: React.FormEvent, { stillOpen }: FormOpening) {
    e.preventDefault();
    if (!editing) return;
    const before = editing;
    const name = form.name.trim();
    setErrorMsg("");
    // A refusal shows in the form while it is on screen, else as a toast.
    const refused = (message: string) => (stillOpen() ? setErrorMsg(message) : showToast({ message, type: "warning" }));
    try {
      const res = await updateCustomExerciseAction({ id: before.id, ...form, name });
      if (!res.success) return refused(res.error);
      if (stillOpen()) setEditing(null);
      showToast({
        message: `Saved "${name}"`,
        type: "success",
        touches: touches(before.id),
        // Refused, with the reason, when another exercise has taken the old name since.
        onUndo: undoWith(showToast, () => updateCustomExerciseAction({ ...before }), (back) => (back && !back.success ? back.error : "Failed to undo the edit")),
      });
    } catch {
      refused("Failed to save exercise");
    }
  }

  // The row leaves and the toast shows at once (D-047); a refused delete, or one with no answer, puts the row back, takes
  // the toast away and says why.
  function remove(e: CustomExercise) {
    setGone((g) => [...g, e.id]);
    const saved = deleteCustomExerciseAction(e.id).catch(() => null);
    void saved.then((res) => {
      if (res?.success) return;
      setGone((g) => g.filter((id) => id !== e.id));
      showToast({ message: res ? res.error : `Failed to delete "${e.name}"`, type: "warning" });
    });
    showToast({
      message: `Removed "${e.name}"`,
      touches: touches(e.id),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)?.success) return true; // the delete never happened; the failure above said why
          const back = await restoreCustomExerciseAction(e).catch(() => null);
          if (back?.success) setGone((g) => g.filter((id) => id !== e.id));
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore exercise"),
      ),
    });
    return saved;
  }

  return (
    <>
      <Card id="custom-exercises-title" title="My exercises" count={shown.length} fold={fold}>
        <ListBox wash className="entries">
          {shown.length === 0 && <EmptyNote>No custom exercises yet.</EmptyNote>}
          {shown.map((e) => (
            <div key={e.id} className="entry-row" onClickCapture={(ev) => (tappedButton.current = (ev.target as Element).closest("button"))}>
              <div className="entry-main entry-stack">
                <strong>{e.name}</strong>
                <MuscleTag group={e.muscleGroup} />
                <span className="muted entry-detail">{cap(e.equipmentType)}</span>
              </div>
              <RowActions onEdit={() => setEditing(e)} onDelete={() => once(e.id, () => remove(e), tappedButton.current)} editLabel={`Edit ${e.name}`} deleteLabel={`Delete ${e.name}`} />
            </div>
          ))}
        </ListBox>
      </Card>

      {/* The save sends the whole form, so the form keeps its opening while it is out (D-047): opened again for the same
          exercise before the answer, also after another one, it waits for that save with what it sent, as a fresh opening
          would show the exercise from before it and its Save would undo it. Opened for another exercise, it is a fresh opening. */}
      <FormModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Edit exercise"
        onSubmit={save}
        error={errorMsg}
        keepsOpening
        subject={editing?.id}
        snapshot={() => form}
        onOpen={start}
        canSubmit={visible(form.name)}
      >
        <Field label="Name" type="text" required maxLength={GYM_LIMITS.exerciseName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <FieldPair>
          <SelectField
            label="Muscle group"
            value={form.muscleGroup}
            onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}
            options={[...MUSCLE_GROUP_KEYS.map((g) => ({ value: g, label: MUSCLE_GROUP_LABEL[g] })), { value: "other", label: "Other" }]}
          />
          <SelectField
            label="Equipment"
            value={form.equipmentType}
            onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}
            options={EQUIPMENT.map((q) => ({ value: q, label: cap(q) }))}
          />
        </FieldPair>
      </FormModal>
    </>
  );
}
