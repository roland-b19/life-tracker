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
import { clearDailyMetricAction, listDailyMetricsAction, saveDailyMetricAction } from "@/app/actions/food";

type Kind = "water" | "steps";
// `id` is local: a day's value can move to another day, and its row should move with it.
type Entry = { id: string; date: string; value: number };

const KINDS = {
  water: { title: "Water", unit: "ml", field: "waterMl", max: 20000, label: "Water (ml)", noun: "water" },
  steps: { title: "Steps", unit: "steps", field: "steps", max: 200000, label: "Steps", noun: "steps" },
} as const;

const today = () => toISODate();

type Range = "7" | "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = ["7", "30", "90", "180", "360"].map((d) => ({
  value: d as Range,
  label: `${d}D`,
}));

const sortNewestFirst = (list: Entry[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

let seq = 0;
const nextId = () => `m${++seq}`;

/** History and trend of one daily metric; `onToday` keeps the Today tab's card in step. */
export function MetricPanel({ kind, onToday }: { kind: Kind; onToday: (value: number) => void }) {
  const k = KINDS[kind];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [range, setRange] = useState<Range>("30");

  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    listDailyMetricsAction()
      .then((rows) => {
        if (!active) return;
        setEntries(rows.filter((r) => r[k.field] > 0).map((r) => ({ id: nextId(), date: r.date, value: r[k.field] })));
      })
      .catch(() => active && showToast({ message: `Failed to load ${k.noun}`, type: "warning" }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [k, showToast]);

  // The Today card shows today's value: whatever lands on or leaves today goes there too.
  const touchToday = (from: string | undefined, to: Entry | null) => {
    if (to?.date === today()) onToday(to.value);
    else if (from === today()) onToday(0);
  };

  const replace = (to: Entry) => setEntries((current) => current.map((e) => (e.id === to.id ? to : e)));

  const save = (input: { date: string; value: number; previousDate?: string }) =>
    saveDailyMetricAction({ kind, ...input }).then(
      (r) => (r.saved ? "ok" : "taken") as "ok" | "taken",
      () => "failed" as const,
    );

  function openForm(entry?: Entry) {
    setError("");
    setEditing(entry ?? null);
    setDate(entry?.date ?? today());
    setValue(entry ? String(entry.value) : "");
    setIsModalOpen(true);
  }

  const closeForm = () => setIsModalOpen(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const amount = Number(value);
    setSaving(true);
    const result = await save({ date, value: amount, previousDate: editing?.date });
    setSaving(false);
    if (result !== "ok") {
      setError(result === "taken" ? "Please pick a date that has no entry yet." : `Failed to save ${k.noun}`);
      return;
    }
    const previous = editing;
    const entry: Entry = { id: previous?.id ?? nextId(), date, value: amount };
    closeForm();
    touchToday(previous?.date, entry);
    if (previous) replace(entry);
    else setEntries((current) => [...current, entry]);
    if (!previous) {
      showToast({
        message: `Added ${amount} ${k.unit} (${formatDMY(date)})`,
        type: "success",
        actionLabel: "Undo",
        onAction: async () => {
          setEntries((current) => current.filter((e) => e.id !== entry.id));
          touchToday(entry.date, null);
          const cleared = await clearDailyMetricAction({ kind, date: entry.date }).then(
            () => true,
            () => false,
          );
          if (!cleared) {
            putBack(entry);
            showToast({ message: "Failed to undo", type: "warning" });
          }
        },
      });
      return;
    }
    showToast({
      message: `Saved ${amount} ${k.unit} (${formatDMY(date)})`,
      type: "success",
      actionLabel: "Undo",
      onAction: async () => {
        replace(previous);
        touchToday(entry.date, previous);
        if ((await save({ date: previous.date, value: previous.value, previousDate: entry.date })) !== "ok") {
          replace(entry);
          touchToday(previous.date, entry);
          showToast({ message: "Failed to undo the edit", type: "warning" });
        }
      },
    });
  }

  const putBack = (entry: Entry) => {
    setEntries((current) => (current.some((e) => e.id === entry.id) ? current : [...current, entry]));
    touchToday(undefined, entry);
  };

  function removeEntry(target: Entry) {
    touchToday(target.date, null);
    setEntries((current) => current.filter((e) => e.id !== target.id));
    const deleted = clearDailyMetricAction({ kind, date: target.date }).then(
      () => true,
      () => false,
    );
    showToast({
      message: `Removed ${target.value} ${k.unit} (${formatDMY(target.date)})`,
      actionLabel: "Undo",
      onAction: async () => {
        if (!(await deleted)) return putBack(target);
        if ((await save({ date: target.date, value: target.value })) !== "ok")
          return showToast({ message: `Failed to restore ${k.noun}`, type: "warning" });
        putBack(target);
      },
    });
    void deleted.then((ok) => {
      if (ok) return;
      putBack(target);
      showToast({ message: `Failed to remove ${k.noun}`, type: "warning" });
    });
  }

  const sorted = sortNewestFirst(entries);
  const [shown, more] = useMore(sorted);
  const lastWeek = sorted.filter((e) => e.date >= addDays(today(), -6) && e.date <= today());
  const average = lastWeek.length ? Math.round(lastWeek.reduce((a, e) => a + e.value, 0) / lastWeek.length) : null;
  const todayValue = sorted.find((e) => e.date === today())?.value ?? 0;
  const since = addDays(today(), 1 - Number(range));
  const inRange = sorted.filter((e) => e.date >= since);
  const titleId = `${kind}-history-title`;

  return (
    <>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby={titleId}>
            <div className="section-head">
              <h2 id={titleId} className="section-title">
                History {!loading && <span className="muted number-tabular">{entries.length}</span>}
              </h2>
              <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                <PlusIcon size={14} />
                Add {k.noun}
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
                    No {k.noun} logged yet.
                  </p>
                )}
                {shown.map((entry) => (
                  <div className="entry-row" key={entry.id}>
                    <span className="weight-main">
                      <strong className="entry-value number-tabular">
                        {entry.value} <span className="macro-target">{k.unit}</span>
                      </strong>
                      <span className="muted number-tabular">{formatDMY(entry.date)}</span>
                    </span>
                    <div className="row-actions">
                      <button
                        className="delete-icon-btn edit"
                        type="button"
                        onClick={() => openForm(entry)}
                        aria-label={`Edit ${k.noun} for ${formatDMY(entry.date)}`}
                        title="Edit"
                      >
                        <PencilIcon size={17} />
                      </button>
                      <button
                        className="delete-icon-btn"
                        type="button"
                        onClick={() => removeEntry(entry)}
                        aria-label={`Delete ${k.noun} for ${formatDMY(entry.date)}`}
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
          <section className="surface" aria-labelledby={`${kind}-trend-title`}>
            <div className="section-head">
              <h2 id={`${kind}-trend-title`} className="section-title">
                Trend
              </h2>
            </div>
            <div className="stat-row">
              <div className="stat-tile">
                <strong className="number-tabular">
                  {average === null ? "—" : <>{Math.round(average)} <span className="macro-target">{k.unit}</span></>}
                </strong>
                <span>7-day average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  {Math.round(todayValue)} <span className="macro-target">{k.unit}</span>
                </strong>
                <span>Today</span>
              </div>
            </div>
            {sorted.length >= 2 && (
              <>
                <div className="chart-controls">
                  <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
                </div>
                <LineChart
                  points={[...inRange]
                    .reverse()
                    .map((e) => ({ label: e.date.slice(5).split("-").reverse().join("."), value: e.value }))}
                  summary={`${k.title} over the last ${range} days`}
                />
                {inRange.length < 2 && <p className="muted chart-note">Not enough entries in the last {range} days.</p>}
              </>
            )}
          </section>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeForm}
        title={editing ? `Edit ${k.noun}` : `New ${k.noun} entry`}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-stack">
            <div className="field">
              <span id={`${kind}-date`}>Date</span>
              <DatePicker
                mode="day"
                className="date-field"
                value={date}
                today={today()}
                max={today()}
                label={formatDMY(date)}
                labelledBy={`${kind}-date`}
                disabled={saving}
                onChange={setDate}
              />
            </div>
            <label>
              {k.label}
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={k.max}
                step="1"
                disabled={saving}
                value={value}
                onChange={(e) => setValue(e.target.value)}
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
            <button type="submit" disabled={saving || !value}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
