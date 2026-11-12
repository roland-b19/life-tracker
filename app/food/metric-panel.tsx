"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { AddButton, Card, Dashboard, DashboardAside, DashboardMain, DayField, EmptyNote, Field, FormModal, SkeletonRows, StatRow } from "../components/blocks";
import { useToast } from "../components/toast";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { ListBox, RowActions, useMore } from "../components/lists";
import { TrendChart } from "./trend-chart";
import { metricDayEditable } from "@/lib/rules";
import { clearDailyMetricAction, listDailyMetricsAction, saveDailyMetricAction } from "@/app/actions/food";

type Kind = "water" | "steps";
// `id` is local: a day's value can move to another day, and its row should move with it.
export type Entry = { id: string; date: string; value: number };

const KINDS = {
  water: { title: "Water", unit: "ml", field: "waterMl", max: 20000, label: "Water (ml)", noun: "water" },
  steps: { title: "Steps", unit: "steps", field: "steps", max: 200000, label: "Steps", noun: "steps" },
} as const;

const today = () => toISODate();

const sortNewestFirst = (list: Entry[]) => [...list].sort((a, b) => b.date.localeCompare(a.date));

let seq = 0;
const nextId = () => `m${++seq}`;

/** The list with `date` set to `value` (0 removes it); the same list when nothing changes. */
export function withDay(list: Entry[], date: string, value: number) {
  const old = list.find((e) => e.date === date);
  if ((old?.value ?? 0) === value) return list;
  const rest = list.filter((e) => e.date !== date);
  return value > 0 ? [...rest, { id: old?.id ?? nextId(), date, value }] : rest;
}

/**
 * History and trend of one daily metric; `onToday` keeps the Today tab's card in step. The list lives with the page
 * (`list`, null until loaded), so reopening the tab shows it at once and a late Undo still lands in it.
 */
export function MetricPanel({ kind, onToday, list, setList }: {
  kind: Kind;
  onToday: (value: number) => void;
  list: Entry[] | null;
  setList: Dispatch<SetStateAction<Entry[] | null>>;
}) {
  const k = KINDS[kind];
  const entries = list ?? [];
  const setEntries = (next: (current: Entry[]) => Entry[]) => setList((current) => next(current ?? []));
  const [editing, setEditing] = useState<Entry | null>(null);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(list === null);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    if (!loading) return;
    let active = true;
    listDailyMetricsAction()
      .then((rows) => {
        if (!active) return;
        setList(rows.filter((r) => r[k.field] > 0).map((r) => ({ id: nextId(), date: r.date, value: r[k.field] })));
      })
      .catch(() => active && showToast({ message: `Failed to load ${k.noun}`, type: "warning" }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [k, showToast, loading, setList]);

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
                    {/* Older days are history: seen here and in the chart, never changed. */}
                    {metricDayEditable(entry.date, today()) && (
                      <RowActions onEdit={() => openForm(entry)} onDelete={() => removeEntry(entry)} editLabel={`Edit ${k.noun} for ${formatDMY(entry.date)}`} deleteLabel={`Delete ${k.noun} for ${formatDMY(entry.date)}`} />
                    )}
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
          </Card>
          <TrendChart id={`${kind}-chart-title`} noun={k.title} days={[7, 30]} entries={entries} />
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
        <DayField value={date} today={today()} onChange={setDate} />
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
