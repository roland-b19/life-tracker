"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import { Navigation } from "./components/navigation";
import { PlusIcon, TrashIcon } from "./components/icons";
import { Modal } from "./components/modal";
import { useToast } from "./components/toast";
import { formatDMY } from "@/lib/format-date";

type WeightEntry = { id: string; date: string; kilograms: string };

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function WeightPage({ userName }: { userName: string }) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [date, setDate] = useState(today);
  const [kilograms, setKilograms] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { showToast } = useToast();

  const load = useCallback(async () => {
    const response = await fetch("/api/weight", { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load weigh-ins.");
      setBusy(false);
      return;
    }
    const data = (await response.json()) as { entries: WeightEntry[] };
    setEntries(data.entries);
    setBusy(false);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/weight", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return (await response.json()) as { entries: WeightEntry[] };
      })
      .then((data) => {
        if (active) {
          setEntries(data.entries);
          setBusy(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Could not load weigh-ins.");
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const numericKg = Number(kilograms);
    const response = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, kilograms: numericKg }),
    });
    if (!response.ok) {
      setError(
        response.status === 409
          ? "There is already a weigh-in for this date."
          : "Check the date and weight.",
      );
      return;
    }
    setKilograms("");
    setIsModalOpen(false);
    showToast({
      message: `Recorded ${numericKg} kg for ${date}`,
      type: "success",
    });
    await load();
  }

  async function removeEntry(id: string) {
    const target = entries.find((e) => e.id === id);
    if (!target) return;

    // Optimistic removal
    setEntries((current) => current.filter((entry) => entry.id !== id));

    const response = await fetch(`/api/weight/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    if (!response.ok) {
      // Revert if failed
      setEntries((current) => [...current, target].sort((a, b) => b.date.localeCompare(a.date)));
      showToast({ message: "Could not delete weigh-in." });
      return;
    }

    // Undo toast
    showToast({
      message: `Deleted weigh-in (${target.kilograms} kg)`,
      actionLabel: "Undo",
      onAction: async () => {
        await fetch("/api/weight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: target.date, kilograms: Number(target.kilograms) }),
        });
        await load();
      },
    });
  }

  // Calculate 7-day moving average and delta
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
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

    if (currentWeek.length > 0 && prevWeek.length > 0 && sevenDayAvg !== null) {
      const prevSum = prevWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0);
      const prevAvg = prevSum / prevWeek.length;
      weeklyDelta = Math.round((sevenDayAvg - prevAvg) * 100) / 100;
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      <div className="toolbar toolbar-end">
        <button
          type="button"
          className="btn-open-modal"
          onClick={() => {
            setError("");
            setIsModalOpen(true);
          }}
          aria-label="Open record weigh-in dialog"
        >
          <PlusIcon size={16} />
          <span>Add</span>
        </button>
      </div>

      <div className="dashboard-main">
        {/* Hero Moving Average Card */}
        <section className="surface" aria-labelledby="trend-title">
          <div className="section-head">
            <h2 id="trend-title" className="section-title">
              7-Day Average
            </h2>
            {weeklyDelta !== null && (
              <span
                className="badge"
                style={{
                  background:
                    weeklyDelta > 0
                      ? "rgba(143, 209, 158, 0.15)"
                      : "rgba(239, 197, 111, 0.15)",
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
              marginTop: "1.25rem",
            }}
          >
            <div className="macro-card">
              <span className="macro-title">Current 7-Day Average</span>
              <span
                className="macro-numbers number-tabular"
                style={{ fontSize: "1.85rem", color: "var(--tint)" }}
              >
                {sevenDayAvg !== null ? `${sevenDayAvg} ` : "— "}
                <span className="macro-target" style={{ fontSize: "1rem" }}>
                  kg
                </span>
              </span>
            </div>

            <div className="macro-card">
              <span className="macro-title">Latest Recorded</span>
              <span
                className="macro-numbers number-tabular"
                style={{ fontSize: "1.85rem" }}
              >
                {sorted.length > 0 ? `${sorted[0].kilograms} ` : "— "}
                <span className="macro-target" style={{ fontSize: "1rem" }}>
                  kg
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* Weigh-in History Card */}
        <section className="surface" aria-labelledby="history-title">
          <div className="section-head">
            <h2 id="history-title" className="section-title">History</h2>
            <span className="muted">
              {busy ? "Loading..." : entries.length}
            </span>
          </div>

          <div className="entries">
            {busy && (
              <div style={{ display: "grid", gap: "0.6rem", padding: "0.5rem 0" }}>
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            )}

            {!busy && entries.length === 0 && (
              <p className="empty-note">No weigh-ins yet.</p>
            )}

            {!busy &&
              entries.map((entry) => (
                <div className="entry-row" key={entry.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--tint)",
                        opacity: 0.8,
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{formatDMY(entry.date)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span
                      className="entry-value number-tabular"
                      style={{ fontSize: "1.1rem" }}
                    >
                      {entry.kilograms}{" "}
                      <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>
                        kg
                      </span>
                    </span>
                    <button
                      className="delete-icon-btn"
                      type="button"
                      onClick={() => void removeEntry(entry.id)}
                      aria-label={`Delete weigh-in for ${formatDMY(entry.date)}`}
                      title="Delete entry"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="New weigh-in"
      >
        <form onSubmit={addEntry} style={{ display: "grid", gap: "1rem" }}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </label>

          <label>
            Weight (Kilograms)
            <div style={{ position: "relative" }}>
              <input
                type="number"
                inputMode="decimal"
                min="20"
                max="500"
                step="0.01"
                placeholder="e.g. 84.5"
                value={kilograms}
                onChange={(event) => setKilograms(event.target.value)}
                required
                style={{
                  paddingRight: "3.25rem",
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontWeight: 700,
                  color: "var(--secondary)",
                  pointerEvents: "none",
                }}
              >
                kg
              </span>
            </div>
          </label>

          {error && (
            <p className="error" aria-live="polite">
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!kilograms}
              style={{ flex: 2 }}
            >
              Save Weigh-In
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
