"use client";

import { FormEvent, useEffect, useState } from "react";
import { Navigation } from "./components/navigation";
import { InfoIcon } from "./components/icons";

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

  async function load() {
    const response = await fetch("/api/weight", { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load weigh-ins.");
      setBusy(false);
      return;
    }
    const data = (await response.json()) as { entries: WeightEntry[] };
    setEntries(data.entries);
    setBusy(false);
  }

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
    const response = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, kilograms: Number(kilograms) }),
    });
    if (!response.ok) {
      setError(response.status === 409 ? "There is already a weigh-in for this date." : "Check the date and weight.");
      return;
    }
    setKilograms("");
    await load();
  }

  async function removeEntry(id: string) {
    const response = await fetch(`/api/weight/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      setError("Could not delete that weigh-in.");
      return;
    }
    setEntries((current) => current.filter((entry) => entry.id !== id));
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

      <div className="dashboard-grid">
        {/* Left Column: Analytics & Weigh-In History */}
        <div className="dashboard-main">
          {/* Hero Moving Average Card */}
          <section className="surface" aria-labelledby="trend-title">
            <div className="section-heading">
              <div>
                <span className="badge badge-info">Weight Trend Analysis</span>
                <h2 id="trend-title" style={{ marginTop: "0.25rem" }}>
                  7-Day Rolling Average
                </h2>
              </div>
              {weeklyDelta !== null && (
                <span
                  className="badge"
                  style={{
                    background: weeklyDelta > 0 ? "rgba(52, 199, 89, 0.15)" : "rgba(255, 149, 0, 0.15)",
                    color: weeklyDelta > 0 ? "#34c759" : "#ff9500",
                    fontSize: "0.85rem",
                  }}
                >
                  {weeklyDelta > 0 ? "+" : ""}{weeklyDelta} kg/week
                </span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.85rem", marginTop: "1.25rem" }}>
              <div className="macro-card">
                <span className="macro-title">Current 7-Day Average</span>
                <span className="macro-numbers" style={{ fontSize: "1.75rem", color: "var(--tint)" }}>
                  {sevenDayAvg !== null ? `${sevenDayAvg} ` : "— "}
                  <span className="macro-target" style={{ fontSize: "1rem" }}>kg</span>
                </span>
              </div>

              <div className="macro-card">
                <span className="macro-title">Latest Recorded</span>
                <span className="macro-numbers" style={{ fontSize: "1.75rem" }}>
                  {sorted.length > 0 ? `${sorted[0].kilograms} ` : "— "}
                  <span className="macro-target" style={{ fontSize: "1rem" }}>kg</span>
                </span>
              </div>
            </div>
          </section>

          {/* Weigh-in History Card */}
          <section className="surface" aria-labelledby="history-title">
            <div className="section-heading">
              <h2 id="history-title">History & Records</h2>
              <span className="muted">{busy ? "Loading..." : `${entries.length} recorded entries`}</span>
            </div>

            <div className="entries">
              {!busy && entries.length === 0 && (
                <p className="muted" style={{ padding: "1.5rem 0", textAlign: "center" }}>
                  No weigh-ins recorded yet. Log your first weight on the right panel.
                </p>
              )}
              {entries.map((entry) => (
                <div className="entry-row" key={entry.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--tint)",
                        opacity: 0.7,
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{entry.date}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span className="entry-value" style={{ fontSize: "1.1rem" }}>
                      {entry.kilograms} <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>kg</span>
                    </span>
                    <button
                      className="danger"
                      type="button"
                      onClick={() => void removeEntry(entry.id)}
                      style={{ minHeight: "2rem", padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Quick Add Weight Form & Guidelines */}
        <div className="dashboard-aside sticky">
          <section className="surface" aria-labelledby="add-title">
            <div className="section-heading" style={{ marginBottom: "0.75rem" }}>
              <h2 id="add-title" style={{ fontSize: "1.2rem" }}>+ Log Weigh-in</h2>
              <span className="badge badge-info">Fast Entry</span>
            </div>

            <form onSubmit={addEntry} style={{ display: "grid", gap: "0.85rem" }}>
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
                    style={{ paddingRight: "3rem", fontSize: "1.2rem", fontWeight: 700 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: "0.85rem",
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

              <button
                type="submit"
                disabled={!kilograms}
                style={{ marginTop: "0.25rem", width: "100%" }}
              >
                + Record Weight
              </button>
            </form>
          </section>

          {/* Context Card: Consistent Weigh-in Tips */}
          <section className="surface" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "var(--secondary)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <InfoIcon size={15} /> Measurement Consistency
            </h3>
            <p className="muted" style={{ fontSize: "0.875rem", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
              For the most accurate moving average, weigh yourself every morning immediately upon waking, after using the bathroom, and before eating or drinking water.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
