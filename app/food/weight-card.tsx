"use client";

import { FormEvent, useState } from "react";
import { BigNumber, Card, Field, FormModal } from "../components/blocks";
import { ScaleIcon } from "../components/icons";
import { EditButton } from "../components/lists";
import { useToast } from "../components/toast";
import { weightStats } from "@/lib/weight-stats";
import { TrendChart } from "./trend-chart";

export type WeightEntry = { id: string; date: string; kilograms: string };

const twoDecimals = (n: number) => Math.round(n * 100) / 100;

async function send(method: string, url: string, body?: unknown) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

/** Health's weight: today's weigh-in, the 7-day average and the chart in one card. The chart shows up to a year; every weigh-in is kept. */
export function WeightCard({ today, initial }: { today: string; initial: WeightEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [open, setOpen] = useState(false);
  const [kilograms, setKilograms] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const current = entries.find((e) => e.date === today) ?? null;
  const stats = weightStats(entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })), today);
  const replace = (to: WeightEntry) => setEntries((list) => list.map((e) => (e.id === to.id ? to : e)));

  function openForm() {
    setError("");
    setKilograms(current?.kilograms ?? "");
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    const kg = Number(kilograms);
    setSaving(true);
    try {
      const response = current
        ? await send("PATCH", `/api/weight/${current.id}`, { date: today, kilograms: kg })
        : await send("POST", "/api/weight", { date: today, kilograms: kg });
      if (!response.ok) {
        setError(response.status === 400 ? "Please enter a valid weight." : "Failed to save weight");
        return;
      }
      const { entry } = (await response.json()) as { entry: WeightEntry };
      const previous = current;
      setOpen(false);
      if (!previous) {
        setEntries((list) => [...list, entry]);
        showToast({
          message: `Added ${kg} kg`,
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
      replace(entry);
      showToast({
        message: `Weight set to ${kg} kg`,
        type: "success",
        // Writes the old value back; if that fails the edit stays, so the screen matches the database.
        onUndo: async () => {
          replace(previous);
          const back = await send("PATCH", `/api/weight/${entry.id}`, { date: previous.date, kilograms: Number(previous.kilograms) }).catch(() => null);
          if (!back?.ok) {
            replace(entry);
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
      <Card id="weight-title" title="Weight" icon={<ScaleIcon size={18} />} end={<EditButton label="Edit today's weight" onClick={openForm} />}>
        <BigNumber value={current ? twoDecimals(Number(current.kilograms)) : "—"} of="kg today" />
        <p className="muted metric-avg number-tabular">7-day average · {stats.sevenDayAverage === null ? "—" : `${stats.sevenDayAverage} kg`}</p>
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
