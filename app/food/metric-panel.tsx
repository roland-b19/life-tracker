"use client";

import { LineChart } from "../components/charts";
import { FormEvent, useEffect, useState } from "react";
import { AddButton, Card, ChartControls, ChartNote, Dashboard, DashboardAside, DashboardMain, DateField, EmptyNote, Field, FormModal, SkeletonRows, StatRow } from "../components/blocks";
import { useToast } from "../components/toast";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { ListBox, RowActions, useMore } from "../components/lists";
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
        onUndo: async () => {
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
      onUndo: async () => {
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
      onUndo: async () => {
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
      <Dashboard>
        <DashboardMain>
          <Card
            id={titleId}
            title="History"
            count={loading ? undefined : entries.length}
            actions={<AddButton onClick={() => openForm()}>Add {k.noun}</AddButton>}
          >
            {loading ? (
              <SkeletonRows />
            ) : (
              <ListBox wash className="entries">
                {entries.length === 0 && <EmptyNote>No {k.noun} logged yet.</EmptyNote>}
                {shown.map((entry) => (
                  <div className="entry-row" key={entry.id}>
                    <span className="weight-main">
                      <strong className="entry-value number-tabular">
                        {entry.value} <span className="macro-target">{k.unit}</span>
                      </strong>
                      <span className="muted number-tabular">{formatDMY(entry.date)}</span>
                    </span>
                    <RowActions onEdit={() => openForm(entry)} onDelete={() => removeEntry(entry)} editLabel={`Edit ${k.noun} for ${formatDMY(entry.date)}`} deleteLabel={`Delete ${k.noun} for ${formatDMY(entry.date)}`} />
                  </div>
                ))}
                {more}
              </ListBox>
            )}
          </Card>
        </DashboardMain>

        <DashboardAside summaryFirst>
          <Card id={`${kind}-trend-title`} title="Trend">
            <StatRow
              stats={[
                {
                  value: average === null ? "—" : <>{Math.round(average)} <span className="macro-target">{k.unit}</span></>,
                  label: "7-day average",
                },
                { value: <>{Math.round(todayValue)} <span className="macro-target">{k.unit}</span></>, label: "Today" },
              ]}
            />
            {sorted.length >= 2 && (
              <>
                <ChartControls>
                  <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
                </ChartControls>
                <LineChart
                  points={[...inRange]
                    .reverse()
                    .map((e) => ({ label: e.date.slice(5).split("-").reverse().join("."), value: e.value }))}
                  summary={`${k.title} over the last ${range} days`}
                />
                {inRange.length < 2 && <ChartNote>Not enough entries in the last {range} days.</ChartNote>}
              </>
            )}
          </Card>
        </DashboardAside>
      </Dashboard>

      <FormModal
        isOpen={isModalOpen}
        onClose={closeForm}
        title={editing ? `Edit ${k.noun}` : `New ${k.noun} entry`}
        onSubmit={handleSubmit}
        error={error}
        busy={saving}
        canSubmit={!!value}
      >
        <DateField id={`${kind}-date`} value={date} today={today()} max={today()} text={formatDMY(date)} disabled={saving} onChange={setDate} />
        <Field
          label={k.label}
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
      </FormModal>
    </>
  );
}
