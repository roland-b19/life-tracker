"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  /** `short` replaces the label when the control is too narrow for it. Both stay in the markup and CSS hides one, so the accessible name is always the text on screen (WCAG 2.5.3). */
  options: { value: T; label: string; short?: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const scrolled = useRef<number | null>(null);
  // Safari on iPhone throws the page to the top when the rows under a pressed option change; put it back before paint.
  // A list too short for that position clamps to its end.
  useLayoutEffect(() => {
    if (scrolled.current !== null) window.scrollTo(0, scrolled.current);
    scrolled.current = null;
  }, [value]);
  return (
    <div
      className={`segmented${options.length > 4 ? " dense" : ""}${options.some((o) => o.short) ? " has-short" : ""}`}
      role="tablist"
      aria-label={label}
      style={{ "--n": options.length, "--i": index } as CSSProperties}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = options[(options.findIndex((x) => x.value === o.value) + step + options.length) % options.length];
            onChange(next.value);
            (e.currentTarget.parentElement?.children[options.indexOf(next)] as HTMLElement | undefined)?.focus();
          }}
          className={value === o.value ? "active" : ""}
          onClick={() => {
            if (o.value !== value) scrolled.current = window.scrollY;
            onChange(o.value);
          }}
        >
          {o.short ? (
            <>
              <span className="seg-long">{o.label}</span>
              <span className="seg-short">{o.short}</span>
            </>
          ) : (
            o.label
          )}
        </button>
      ))}
    </div>
  );
}
