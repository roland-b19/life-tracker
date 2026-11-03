"use client";

import { FormEvent, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

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
      <header className="topbar">
        <div>
          <p className="muted">Life Tracker</p>
          <h1>Weigh-ins</h1>
        </div>
        <button className="secondary" type="button" onClick={() => signOut({ callbackUrl: "/signin" })}>
          Sign out
        </button>
      </header>
      <p className="muted">Signed in as {userName}</p>
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
