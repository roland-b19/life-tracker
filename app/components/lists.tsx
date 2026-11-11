"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PencilIcon, TrashIcon } from "./icons";

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

/**
 * The Edit and Delete icon buttons at the end of a row. `bare`: no wrapper, for rows that lay the buttons out themselves.
 * `deleteTitle` is the tooltip (a disconnect says "Disconnect").
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  deleteTitle = "Delete",
  className = "row-actions",
  bare,
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
  deleteTitle?: string;
  className?: string;
  bare?: boolean;
}) {
  const buttons = (
    <>
      <button type="button" className="delete-icon-btn edit" onClick={onEdit} aria-label={editLabel} title="Edit">
        <PencilIcon size={17} />
      </button>
      <button type="button" className="delete-icon-btn" onClick={onDelete} aria-label={deleteLabel} title={deleteTitle}>
        <TrashIcon size={17} />
      </button>
    </>
  );
  return bare ? buttons : <div className={className}>{buttons}</div>;
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
 * A category reorder also reorders the items list above its card; the page must not shift under the finger, so the
 * card keeps its place on screen across that render (Safari has no scroll anchoring). Put `ref` on the card, call
 * `keep()` right before changing `dep` (the categories), and the card is scrolled back to where it was.
 */
export function useKeepPlace<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const top = useRef<number | null>(null);
  const keep = () => {
    top.current = ref.current?.getBoundingClientRect().top ?? null;
  };
  useLayoutEffect(() => {
    if (top.current !== null && ref.current) window.scrollBy(0, ref.current.getBoundingClientRect().top - top.current);
    top.current = null;
  }, [dep]);
  return [ref, keep] as const;
}

// Safari on iPhone can still pan the page under a finger that started on a handle; the page must not move while dragging.
const noPan = (e: TouchEvent) => e.preventDefault();

/**
 * Drag a row by its handle to any place in its list. Rows are the list's children marked `data-sort`; the dragged
 * row follows the pointer, the rows in between step aside, and on drop `move(from, to)` reorders them.
 * Spread the result on the handle; it needs `touch-action: none`.
 */
export function useDragSort(move: (from: number, to: number) => void) {
  const drag = useRef<{ rows: HTMLElement[]; i: number; to: number; y: number; mids: number[]; step: number } | null>(null);

  const settle = (rows: HTMLElement[], i: number) => {
    document.removeEventListener("touchmove", noPan);
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
    document.addEventListener("touchmove", noPan, { passive: false });
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
