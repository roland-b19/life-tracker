"use client";

import { FormEvent, useRef, useState } from "react";
import { BigNumber, Card, Field, FormModal } from "../components/blocks";
import { EditButton, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/actions/food";
import { sevenDayAverage } from "@/lib/weight-stats";
import { formatAmount } from "@/lib/number-format";
import { TrendChart } from "./trend-chart";

export type WeightEntry = { id: string; date: string; kilograms: string };

const kg = (value: number | string) => formatAmount(value, 2);
const touches = (entry: WeightEntry) => [`weight_entries:${entry.id}`];

/**
 * Health's weight: today's weigh-in, the 7-day average and the chart in one card. The chart shows up to a year; every
 * weigh-in is kept. Only today's weigh-in is written (D-036); `today` is the server's day, so the card and the chart
 * move to the new day with the page's refresh at midnight.
 */
export function WeightCard({ today, initial }: { today: string; initial: WeightEntry[] }) {
  const [open, setOpen] = useState(false);
  // The weigh-in the open form edits (null when the form adds one): the form closes when another device deletes it.
  const [editing, setEditing] = useState<string | null>(null);
  const [entries, setEntries] = useServerState(initial, { editing: open ? editing : null, onDeleted: () => setOpen(false) });
  const current = entries.find((e) => e.date === today) ?? null;
  const [kilograms, setKilograms] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { showToast } = useToast();
  // A Delete acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);
  // The id a new day's weigh-in gets (D-040): made when the form opens and kept until the save is answered, so a second
  // Save after a lost answer sends the same id and the server answers the row the first one made.
  const addId = useRef("");
  // The weigh-in the form showed when it opened: an edit's Undo writes it back, even when a Save again after a lost
  // answer finds the day already at the new value (so the server's `previous` is that value).
  const opened = useRef<WeightEntry | null>(null);

  const average = sevenDayAverage(entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })), today);
  // A day has one weigh-in, so a row replaces the one on its day.
  const upsert = (to: WeightEntry) => setEntries((list) => [...list.filter((e) => e.date !== to.date), to]);

  function openForm() {
    setErrorMsg("");
    setKilograms(current?.kilograms ?? "");
    setEditing(current?.id ?? null);
    opened.current = current;
    addId.current = crypto.randomUUID();
    setOpen(true);
  }

  /** The weigh-in leaves the screen at once; Undo restores it under its old id, so the same row comes back. */
  function handleDelete(entry: WeightEntry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const saved = deleteWeightAction(entry.id).catch(() => null);
    void saved.then((gone) => {
      // `success: false` means another device already deleted it, so the screen is right as it is; only a thrown error needs the rollback.
      if (gone) return;
      upsert(entry);
      showToast({ message: "Failed to remove weight", type: "warning" });
    });
    showToast({
      message: `Removed ${kg(entry.kilograms)} kg`,
      type: "success",
      touches: touches(entry),
      saved: saved.then((gone) => gone !== null),
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)) return true; // the delete never happened
          const back = await restoreWeightAction({ id: entry.id, date: entry.date, kilograms: Number(entry.kilograms) }).catch(() => null);
          if (back?.success) upsert(entry);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore weight"),
      ),
    });
    return saved;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    const value = Number(kilograms);
    // The screen can be behind the database (another device): the server creates the day or changes the row it already
    // has. The id comes from the form (addId), so a repeat of the same add after a lost answer adds nothing (D-040) and
    // says it was already saved, without an Undo.
    const saved = saveWeightAction({ id: addId.current, date: today, kilograms: value }).catch(() => null);
    const res = await saved;
    if (!res?.success) return setErrorMsg(res?.error ?? "Failed to save weight");
    const { entry, previous, repeated } = res;
    setOpen(false);
    upsert(entry);
    if (repeated) return showToast({ message: "Already saved", type: "success", touches: touches(entry), saved });
    if (!previous) {
      showToast({
        message: `Added ${kg(value)} kg`,
        type: "success",
        touches: touches(entry),
        saved,
        onUndo: undoWith(showToast, async () => {
          setEntries((list) => list.filter((e) => e.id !== entry.id));
          const gone = await deleteWeightAction(entry.id).catch(() => null);
          if (!gone) upsert(entry); // `success: false` means it is already gone, so the screen is right without it
          return gone;
        }, (back) => (back && !back.success ? back.error : "Failed to undo")),
      });
      return;
    }
    const before = opened.current?.date === previous.date ? opened.current : previous;
    showToast({
      message: `Weight set to ${kg(value)} kg`,
      type: "success",
      touches: touches(entry),
      saved,
      // Writes the old value back; if that fails the edit stays, so the screen matches the database.
      onUndo: undoWith(
        showToast,
        async () => {
          upsert(before);
          // `from` is the value this edit saved: if another device changed or deleted the day since, the server refuses.
          const back = await saveWeightAction({ date: before.date, kilograms: Number(before.kilograms), from: Number(entry.kilograms) }).catch(() => null);
          if (back?.success) upsert(back.entry);
          else upsert(entry);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
      ),
    });
  }

  return (
    <>
      <Card id="weight-title" title="Weight" end={
          current ? (
            <span onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
              <RowActions
                onEdit={openForm}
                onDelete={() => once(`weight:${current.id}`, () => handleDelete(current), tappedButton.current)}
                editLabel="Edit today's weight"
                deleteLabel="Delete today's weight"
              />
            </span>
          ) : (
            <EditButton label="Edit today's weight" onClick={openForm} />
          )
        }>
        <BigNumber value={current ? kg(current.kilograms) : "—"} of="kg today" />
        <p className="muted metric-avg number-tabular">7-day average · {average === null ? "—" : `${kg(average)} kg`}</p>
        <TrendChart noun="Weight" days={[7, 30, 90, 180, 365]} today={today} entries={entries.map((e) => ({ date: e.date, value: Number(e.kilograms) }))} />
      </Card>

      <FormModal isOpen={open} onClose={() => setOpen(false)} title="Edit weight" onSubmit={handleSubmit} error={errorMsg} canSubmit={!!kilograms}>
        <Field
          label="Weight today (kg)"
          type="number"
          inputMode="decimal"
          value={kilograms}
          onChange={(e) => setKilograms(e.target.value)}
          required
        />
      </FormModal>
    </>
  );
}
