"use client";

import { FormEvent, useState } from "react";
import { BigNumber, Card, Field, FormModal } from "../components/blocks";
import { ScaleIcon } from "../components/icons";
import { EditButton, RowActions } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/app/actions/food";
import { showDecimal } from "@/lib/decimal-input";
import { toISODate } from "@/lib/format-date";
import { weightStats } from "@/lib/weight-stats";
import { TrendChart } from "./trend-chart";

export type WeightEntry = { id: string; date: string; kilograms: string };

const twoDecimals = (n: number) => Math.round(n * 100) / 100;

/** Health's weight: today's weigh-in, the 7-day average and the chart in one card. The chart shows up to a year; every weigh-in is kept. */
export function WeightCard({ today: initialToday, initial }: { today: string; initial: WeightEntry[] }) {
  // The page may have been open since yesterday: opening the form reads the day again.
  const [today, setToday] = useState(initialToday);
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState(false);
  const [kilograms, setKilograms] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const current = entries.find((e) => e.date === today) ?? null;
  const stats = weightStats(entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })), today);
  // A day has one weigh-in, so a row replaces the one on its day.
  const upsert = (to: WeightEntry) => setEntries((list) => [...list.filter((e) => e.date !== to.date), to]);

  function openForm() {
    const day = toISODate();
    setToday(day);
    setErrorMsg("");
    setKilograms(entries.find((e) => e.date === day)?.kilograms ?? "");
    setOpen(true);
  }

  /** The weigh-in leaves the screen at once; Undo restores it under its old id, so the same row comes back. */
  async function handleDelete(entry: WeightEntry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const gone = await deleteWeightAction(entry.id).catch(() => null);
    // `success: false` means another device already deleted it, so the screen is right as it is; only a thrown error needs the rollback.
    if (!gone) {
      upsert(entry);
      showToast({ message: "Failed to remove weight", type: "warning" });
      return;
    }
    const kg = showDecimal(String(twoDecimals(Number(entry.kilograms))));
    showToast({
      message: `Removed ${kg} kg`,
      type: "success",
      onUndo: undoWith(
        showToast,
        async () => {
          const back = await restoreWeightAction({ id: entry.id, date: entry.date, kilograms: Number(entry.kilograms) });
          if (back.success) upsert(entry);
          return back;
        },
        "Failed to restore weight",
      ),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setErrorMsg("");
    const kg = Number(kilograms);
    setSaving(true);
    try {
      // The screen can be behind the database (another device): the server creates the day or changes the row it already has.
      const saved = await saveWeightAction({ date: today, kilograms: kg });
      if (!saved.success) {
        setErrorMsg(saved.error);
        return;
      }
      const { entry, previous } = saved;
      setOpen(false);
      upsert(entry);
      if (!previous) {
        showToast({
          message: `Added ${showDecimal(String(kg))} kg`,
          type: "success",
          onUndo: undoWith(showToast, async () => {
            setEntries((list) => list.filter((e) => e.id !== entry.id));
            const gone = await deleteWeightAction(entry.id).catch(() => null);
            if (!gone) upsert(entry); // `success: false` means it is already gone, so the screen is right without it
            return gone;
          }),
        });
        return;
      }
      showToast({
        message: `Weight set to ${showDecimal(String(kg))} kg`,
        type: "success",
        // Writes the old value back; if that fails the edit stays, so the screen matches the database.
        onUndo: undoWith(
          showToast,
          async () => {
            upsert(previous);
            const back = await saveWeightAction({ date: previous.date, kilograms: Number(previous.kilograms) }).catch(() => null);
            // The saved row is the one the database has now: a new id if the day was deleted elsewhere in the meantime.
            if (back?.success) upsert(back.entry);
            else upsert(entry);
            return back;
          },
          "Failed to undo the edit",
        ),
      });
    } catch {
      setErrorMsg("Failed to save weight");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card id="weight-title" title="Weight" icon={<ScaleIcon size={18} />} end={
          current ? (
            <RowActions onEdit={openForm} onDelete={() => void handleDelete(current)} editLabel="Edit today's weight" deleteLabel="Delete today's weight" />
          ) : (
            <EditButton label="Edit today's weight" onClick={openForm} />
          )
        }>
        <BigNumber value={current ? showDecimal(String(twoDecimals(Number(current.kilograms)))) : "—"} of="kg today" />
        <p className="muted metric-avg number-tabular">7-day average · {stats.sevenDayAverage === null ? "—" : `${showDecimal(String(stats.sevenDayAverage))} kg`}</p>
        <TrendChart noun="Weight" days={[7, 30, 90, 180, 365]} entries={entries.map((e) => ({ date: e.date, value: Number(e.kilograms) }))} />
      </Card>

      <FormModal isOpen={open} onClose={() => setOpen(false)} title="Edit weight" onSubmit={handleSubmit} error={errorMsg} busy={saving} canSubmit={!!kilograms}>
        <Field
          label="Weight today (kg)"
          type="number"
          inputMode="decimal"
          min="20"
          max="500"
          step="0.01"
          disabled={saving}
          value={kilograms}
          onChange={(e) => setKilograms(e.target.value)}
          required
        />
      </FormModal>
    </>
  );
}
