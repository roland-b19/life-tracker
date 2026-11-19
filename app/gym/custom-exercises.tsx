"use client";

import { useState } from "react";
import { visible } from "@/lib/validations/common";
import { MUSCLE_GROUP_KEYS, MUSCLE_GROUP_LABEL } from "@/lib/gym-muscles";
import { Card, EmptyNote, Field, FieldPair, FormModal, SelectField } from "../components/blocks";
import { ListBox, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { deleteCustomExerciseAction, restoreCustomExerciseAction, updateCustomExerciseAction } from "@/actions/gym";
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
  const [busy, setBusy] = useState(false);
  // A deleted row leaves at once; the refreshed page then no longer holds it.
  const [gone, setGone] = useState<string[]>([]);
  const shown = exercises.filter((e) => !gone.includes(e.id));

  function open(e: CustomExercise) {
    setEditing(e);
    setForm({ name: e.name, muscleGroup: e.muscleGroup, equipmentType: e.equipmentType });
    setErrorMsg("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const before = editing;
    const name = form.name.trim();
    setErrorMsg("");
    setBusy(true);
    try {
      const res = await updateCustomExerciseAction({ id: before.id, ...form, name });
      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setEditing(null);
      showToast({
        message: `Saved "${name}"`,
        type: "success",
        onUndo: undoWith(showToast, () => updateCustomExerciseAction({ ...before }), "Failed to undo the edit"),
      });
    } catch {
      setErrorMsg("Failed to save exercise");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: CustomExercise) {
    setGone((g) => [...g, e.id]);
    const res = await deleteCustomExerciseAction(e.id).catch(() => null);
    if (!res?.success) {
      setGone((g) => g.filter((id) => id !== e.id));
      showToast({ message: res ? res.error : `Failed to delete "${e.name}"`, type: "warning" });
      return;
    }
    showToast({
      message: `Removed "${e.name}"`,
      onUndo: undoWith(
        showToast,
        async () => {
          const back = await restoreCustomExerciseAction(e).catch(() => null);
          if (back?.success) setGone((g) => g.filter((id) => id !== e.id));
          return back;
        },
        "Failed to restore exercise",
      ),
    });
  }

  return (
    <>
      <Card id="custom-exercises-title" title="My exercises" count={shown.length} fold={fold}>
        <ListBox wash className="entries">
          {shown.length === 0 && <EmptyNote>No custom exercises yet.</EmptyNote>}
          {shown.map((e) => (
            <div key={e.id} className="entry-row">
              <div className="entry-main entry-stack">
                <strong>{e.name}</strong>
                <MuscleTag group={e.muscleGroup} />
                <span className="muted entry-detail">{cap(e.equipmentType)}</span>
              </div>
              <RowActions onEdit={() => open(e)} onDelete={() => remove(e)} editLabel={`Edit ${e.name}`} deleteLabel={`Delete ${e.name}`} />
            </div>
          ))}
        </ListBox>
      </Card>

      <FormModal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit exercise" onSubmit={save} error={errorMsg} busy={busy} canSubmit={visible(form.name)}>
        <Field label="Name" type="text" required maxLength={100} disabled={busy} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <FieldPair>
          <SelectField
            label="Muscle group"
            disabled={busy}
            value={form.muscleGroup}
            onChange={(e) => setForm({ ...form, muscleGroup: e.target.value })}
            options={[...MUSCLE_GROUP_KEYS.map((g) => ({ value: g, label: MUSCLE_GROUP_LABEL[g] })), { value: "other", label: "Other" }]}
          />
          <SelectField
            label="Equipment"
            disabled={busy}
            value={form.equipmentType}
            onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}
            options={EQUIPMENT.map((q) => ({ value: q, label: cap(q) }))}
          />
        </FieldPair>
      </FormModal>
    </>
  );
}
