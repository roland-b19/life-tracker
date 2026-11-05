"use client";

import { useEffect, useRef, useState } from "react";

interface DatePickerProps {
  /** "day" works on YYYY-MM-DD values, "month" on YYYY-MM. */
  mode: "day" | "month";
  value: string;
  /** Today (or this month) in the same format; also what the shortcut button jumps to. */
  today: string;
  /** Last choosable value, same format. */
  max: string;
  label: string;
  onChange: (next: string) => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad = (n: number) => String(n).padStart(2, "0");
const utc = (iso: string) => new Date(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00Z`);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => utc(iso).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
const shiftMonth = (ym: string, n: number) => {
  const d = utc(ym);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

/**
 * The label of a day or month stepper that opens a calendar popover: a month of days, or a
 * year of months. Values after `max` are shown but cannot be chosen.
 */
export function DatePicker({ mode, value, today, max, label, onChange }: DatePickerProps) {
  const isDay = mode === "day";
  // The page the popover shows: a month (YYYY-MM) of days, or a year (YYYY) of months.
  const pageOf = (v: string) => v.slice(0, isDay ? 7 : 4);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(pageOf(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], button:not(:disabled)')?.focus();
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (next: string) => {
    close(true);
    if (next !== value) onChange(next);
  };

  // Day mode: blanks up to the month's first weekday (Monday first), then its days.
  const cells: (string | null)[] = isDay
    ? [
        ...Array<null>((utc(page).getUTCDay() + 6) % 7).fill(null),
        ...Array.from({ length: new Date(Date.UTC(+page.slice(0, 4), +page.slice(5, 7), 0)).getUTCDate() }, (_, i) => `${page}-${pad(i + 1)}`),
      ]
    : Array.from({ length: 12 }, (_, i) => `${page}-${pad(i + 1)}`);

  const prevPage = isDay ? shiftMonth(page, -1) : String(+page - 1);
  const nextPage = isDay ? shiftMonth(page, 1) : String(+page + 1);
  const nextStart = `${nextPage}-01`; // first day, or first month, of the next page
  const title = isDay ? fmt(page, { month: "long", year: "numeric" }) : page;

  // Arrow keys move between the choosable cells: a day or a month sideways, a week or a row of months up and down.
  const onGridKey = (e: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: isDay ? -7 : -3, ArrowDown: isDay ? 7 : 3 }[e.key];
    if (!step) return;
    e.preventDefault();
    const buttons = [...gridRef.current!.querySelectorAll<HTMLButtonElement>("button")];
    buttons[buttons.indexOf(document.activeElement as HTMLButtonElement) + step]?.focus();
  };

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="month-label-btn number-tabular"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setPage(pageOf(value));
          setOpen((o) => !o);
        }}
      >
        {label}
      </button>

      {open && (
        <div className="picker-pop" role="dialog" aria-label={isDay ? "Choose a day" : "Choose a month"}>
          <div className="picker-head">
            <button type="button" className="month-nav-btn" onClick={() => setPage(prevPage)} aria-label={isDay ? "Previous month" : "Previous year"}>
              ‹
            </button>
            <strong aria-live="polite">{title}</strong>
            <button
              type="button"
              className="month-nav-btn"
              onClick={() => setPage(nextPage)}
              disabled={nextStart > max}
              aria-label={isDay ? "Next month" : "Next year"}
            >
              ›
            </button>
          </div>

          {isDay && (
            <div className="picker-grid days picker-weekdays" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          )}

          <div className={`picker-grid ${isDay ? "days" : "months"}`} ref={gridRef} onKeyDown={onGridKey}>
            {cells.map((cell, i) =>
              cell ? (
                <button
                  key={cell}
                  type="button"
                  className={`picker-cell number-tabular${cell === today ? " today" : ""}`}
                  aria-pressed={cell === value}
                  aria-current={cell === today ? "date" : undefined}
                  aria-label={fmt(cell, isDay ? { weekday: "long", day: "numeric", month: "long", year: "numeric" } : { month: "long", year: "numeric" })}
                  disabled={cell > max}
                  onClick={() => pick(cell)}
                >
                  {isDay ? +cell.slice(8) : fmt(cell, { month: "short" })}
                </button>
              ) : (
                <span key={`blank-${i}`} />
              ),
            )}
          </div>

          <button type="button" className="btn-sm secondary picker-today" onClick={() => pick(today)} disabled={value === today}>
            {isDay ? "Today" : "This month"}
          </button>
        </div>
      )}
    </div>
  );
}
