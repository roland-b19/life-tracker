"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  /** `short` replaces the label when the control is too narrow for it; the full label stays the accessible name. */
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
          className={value === o.value ? "active" : ""}
          aria-label={o.short ? o.label : undefined}
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
