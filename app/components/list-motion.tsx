"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

// Durations match --dur and --ease in globals.css.
const DUR = 420;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animates its own height whenever the content changes size (a filter switch, a row added
 * or removed), instead of popping. Rows driven by useListMotion animate their own space, so
 * the container just follows them.
 */
export function AutoHeight({ className, children }: { className?: string; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const inner = innerRef.current!;
    const contentHeight = () => {
      const cs = getComputedStyle(inner);
      return inner.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    };
    const settle = () => {
      outer.style.height = "";
      outer.style.overflow = "";
    };
    let last = contentHeight();

    const observer = new ResizeObserver(() => {
      const next = contentHeight();
      if (next === last) return;
      const from = outer.style.height ? outer.getBoundingClientRect().height : last;
      last = next;
      if (reducedMotion() || inner.querySelector("[data-row-motion]") || from === next) return settle();
      outer.style.overflow = "hidden";
      outer.style.height = `${from}px`;
      void outer.offsetHeight; // commit the start height before transitioning
      outer.style.height = `${next}px`;
    });
    const onEnd = (e: TransitionEvent) => e.target === outer && e.propertyName === "height" && settle();

    observer.observe(inner);
    outer.addEventListener("transitionend", onEnd);
    return () => {
      observer.disconnect();
      outer.removeEventListener("transitionend", onEnd);
    };
  }, []);

  return (
    <div ref={outerRef} className="auto-height">
      <div ref={innerRef} className={className}>
        {children}
      </div>
    </div>
  );
}

// Keyframes that take a row's space (height, padding, its share of the list gap) down to nothing.
function spaceFrames(el: HTMLElement): Keyframe[] {
  const cs = getComputedStyle(el);
  const gap = parseFloat(getComputedStyle(el.parentElement!).rowGap) || 0;
  return [
    { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop },
    { height: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: `${parseFloat(cs.marginTop) - gap}px` },
  ];
}

const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0, transform: "scale(0.97)" }];
const BUY_OUT: Keyframe[] = [
  { opacity: 1, offset: 0 },
  { opacity: 1, transform: "scale(1.02)", backgroundColor: "var(--success-subtle)", offset: 0.35 },
  { opacity: 0, transform: "translateX(2rem) scale(0.97)", backgroundColor: "var(--success-subtle)", offset: 1 },
];

/**
 * Row motion for lists: `leave` fades a row out while it keeps its space, then closes the
 * space and calls `remove`; `enter` (called just before the row is added) opens the space
 * first, then fades the row in. Attach `rowRef(id)` to each row.
 */
export function useListMotion() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const entering = useRef(new Set<string>());

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (!el) return;
      nodes.current.set(id, el);
      if (entering.current.delete(id) && !reducedMotion()) {
        el.dataset.rowMotion = "";
        el.style.overflow = "hidden";
        const grow = el.animate(
          spaceFrames(el).reverse().map((f) => ({ ...f, opacity: 0 })),
          { duration: DUR, easing: EASE },
        );
        grow.finished
          .then(() => {
            el.style.overflow = "";
            delete el.dataset.rowMotion;
            return el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
              duration: DUR - 60,
              easing: EASE,
            }).finished;
          })
          .catch(() => {});
      }
      return () => {
        if (nodes.current.get(id) === el) nodes.current.delete(id);
      };
    },
    [],
  );

  const enter = useCallback((id: string) => {
    entering.current.add(id);
  }, []);

  const leave = useCallback((id: string, remove: () => void, variant: "delete" | "buy" = "delete") => {
    const el = nodes.current.get(id);
    if (!el || reducedMotion()) return remove();
    if (el.dataset.rowMotion !== undefined) return; // already leaving
    el.dataset.rowMotion = "";
    el.style.pointerEvents = "none";
    const buy = variant === "buy";
    el.animate(buy ? BUY_OUT : FADE_OUT, { duration: buy ? 520 : 240, easing: buy ? "ease-in-out" : EASE, fill: "forwards" })
      .finished.then(() => {
        el.style.overflow = "hidden";
        return el.animate(spaceFrames(el), { duration: DUR, easing: EASE, fill: "forwards" }).finished;
      })
      .catch(() => {})
      .finally(remove);
  }, []);

  return { rowRef, enter, leave };
}
