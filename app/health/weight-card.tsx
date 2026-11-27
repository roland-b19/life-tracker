"use client";

import { FormEvent, useRef, useState } from "react";
import { BigNumber, Card, Field, FormModal, type FormOpening } from "../components/blocks";
import { refusal } from "../components/forms";
import { EditButton, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/actions/food";
import { sevenDayAverage } from "@/lib/weight-stats";
import { formatAmount } from "@/lib/number-format";
import { WEIGHT_ENTRY_GONE } from "@/lib/validations/food";
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
  const warn = (message: string) => showToast({ message, type: "warning" });
  // A Delete acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);
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
    setOpen(true);
  }

  /** The weigh-in leaves the screen at once; Undo restores it under its old id, so the same row comes back. */
  function handleDelete(entry: WeightEntry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const saved = deleteWeightAction(entry.id).catch(() => null);
    // A weigh-in another device already deleted stays off the screen; any other refusal, or no answer, puts it back.
    // Either way the server's reason shows and the toast goes with its Undo.
    void saved.then((res) => {
      if (res?.success) return;
      if (res?.error !== WEIGHT_ENTRY_GONE) upsert(entry);
      showToast({ message: res?.error ?? "Failed to remove weight", type: "warning" });
    });
    showToast({
      message: `Removed ${kg(entry.kilograms)} kg`,
      type: "success",
      touches: touches(entry),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          const back = await restoreWeightAction({ id: entry.id, date: entry.date, kilograms: Number(entry.kilograms) }).catch(() => null);
          if (back?.success) upsert(entry);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore weight"),
      ),
    });
    return saved;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>, { id, stillOpen }: FormOpening) {
    event.preventDefault();
    setErrorMsg("");
    // A refusal shows in the form while it is on screen, else as a toast.
    const refused = refusal(stillOpen, setErrorMsg, warn);
    const value = Number(kilograms);
    // This opening's weigh-in: the form opened again meanwhile has its own.
    const shown = opened.current;
    // The screen can be behind the database (another device): the server creates the day or changes the row it already
    // has. The id is the form opening's, so a repeat of the same add after a lost answer adds nothing (D-040) and says it
    // was already saved, without an Undo.
    const res = await saveWeightAction({ id, date: today, kilograms: value }).catch(() => null);
    if (!res?.success) return refused(res?.error ?? "Failed to save weight");
    const { entry, previous, repeated } = res;
    if (stillOpen()) setOpen(false);
    upsert(entry);
    if (repeated) return showToast({ message: "Already saved", type: "success", touches: touches(entry) });
    if (!previous) {
      showToast({
        message: `Added ${kg(value)} kg`,
        type: "success",
        touches: touches(entry),
        onUndo: undoWith(showToast, async () => {
          setEntries((list) => list.filter((e) => e.id !== entry.id));
          const gone = await deleteWeightAction(entry.id).catch(() => null);
          // A weigh-in already deleted on another device stays off the screen; any other refusal puts it back.
          if (!gone?.success && gone?.error !== WEIGHT_ENTRY_GONE) upsert(entry);
          return gone;
        }, (back) => (back && !back.success ? back.error : "Failed to undo")),
      });
      return;
    }
    const before = shown?.date === previous.date ? shown : previous;
    showToast({
      message: `Weight set to ${kg(value)} kg`,
      type: "success",
      touches: touches(entry),
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
