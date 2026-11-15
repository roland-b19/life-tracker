"use client";

import { FormEvent, useState } from "react";
import { BigNumber, Card, Field, FormModal } from "../components/blocks";
import { ScaleIcon } from "../components/icons";
import { EditButton, RowActions } from "../components/lists";
import { useToast } from "../components/toast";
import { showDecimal } from "@/lib/decimal-input";
import { toISODate } from "@/lib/format-date";
import { weightStats } from "@/lib/weight-stats";
import { TrendChart } from "./trend-chart";

export type WeightEntry = { id: string; date: string; kilograms: string };

const twoDecimals = (n: number) => Math.round(n * 100) / 100;

async function send(method: string, url: string, body?: unknown) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

/** Health's weight: today's weigh-in, the 7-day average and the chart in one card. The chart shows up to a year; every weigh-in is kept. */
export function WeightCard({ today: initialToday, initial }: { today: string; initial: WeightEntry[] }) {
  // The page may have been open since yesterday: opening the form reads the day again.
  const [today, setToday] = useState(initialToday);
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState(false);
  const [kilograms, setKilograms] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const current = entries.find((e) => e.date === today) ?? null;
  const stats = weightStats(entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })), today);
  const upsert = (to: WeightEntry) =>
    setEntries((list) => (list.some((e) => e.id === to.id) ? list.map((e) => (e.id === to.id ? to : e)) : [...list, to]));

  function openForm() {
    const day = toISODate();
    setToday(day);
    setError("");
    setKilograms(entries.find((e) => e.date === day)?.kilograms ?? "");
    setOpen(true);
  }

  /** The weigh-in leaves the screen at once; Undo posts it again under its old id, so the same row comes back. */
  async function handleDelete(entry: WeightEntry) {
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    const response = await send("DELETE", `/api/weight/${entry.id}`).catch(() => null);
    // A 404 means another device already deleted it: the screen is right as it is.
    if (!response || (!response.ok && response.status !== 404)) {
      upsert(entry);
      showToast({ message: "Failed to remove weight", type: "warning" });
      return;
    }
    const kg = showDecimal(String(twoDecimals(Number(entry.kilograms))));
    showToast({
      message: `Removed ${kg} kg`,
      type: "success",
      onUndo: async () => {
        const back = await send("POST", "/api/weight", { id: entry.id, date: entry.date, kilograms: Number(entry.kilograms) }).catch(() => null);
        if (back?.ok) upsert(entry);
        else showToast({ message: "Failed to restore weight", type: "warning" });
      },
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const kg = Number(kilograms);
    setSaving(true);
    try {
      let response = current
        ? await send("PATCH", `/api/weight/${current.id}`, { date: today, kilograms: kg })
        : await send("POST", "/api/weight", { date: today, kilograms: kg });
      // The screen can be behind the database (another device): a weigh-in deleted there is created again,
      // and one made there is found and changed instead of refused.
      if (current && response.status === 404) response = await send("POST", "/api/weight", { date: today, kilograms: kg });
      let existing: WeightEntry | undefined = current ?? undefined;
      if (!current && response.status === 409) {
        const list = await fetch("/api/weight").then((r) => (r.ok ? (r.json() as Promise<{ entries: WeightEntry[] }>) : null));
        existing = list?.entries.find((e) => e.date === today);
        if (existing) response = await send("PATCH", `/api/weight/${existing.id}`, { date: today, kilograms: kg });
      }
      if (!response.ok) {
        setError(response.status === 400 ? "Please enter a valid weight." : "Failed to save weight");
        return;
      }
      const { entry } = (await response.json()) as { entry: WeightEntry };
      // The row that held today before this save: none when the save created it.
      const previous = response.status === 201 ? null : (existing ?? null);
      if (current && response.status === 201) setEntries((list) => list.filter((e) => e.id !== current.id)); // its row is gone from the database
      setOpen(false);
      if (!previous) {
        upsert(entry);
        showToast({
          message: `Added ${showDecimal(String(kg))} kg`,
          type: "success",
          onUndo: async () => {
            setEntries((list) => list.filter((e) => e.id !== entry.id));
            const gone = await send("DELETE", `/api/weight/${entry.id}`).catch(() => null);
            if (!gone?.ok) {
              setEntries((list) => (list.some((e) => e.id === entry.id) ? list : [...list, entry]));
              showToast({ message: "Failed to undo", type: "warning" });
            }
          },
        });
        return;
      }
      upsert(entry);
      showToast({
        message: `Weight set to ${showDecimal(String(kg))} kg`,
        type: "success",
        // Writes the old value back; if that fails the edit stays, so the screen matches the database.
        onUndo: async () => {
          upsert(previous);
          const back = await send("PATCH", `/api/weight/${entry.id}`, { date: previous.date, kilograms: Number(previous.kilograms) }).catch(() => null);
          if (!back?.ok) {
            upsert(entry);
            showToast({ message: "Failed to undo the edit", type: "warning" });
          }
        },
      });
    } catch {
      setError("Failed to save weight");
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

      <FormModal isOpen={open} onClose={() => setOpen(false)} title="Edit weight" onSubmit={handleSubmit} error={error} busy={saving} canSubmit={!!kilograms}>
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
