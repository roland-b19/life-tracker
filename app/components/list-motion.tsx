"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

// DUR and EASE match --dur and --ease in globals.css.
const DUR = 420;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animates its own height whenever the content changes size (a filter switch, a row added
 * or removed), instead of popping. Rows driven by useListMotion animate their own space, so
 * the container just follows them. The new rows' entrance (row-in) waits until the resize ends, so
 * they appear in a box that has stopped moving.
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
    let last = contentHeight();
    const settle = () => {
      outer.style.height = "";
      outer.style.overflow = "";
      outer.classList.remove("rows-wait");
    };

    const observer = new ResizeObserver(() => {
      const next = contentHeight();
      if (next === last) return;
      const from = outer.style.height ? outer.getBoundingClientRect().height : last;
      last = next;
      if (reducedMotion() || inner.querySelector("[data-row-motion]") || Math.abs(from - next) < 1.5) return settle(); // offsetHeight rounds a subpixel gap (a row vs its empty note) up to 1px
      outer.style.overflow = "hidden";
      outer.style.height = `${from}px`;
      void outer.offsetHeight; // commit the start height before transitioning
      outer.style.height = `${next}px`;
      outer.classList.add("rows-wait");
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

// Rows fade where they stand; row-in in globals.css is the reverse. Opacity and transform only: they stay
// on the compositor, while a filter would repaint the row over the glass card every frame.
const FADE_OUT: Keyframe[] = [
  { opacity: 1, transform: "none" },
  { opacity: 0, transform: "scale(0.97)" },
];
const FADE = { duration: 160, easing: EASE, fill: "forwards" } as const;
const SWITCH = { ...FADE, duration: 120 }; // fadeAll: a view switch should feel instant
const SPACE = 260; // a row's space opening or closing
// Ease in and out: EASE's long tail made a closing row look stuck at the end.
const SPACE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
// A list's only row swaps with its empty note, which takes the same space, so it only fades.
const alone = (el: HTMLElement) => !el.previousElementSibling && !el.nextElementSibling;
const FADE_IN = 220; // starts while the space opens, matches row-in in globals.css

/**
 * Row motion for lists: `leave` fades a row out while its space closes, then calls `remove`;
 * `enter` (called just before the row is added) opens the space and fades the row in, and resolves
 * when it is done; `fadeAll` fades every row out in place before a view switch.
 * Attach `rowRef(id)` to each row.
 */
export function useListMotion() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const entering = useRef(new Map<string, () => void>());
  const leaving = useRef(new WeakSet<HTMLElement>());

  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (!el) return;
      nodes.current.set(id, el);
      const done = entering.current.get(id);
      if (done) {
        entering.current.delete(id);
        // A row that moved (an edit) is the same element: drop its held exit before it enters again.
        el.getAnimations().forEach((a) => a.cancel());
        leaving.current.delete(el);
        el.style.pointerEvents = el.style.overflow = "";
        delete el.dataset.rowMotion;
        el.style.animation = "none"; // its own entrance replaces the stagger in globals.css
        if (!alone(el)) {
          el.dataset.rowMotion = "";
          el.style.overflow = "hidden";
          el.animate(spaceFrames(el).reverse(), { duration: SPACE, easing: SPACE_EASE }).finished.catch(() => {}).finally(() => {
            el.style.overflow = "";
            delete el.dataset.rowMotion;
          });
        }
        el.animate([...FADE_OUT].reverse(), { duration: FADE_IN, delay: 120, easing: EASE, fill: "backwards" })
          .finished.catch(() => {}).finally(done);
      }
      return () => {
        if (nodes.current.get(id) === el) nodes.current.delete(id);
      };
    },
    [],
  );

  const enter = useCallback(
    (id: string) =>
      new Promise<void>((done) => {
        if (reducedMotion()) return done();
        entering.current.set(id, done);
        // A row added outside the current filter never mounts; forget it so it does not grow later.
        // Long enough for pages that refetch the list before the row mounts (Tasks).
        setTimeout(() => entering.current.get(id) === done && (entering.current.delete(id), done()), 2000);
      }),
    [],
  );

  const leave = useCallback((id: string, remove: () => void) => {
    const el = nodes.current.get(id);
    if (!el || reducedMotion()) return remove();
    if (leaving.current.has(el)) return; // a row still entering may leave
    leaving.current.add(el);
    el.dataset.rowMotion = "";
    el.style.pointerEvents = "none";
    el.style.overflow = "hidden";
    // The space starts closing while the row is still fading, so the whole exit takes about a third of a second.
    const fade = el.animate(FADE_OUT, FADE);
    const exit = alone(el) ? fade : el.animate(spaceFrames(el), { duration: SPACE, delay: 80, easing: SPACE_EASE, fill: "forwards" });
    exit.finished.catch(() => {}).finally(remove);
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
