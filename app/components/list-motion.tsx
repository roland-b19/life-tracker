"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

// Durations match --dur and --ease in globals.css.
const DUR = 420;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A growing list's bottom edge fades (transparent at the bottom) instead of cutting rows. The fade
// holds while the box grows (460ms, .auto-height's transition) and the new rows fade in (row-in,
// 260ms), then shrinks to nothing. .auto-height.edge-fade in globals.css draws it from --edge.
const HOLD = 460 + 260;
const edgeFrames = (shrink: number, easing: string): Keyframe[] => [
  { "--edge": "72px" },
  { "--edge": "72px", offset: HOLD / (HOLD + shrink), easing },
  { "--edge": "0px" },
];
const EDGE = { frames: edgeFrames(480, "cubic-bezier(0.4, 0, 0.2, 1)"), duration: HOLD + 480 };
// sequential: the rows stay hidden while the box resizes, so no fade is needed then; it is drawn only
// once they start fading in (row-in, 180ms in .auto-height.sequential), large enough to read; it keeps its
// height and loses its strength (--fade 1 → 0), so the bottom rows return to full opacity.
const EDGE_QUICK = {
  frames: [{ "--edge": "120px", "--fade": 1 }, { "--edge": "120px", "--fade": 0 }],
  duration: 360,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

/**
 * Animates its own height whenever the content changes size (a filter switch, a row added
 * or removed), instead of popping. Rows driven by useListMotion animate their own space, so
 * the container just follows them. The bottom edge fades while it grows. `sequential` holds the
 * new rows' entrance (row-in) until the resize ends, so they appear in a box that has stopped moving.
 */
export function AutoHeight({ className, sequential, children }: { className?: string; sequential?: boolean; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const inner = innerRef.current!;
    const contentHeight = () => {
      const cs = getComputedStyle(inner);
      return inner.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    };
    let last = contentHeight();
    let fade: Animation | undefined;
    let grew = false;
    const edgeFade = (edge: { frames: Keyframe[]; duration: number; easing?: string }) => {
      fade?.cancel(); // a second growth restarts the fade
      outer.classList.add("edge-fade");
      const run = (fade = outer.animate(edge.frames, edge));
      run.onfinish = () => fade === run && outer.classList.remove("edge-fade");
    };
    const settle = () => {
      outer.style.height = "";
      outer.style.overflow = "";
      outer.classList.remove("rows-wait");
      if (grew && sequential) edgeFade(EDGE_QUICK);
      grew = false;
    };

    const observer = new ResizeObserver(() => {
      const next = contentHeight();
      if (next === last) return;
      const from = outer.style.height ? outer.getBoundingClientRect().height : last;
      last = next;
      grew = false;
      if (reducedMotion() || inner.querySelector("[data-row-motion]") || from === next) return settle();
      outer.style.overflow = "hidden";
      outer.style.height = `${from}px`;
      void outer.offsetHeight; // commit the start height before transitioning
      outer.style.height = `${next}px`;
      grew = next > from;
      if (sequential) outer.classList.add("rows-wait");
      else if (grew) edgeFade(EDGE);
    });
    const onEnd = (e: TransitionEvent) => e.target === outer && e.propertyName === "height" && settle();

    observer.observe(inner);
    outer.addEventListener("transitionend", onEnd);
    return () => {
      observer.disconnect();
      outer.removeEventListener("transitionend", onEnd);
    };
  }, [sequential]);

  return (
    <div ref={outerRef} className={sequential ? "auto-height sequential" : "auto-height"}>
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

// Rows fade where they stand, with a slight blur so the fade reads softer; row-in in globals.css is the reverse.
const FADE_OUT: Keyframe[] = [
  { opacity: 1, transform: "none", filter: "none" },
  { opacity: 0, transform: "scale(0.97)", filter: "blur(3px)" },
];
const FADE = { duration: 180, easing: EASE, fill: "forwards" } as const;
const SWITCH = { ...FADE, duration: 120 }; // fadeAll: a view switch should feel instant
const CLOSE = 300; // a leaving row's space
const FADE_IN = 260; // matches row-in in globals.css

/**
 * Row motion for lists: `leave` fades a row out while it keeps its space, then closes the
 * space and calls `remove`; `enter` (called just before the row is added) opens the space
 * first, then fades the row in; `fadeAll` fades every row out in place before a view switch.
 * Attach `rowRef(id)` to each row.
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
            return el.animate([...FADE_OUT].reverse(), { duration: FADE_IN, easing: EASE }).finished;
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
    // A row added outside the current filter never mounts; forget it so it does not grow later.
    // Long enough for pages that refetch the list before the row mounts (Tasks).
    setTimeout(() => entering.current.delete(id), 2000);
  }, []);

  const leave = useCallback((id: string, remove: () => void) => {
    const el = nodes.current.get(id);
    if (!el || reducedMotion()) return remove();
    if (el.dataset.rowMotion !== undefined) return; // already leaving
    el.dataset.rowMotion = "";
    el.style.pointerEvents = "none";
    el.style.overflow = "hidden";
    // The space starts closing while the row is still fading, so the whole exit takes well under half a second.
    el.animate(FADE_OUT, FADE);
    el.animate(spaceFrames(el), { duration: CLOSE, delay: 90, easing: EASE, fill: "forwards" })
      .finished.catch(() => {})
      .finally(remove);
  }, []);

  const fadeAll = useCallback((then: () => void) => {
    const rows = [...nodes.current.values()];
    if (!rows.length || reducedMotion()) return then();
    Promise.all(rows.map((el) => el.animate(FADE_OUT, SWITCH).finished))
      .catch(() => {})
      .finally(then);
  }, []);

  // Runs `change` (a state update that reorders rows) and slides each row from its old place to its new one.
  const reorder = useCallback((change: () => void) => {
    if (reducedMotion()) return change();
    const before = new Map([...nodes.current].map(([id, el]) => [id, el.getBoundingClientRect().top]));
    change();
    // React has committed the click's update by the next frame, so this measures the new order before it paints.
    requestAnimationFrame(() => {
      for (const [id, el] of nodes.current) {
        const top = before.get(id);
        const dy = top === undefined ? 0 : top - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: DUR, easing: EASE });
      }
    });
  }, []);

  return { rowRef, enter, leave, fadeAll, reorder };
}
