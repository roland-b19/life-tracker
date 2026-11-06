"use client";

import { LineChart } from "../components/charts";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { AnimatedNumber } from "../components/animated-number";
import { useListMotion } from "../components/list-motion";
import { DatePicker } from "../components/date-picker";
import { Segmented } from "../components/segmented";

type WeightEntry = { id: string; date: string; kilograms: string };

const today = () => toISODate();

type Range = "7" | "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = ["7", "30", "90", "180", "360"].map((d) => ({
  value: d as Range,
  label: `${d}D`,
}));

const twoDecimals = (n: number) => String(Math.round(n * 100) / 100);

const sortNewestFirst = (list: WeightEntry[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

async function send(method: string, url: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function WeightPanel() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const [date, setDate] = useState(today);
  const [kilograms, setKilograms] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [range, setRange] = useState<Range>("30");

  const { rowRef, leave } = useListMotion();
  const { showToast } = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/weight", { cache: "no-store" });
    if (!response.ok) throw new Error("load failed");
    const data = (await response.json()) as { entries: WeightEntry[] };
    setEntries(data.entries);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/weight", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return (await response.json()) as { entries: WeightEntry[] };
      })
      .then((data) => active && setEntries(data.entries))
      .catch(() => active && setError("Could not load weigh-ins."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function openForm(entry?: WeightEntry) {
    setError("");
    setEditing(entry ?? null);
    setDate(entry?.date ?? today());
    setKilograms(entry?.kilograms ?? "");
    setIsModalOpen(true);
  }

  const closeForm = () => setIsModalOpen(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const numericKg = Number(kilograms);
    setSaving(true);
    try {
      const response = editing
        ? await send("PATCH", `/api/weight/${editing.id}`, { date, kilograms: numericKg })
        : await send("POST", "/api/weight", { date, kilograms: numericKg });
      if (!response.ok) {
        setError(
          response.status === 409
            ? "There is already a weigh-in for this date."
            : "Check the date and weight.",
        );
        return;
      }
      const { entry } = (await response.json()) as { entry: WeightEntry };
      const previous = editing;
      closeForm();
      await load();
      showToast({
        message: previous ? "Weigh-in updated" : `Recorded ${numericKg} kg for ${formatDMY(date)}`,
        type: "success",
        actionLabel: "Undo",
        onAction: async () => {
          if (previous) {
            await send("PATCH", `/api/weight/${entry.id}`, {
              date: previous.date,
              kilograms: Number(previous.kilograms),
            });
          } else {
            await send("DELETE", `/api/weight/${entry.id}`);
          }
          await load();
        },
      });
    } catch {
      setError("Could not save the weigh-in.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(target: WeightEntry) {
    const response = await send("DELETE", `/api/weight/${target.id}`);
    if (!response.ok) {
      showToast({ message: "Could not delete weigh-in." });
      return;
    }
    leave(target.id, () => setEntries((current) => current.filter((e) => e.id !== target.id)));
    showToast({
      message: `Deleted weigh-in (${target.kilograms} kg)`,
      actionLabel: "Undo",
      onAction: async () => {
        await send("POST", "/api/weight", { date: target.date, kilograms: Number(target.kilograms) });
        await load();
      },
    });
  }

  // 7-day moving average and week-over-week delta, anchored on the latest entry
  const sorted = sortNewestFirst(entries);
  let sevenDayAvg: number | null = null;
  let weeklyDelta: number | null = null;

  if (sorted.length > 0) {
    const latestDate = new Date(sorted[0].date);
    const weekAgo = new Date(latestDate);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const twoWeeksAgo = new Date(latestDate);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 13);

    const currentWeek = sorted.filter((e) => {
      const d = new Date(e.date);
      return d >= weekAgo && d <= latestDate;
    });
    if (currentWeek.length > 0) {
      const sum = currentWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0);
      sevenDayAvg = Math.round((sum / currentWeek.length) * 100) / 100;
    }

    const prevWeek = sorted.filter((e) => {
      const d = new Date(e.date);
      return d >= twoWeeksAgo && d < weekAgo;
    });
    if (sevenDayAvg !== null && prevWeek.length > 0) {
      const prevAvg = prevWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0) / prevWeek.length;
      weeklyDelta = Math.round((sevenDayAvg - prevAvg) * 100) / 100;
    }
  }

  // The chart's window ends today, so an old last weigh-in shows an empty range rather than old data.
  const since = addDays(today(), 1 - Number(range));
  const inRange = sorted.filter((e) => e.date >= since);

  return (
    <>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="history-title">
            <div className="section-head">
              <h2 id="history-title" className="section-title">
                History
              </h2>
              <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                <PlusIcon size={14} />
                Add weigh-in
              </button>
            </div>

            {error && !isModalOpen && <p className="error">{error}</p>}

            {loading ? (
              <div className="entries">
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            ) : entries.length === 0 ? (
              <p className="empty-note">No weigh-ins yet.</p>
            ) : (
              <div className="entries">
                {sorted.map((entry) => (
                  <div className="entry-row" key={entry.id} ref={rowRef(entry.id)}>
                    <span className="weight-main">
                      <strong className="entry-value number-tabular">
                        {entry.kilograms} <span className="macro-target">kg</span>
                      </strong>
                      <span className="muted number-tabular">{formatDMY(entry.date)}</span>
                    </span>
                    <div className="row-actions">
                      <button
                        className="delete-icon-btn edit"
                        type="button"
                        onClick={() => openForm(entry)}
                        aria-label={`Edit weigh-in for ${formatDMY(entry.date)}`}
                        title="Edit"
                      >
                        <PencilIcon size={17} />
                      </button>
                      <button
                        className="delete-icon-btn"
                        type="button"
                        onClick={() => void removeEntry(entry)}
                        aria-label={`Delete weigh-in for ${formatDMY(entry.date)}`}
                        title="Delete"
                      >
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-labelledby="trend-title">
            <div className="section-head">
              <h2 id="trend-title" className="section-title">
                Trend
              </h2>
              {weeklyDelta !== null && (
                <span className={`badge ${weeklyDelta > 0 ? "badge-success" : "badge-warning"}`}>
                  {weeklyDelta > 0 ? "+" : ""}
                  {weeklyDelta} kg/week
                </span>
              )}
            </div>
            <div className="stat-row two">
              <div className="stat-tile">
                <strong className="number-tabular">
                  {sevenDayAvg !== null ? <AnimatedNumber value={sevenDayAvg} format={twoDecimals} /> : "—"}
                </strong>
                <span>7-day average, kg</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">{sorted.length > 0 ? sorted[0].kilograms : "—"}</strong>
                <span>Latest, kg</span>
              </div>
            </div>
            {sorted.length >= 2 && (
              <>
                <div className="chart-controls">
                  <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
                </div>
                <LineChart
                  points={inRange
                    .reverse()
                    .map((e) => ({ label: e.date.slice(5).split("-").reverse().join("."), value: Number(e.kilograms) }))}
                  summary={`Weight over the last ${range} days`}
                />
                {inRange.length < 2 && <p className="muted chart-note">Not enough weigh-ins in the last {range} days.</p>}
              </>
            )}
          </section>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeForm} title={editing ? "Edit weigh-in" : "New weigh-in"}>
        <form onSubmit={handleSubmit}>
          <div className="form-stack">
            {/* Not a <label>: a click inside the open calendar would re-trigger the button. */}
            <div className="field">
              <span id="weigh-date">Date</span>
              <DatePicker
                mode="day"
                className="date-field"
                value={date}
                today={today()}
                max={today()}
                label={formatDMY(date)}
                onChange={setDate}
              />
            </div>
            <label>
              Weight (kg)
              <input
                type="number"
                inputMode="decimal"
                min="20"
                max="500"
                step="0.01"
                value={kilograms}
                onChange={(e) => setKilograms(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="error" aria-live="polite">
                {error}
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !kilograms}>
              {editing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
