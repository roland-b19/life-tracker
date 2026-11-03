"use client";

import { FormEvent, useEffect, useState } from "react";
import { Navigation } from "./components/navigation";

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
    // shortcut: deletion is immediate, add undo before introducing irreversible multi-step actions.
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

  return (
    <main>
      <Navigation userName={userName} />
      <section className="surface" aria-labelledby="add-title">
        <h2 id="add-title">Add today&apos;s weight</h2>
        <form onSubmit={addEntry} className="form-row">
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label>
            Kilograms
            <input
              type="number"
              inputMode="decimal"
              min="20"
              max="500"
              step="0.01"
              value={kilograms}
              onChange={(event) => setKilograms(event.target.value)}
              required
            />
          </label>
          <button type="submit">Add weigh-in</button>
        </form>
        <p className="error" aria-live="polite">
          {error}
        </p>
      </section>
      <section className="surface" aria-labelledby="history-title" style={{ marginTop: "1rem" }}>
        <div className="section-heading">
          <h2 id="history-title">History</h2>
          <span className="muted">{busy ? "Loading..." : `${entries.length} entries`}</span>
        </div>

        {entries.length > 0 && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem 1rem",
              background: "var(--background)",
              borderRadius: "0.65rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span className="muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 600 }}>
                7-Day Moving Average
              </span>
              <p style={{ margin: "0.15rem 0 0", fontSize: "1.1rem", fontWeight: 700 }}>
                {(() => {
                  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
                  const latestDate = new Date(sorted[0].date);
                  const weekAgo = new Date(latestDate);
                  weekAgo.setDate(weekAgo.getDate() - 6);
                  const currentWeek = sorted.filter((e) => {
                    const d = new Date(e.date);
                    return d >= weekAgo && d <= latestDate;
                  });
                  if (currentWeek.length === 0) return `${sorted[0].kilograms} kg`;
                  const avg = currentWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0) / currentWeek.length;
                  return `${Math.round(avg * 100) / 100} kg`;
                })()}
              </p>
            </div>
            {(() => {
              const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
              const latestDate = new Date(sorted[0].date);
              const weekAgo = new Date(latestDate);
              weekAgo.setDate(weekAgo.getDate() - 6);
              const twoWeeksAgo = new Date(latestDate);
              twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 13);
              const currentWeek = sorted.filter((e) => {
                const d = new Date(e.date);
                return d >= weekAgo && d <= latestDate;
              });
              const prevWeek = sorted.filter((e) => {
                const d = new Date(e.date);
                return d >= twoWeeksAgo && d < weekAgo;
              });
              if (currentWeek.length === 0 || prevWeek.length === 0) return null;
              const curAvg = currentWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0) / currentWeek.length;
              const prevAvg = prevWeek.reduce((acc, e) => acc + parseFloat(e.kilograms), 0) / prevWeek.length;
              const diff = Math.round((curAvg - prevAvg) * 100) / 100;
              return (
                <span
                  className="badge"
                  style={{
                    background: diff > 0 ? "rgba(52, 199, 89, 0.15)" : "rgba(255, 149, 0, 0.15)",
                    color: diff > 0 ? "#34c759" : "#ff9500",
                  }}
                >
                  {diff > 0 ? "+" : ""}{diff} kg/week
                </span>
              );
            })()}
          </div>
        )}

        <div className="entries">
          {!busy && entries.length === 0 && <p className="muted">No weigh-ins yet.</p>}
          {entries.map((entry) => (
            <div className="entry-row" key={entry.id}>
              <span>{entry.date}</span>
              <span className="entry-value">
                {entry.kilograms} kg{" "}
                <button className="danger" type="button" onClick={() => void removeEntry(entry.id)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
