"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

/**
 * The card around a list: the layout box the rows' bands widen into (globals.css). `wash`: every other row carries
 * the soft highlight band.
 */
export function ListBox({ className, wash, children }: { className?: string; wash?: boolean; children: ReactNode }) {
  return (
    <div className="list-box" data-wash={wash ? "" : undefined}>
      <div className={className}>{children}</div>
    </div>
  );
}

const PAGE = 10;

/**
 * A long list shows 10 rows; `more` (put it last inside the list's ListBox) adds 10 at a time.
 */
export function useMore<T>(list: T[]) {
  const [shown, setShown] = useState(PAGE);
  const more = list.length > shown && (
    <button key="more" type="button" className="btn-sm tint more-btn" onClick={() => setShown((n) => n + PAGE)}>
      More
    </button>
  );
  return [list.slice(0, shown), more] as const;
}

/**
 * Drag a row by its handle to any place in its list. Rows are the list's children marked `data-sort`; the dragged
 * row follows the pointer, the rows in between step aside, and on drop `move(from, to)` reorders them.
 * Spread the result on the handle; it needs `touch-action: none`.
 */
export function useDragSort(move: (from: number, to: number) => void) {
  const drag = useRef<{ rows: HTMLElement[]; i: number; to: number; y: number; mids: number[]; step: number } | null>(null);

  const settle = (rows: HTMLElement[], i: number) => {
    rows[i].classList.remove("dragging");
    for (const r of rows) r.style.transform = "";
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = e.currentTarget.closest<HTMLElement>("[data-sort]")!;
    const rows = [...row.parentElement!.children].filter((c): c is HTMLElement => c instanceof HTMLElement && "sort" in c.dataset);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const i = rows.indexOf(row);
    const gap = parseFloat(getComputedStyle(row.parentElement!).rowGap) || 0;
    drag.current = {
      rows,
      i,
      to: i,
      y: e.clientY,
      mids: rects.map((r) => r.top + r.height / 2),
      step: rects[i].height + gap,
    };
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    row.classList.add("dragging");
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    const mid = d.mids[d.i] + dy;
    let to = d.i;
    d.rows.forEach((r, j) => {
      if (j === d.i) return;
      // a row the dragged one has passed the middle of moves one place the other way
      const shift = j > d.i && mid > d.mids[j] ? -d.step : j < d.i && mid < d.mids[j] ? d.step : 0;
      if (shift) to += shift < 0 ? 1 : -1;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
    d.to = to;
    d.rows[d.i].style.transform = `translateY(${dy}px)`;
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    settle(d.rows, d.i);
    if (d.to !== d.i) move(d.i, d.to);
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d) settle(d.rows, d.i);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
