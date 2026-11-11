"use client";

import { LineChart } from "../components/charts";
import { FormEvent, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { ListBox, useMore } from "../components/lists";
import { DatePicker } from "../components/date-picker";
import { Segmented } from "../components/segmented";
import { signedKg, weightStats } from "@/lib/weight-stats";

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

  const { showToast } = useToast();

  const replace = (to: WeightEntry) => setEntries((current) => current.map((e) => (e.id === to.id ? to : e)));

  useEffect(() => {
    let active = true;
    fetch("/api/weight", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return (await response.json()) as { entries: WeightEntry[] };
      })
      .then((data) => active && setEntries(data.entries))
      .catch(() => active && showToast({ message: "Failed to load weigh-ins", type: "warning" }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [showToast]);

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
            ? "Please pick a date that has no weigh-in yet."
            : response.status === 400
              ? "Please enter a valid date and weight."
              : "Failed to save weigh-in",
        );
        return;
      }
      const { entry } = (await response.json()) as { entry: WeightEntry };
      const previous = editing;
      closeForm();
      if (previous) replace(entry);
      else setEntries((current) => [...current, entry]);
      if (!previous) {
        showToast({
          message: `Added ${numericKg} kg (${formatDMY(date)})`,
          type: "success",
          actionLabel: "Undo",
          onAction: async () => {
            setEntries((current) => current.filter((e) => e.id !== entry.id));
            const gone = await send("DELETE", `/api/weight/${entry.id}`).catch(() => null);
            if (!gone?.ok) {
              putBack(entry);
              showToast({ message: "Failed to undo", type: "warning" });
            }
          },
        });
        return;
      }
      showToast({
        message: `Saved ${numericKg} kg (${formatDMY(date)})`,
        type: "success",
        actionLabel: "Undo",
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onAction: async () => {
          replace(previous);
          const back = await send("PATCH", `/api/weight/${entry.id}`, {
            date: previous.date,
            kilograms: Number(previous.kilograms),
          }).catch(() => null);
          if (!back?.ok) {
            replace(entry);
            showToast({ message: "Failed to undo the edit", type: "warning" });
          }
        },
      });
    } catch {
      setError("Failed to save weigh-in");
    } finally {
      setSaving(false);
    }
  }

  const putBack = (entry: WeightEntry) =>
    setEntries((current) => (current.some((e) => e.id === entry.id) ? current : [...current, entry]));

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function removeEntry(target: WeightEntry) {
    setEntries((current) => current.filter((e) => e.id !== target.id));
    const deleted = send("DELETE", `/api/weight/${target.id}`).then(
      (res) => res.ok,
      () => false,
    );
    showToast({
      message: `Removed ${Number(target.kilograms)} kg (${formatDMY(target.date)})`,
      actionLabel: "Undo",
      // A new id, so the row is put back as the server returns it.
      onAction: async () => {
        if (!(await deleted)) return putBack(target); // the delete never happened
        const back = await send("POST", "/api/weight", { date: target.date, kilograms: Number(target.kilograms) }).catch(() => null);
        if (!back?.ok) return showToast({ message: "Failed to restore weigh-in", type: "warning" });
        putBack(((await back.json()) as { entry: WeightEntry }).entry);
      },
    });
    void deleted.then((ok) => {
      if (ok) return;
      putBack(target);
      showToast({ message: "Failed to remove weigh-in", type: "warning" });
    });
  }

  const sorted = sortNewestFirst(entries);
  const [shown, more] = useMore(sorted);
  const stats = weightStats(
    entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })),
    today(),
  );
  const tile = (value: number | null) =>
    value === null ? "—" : <>{twoDecimals(value)} <span className="macro-target">kg</span></>;

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
                History {!loading && <span className="muted number-tabular">{entries.length}</span>}
              </h2>
              <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                <PlusIcon size={14} />
                Add weigh-in
              </button>
            </div>

            {loading ? (
              <div className="entries">
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            ) : (
              <ListBox wash className="entries">
                {entries.length === 0 && (
                  <p className="empty-note">
                    No weigh-ins yet.
                  </p>
                )}
                {shown.map((entry) => (
                  <div className="entry-row" key={entry.id}>
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
                {more}
              </ListBox>
            )}
          </section>
        </div>

        <div className="dashboard-aside summary-first">
          <section className="surface" aria-labelledby="trend-title">
            <div className="section-head">
              <h2 id="trend-title" className="section-title">
                Trend
              </h2>
              {stats.sinceLastWeek !== null && (
                <span className="badge badge-rest number-tabular">{signedKg(stats.sinceLastWeek)} since last week</span>
              )}
            </div>
            <div className="stat-row">
              <div className="stat-tile">
                <strong className="number-tabular">{tile(stats.sevenDayAverage)}</strong>
                <span>7-day average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">{tile(stats.weekStartWeight)}</strong>
                <span>Week start</span>
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

      <Modal
        isOpen={isModalOpen}
        onClose={closeForm}
        title={editing ? "Edit weigh-in" : "New weigh-in"}
      >
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
                labelledBy="weigh-date"
                disabled={saving}
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
                disabled={saving}
                value={kilograms}
                onChange={(e) => setKilograms(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !kilograms}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
