"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { formatDMY } from "@/lib/format-date";

type WeightEntry = { id: string; date: string; kilograms: string };

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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
    setEntries((current) => current.filter((e) => e.id !== target.id));
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

  return (
    <>
      <div className="dashboard-main">
        <section className="surface" aria-labelledby="trend-title">
          <div className="section-head">
            <h2 id="trend-title" className="section-title">
              7-Day Average
            </h2>
            {weeklyDelta !== null && (
              <span
                className="badge"
                style={{
                  background: weeklyDelta > 0 ? "rgba(143, 209, 158, 0.15)" : "rgba(239, 197, 111, 0.15)",
                  color: weeklyDelta > 0 ? "var(--success)" : "var(--warning)",
                  fontSize: "0.85rem",
                }}
              >
                {weeklyDelta > 0 ? "+" : ""}
                {weeklyDelta} kg/week
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.85rem",
            }}
          >
            <div className="macro-card">
              <span className="macro-title">Current 7-Day Average</span>
              <span className="macro-numbers number-tabular" style={{ fontSize: "1.85rem", color: "var(--tint)" }}>
                {sevenDayAvg !== null ? `${sevenDayAvg} ` : "— "}
                <span className="macro-target" style={{ fontSize: "1rem" }}>kg</span>
              </span>
            </div>

            <div className="macro-card">
              <span className="macro-title">Latest Recorded</span>
              <span className="macro-numbers number-tabular" style={{ fontSize: "1.85rem" }}>
                {sorted.length > 0 ? `${sorted[0].kilograms} ` : "— "}
                <span className="macro-target" style={{ fontSize: "1rem" }}>kg</span>
              </span>
            </div>
          </div>
        </section>

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

          <div className="entries">
            {loading && (
              <div style={{ display: "grid", gap: "0.6rem", padding: "0.5rem 0" }}>
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            )}

            {!loading && entries.length === 0 && <p className="empty-note">No weigh-ins yet.</p>}

            {!loading &&
              sorted.map((entry) => (
                <div className="entry-row" key={entry.id}>
                  <span style={{ fontWeight: 600 }}>{formatDMY(entry.date)}</span>
                  <div className="row-actions" style={{ marginLeft: "auto" }}>
                    <span className="entry-value number-tabular" style={{ fontSize: "1.1rem", marginRight: "0.5rem" }}>
                      {entry.kilograms}{" "}
                      <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>kg</span>
                    </span>
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
        </section>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeForm} title={editing ? "Edit weigh-in" : "New weigh-in"}>
        <form onSubmit={handleSubmit}>
          <div className="form-stack">
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              Weight (kg)
              <input
                type="number"
                inputMode="decimal"
                min="20"
                max="500"
                step="0.01"
                placeholder="e.g. 84.5"
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
