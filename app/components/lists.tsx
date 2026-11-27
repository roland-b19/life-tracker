"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode, type Ref } from "react";
import { GripIcon, PencilIcon, TrashIcon } from "./icons";
import { Modal } from "./modal";

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

type IconButtonProps = {
  icon: ReactNode;
  label: string;
  title?: string;
  /** The neutral look (Edit, drag); without it the button is the red one (Delete). */
  edit?: boolean;
  ref?: Ref<HTMLButtonElement>;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "title" | "aria-label" | "children">;

/** A round icon button of a row or a card head: the shared look of Edit, Delete and the drag handle. */
function IconButton({ icon, label, title, edit, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={["delete-icon-btn", edit && "edit", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={title}
      {...rest}
    >
      {icon}
    </button>
  );
}

export function EditButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return <IconButton edit icon={<PencilIcon size={17} />} label={label} title="Edit" disabled={disabled} onClick={onClick} />;
}

/** `title` is the tooltip (a disconnect says "Disconnect"). */
export function DeleteButton({ label, title = "Delete", onClick }: { label: string; title?: string; onClick: () => void }) {
  return <IconButton icon={<TrashIcon size={17} />} label={label} title={title} onClick={onClick} />;
}

/**
 * The grip a row is dragged by (see useDragSort); spread the drag handlers and key handler on it. A disabled handle (in
 * a form whose save is out) moves nothing: the key handler is skipped here, and useDragSort checks the pointer events
 * itself, as Chromium still sends them to a disabled button.
 */
export function DragHandle({
  label,
  onKeyDown,
  ...handlers
}: { label: string } & Omit<IconButtonProps, "icon" | "label" | "title" | "edit">) {
  return (
    <IconButton
      edit
      className="drag-handle"
      icon={<GripIcon size={22} />}
      label={label}
      title="Drag to reorder"
      onKeyDown={(e) => {
        if (!e.currentTarget.matches(":disabled")) onKeyDown?.(e);
      }}
      {...handlers}
    />
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
  deleteTitle,
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
      <EditButton label={editLabel} onClick={onEdit} />
      <DeleteButton label={deleteLabel} title={deleteTitle} onClick={onDelete} />
    </>
  );
  return bare ? buttons : <div className={className}>{buttons}</div>;
}

const PAGE = 10;

/** The button that opens the whole of a long list (useMoreDialog). */
function MoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-sm more-btn" onClick={onClick}>
      More
    </button>
  );
}

/**
 * A long list shows its first 10 rows; More (put it last inside the list's ListBox) opens the whole list in a dialog
 * over the blurred page, drawn with the same `row` (Health's meals, D-029; Gym history, D-047).
 */
export function useMoreDialog<T>(list: T[], title: string, row: (item: T) => ReactNode) {
  const [open, setOpen] = useState(false);
  const more = list.length > PAGE && <MoreButton key="more" onClick={() => setOpen(true)} />;
  const dialog = (
    <Modal isOpen={open} onClose={() => setOpen(false)} title={title}>
      <ListBox wash className="entries">
        {list.map(row)}
      </ListBox>
    </Modal>
  );
  return [list.slice(0, PAGE), more, dialog] as const;
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
 * Spread the result on the handle; it needs `touch-action: none`. A disabled handle (its form's save is out, and that
 * save sent the order from before) moves nothing: it starts no drag, and a drag under way when it is disabled puts its
 * row back at the next pointer event and drops nothing.
 */
export function useDragSort(move: (from: number, to: number) => void) {
  const drag = useRef<{ handle: HTMLElement; rows: HTMLElement[]; i: number; to: number; y: number; mids: number[]; step: number } | null>(null);

  // Ends the drag under way, if any, with every row back in its place; returns it.
  const settle = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return null;
    document.removeEventListener("touchmove", noPan);
    d.rows[d.i].classList.remove("dragging");
    for (const r of d.rows) r.style.transform = "";
    return d;
  }, []);

  // A handle removed mid-drag (a save closed its form while the pointer was down) gets no pointer event any more, so
  // its drag ends as it goes. Stable, so no render runs it.
  const ref = useCallback(
    (el: HTMLElement | null) => () => {
      if (el && drag.current?.handle === el) settle();
    },
    [settle],
  );

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || e.currentTarget.matches(":disabled")) return;
    const row = e.currentTarget.closest<HTMLElement>("[data-sort]")!;
    const rows = [...row.parentElement!.children].filter((c): c is HTMLElement => c instanceof HTMLElement && "sort" in c.dataset);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const i = rows.indexOf(row);
    const gap = parseFloat(getComputedStyle(row.parentElement!).rowGap) || 0;
    drag.current = {
      handle: e.currentTarget,
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
    if (e.currentTarget.matches(":disabled")) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      return void settle();
    }
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

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = settle();
    if (d && d.to !== d.i && !e.currentTarget.matches(":disabled")) move(d.i, d.to);
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => void settle() };
}
