"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

// DUR and EASE match --dur and --ease in globals.css.
const DUR = 420;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

// RESIZE and RESIZE_EASE match the .auto-height transition in globals.css.
const RESIZE = 180;
const RESIZE_EASE = "cubic-bezier(0.2, 0, 0, 1)";

// Share of RESIZE (0..1) after which RESIZE_EASE, cubic-bezier(0.2, 0, 0, 1), has covered share p of the way.
function resizeTime(p: number) {
  if (p <= 0) return 0;
  for (let s = 0; s <= 1; s += 0.01) if (3 * (1 - s) * s * s + s ** 3 >= p) return 0.6 * s * (1 - s) ** 2 + s ** 3;
  return 1;
}

// A wash list (AutoHeight's `wash`) fades its alternating row wash out before rows move and back in after;
// WASH matches --fade in globals.css.
const WASH = 240;
const holds = new WeakMap<HTMLElement, number>();
/**
 * Marks a wash list data-settling (no wash) until every row animation running now has finished. `keep` holds it
 * until the next hold instead: a leaving row's removal, which lands after its animations end.
 */
function hold(list: HTMLElement, keep = false) {
  list.dataset.settling = ""; // before getAnimations styles new rows, so they never start washed
  const id = (holds.get(list) ?? 0) + 1;
  holds.set(list, id);
  if (keep) return;
  const running = [...list.children].flatMap((r) => r.getAnimations()).filter((a) => !(a instanceof CSSTransition));
  const clear = () => {
    if (holds.get(list) !== id) return;
    for (const r of list.children) delete (r as HTMLElement).dataset.entering;
    delete list.dataset.settling;
  };
  if (!running.length) return clear();
  Promise.allSettled(running.map((a) => a.finished)).then(clear);
}
// How long a row change waits for the wash to fade out first: only in a wash list whose wash is showing.
const washWait = (list: HTMLElement | null) => (list?.closest("[data-wash]") && !list.hasAttribute("data-settling") ? WASH : 0);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// An element's x on the page, ignoring transforms. offsetLeft alone is not enough: an entering row
// becomes the offsetParent for a moment, so it would measure from a different origin.
function layoutX(el: HTMLElement) {
  let x = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) x += e.offsetLeft;
  return x;
}

/**
 * Animates its own height whenever the content changes size (a filter switch, a row added
 * or removed), instead of popping. Rows driven by useListMotion animate their own space, so
 * the container just follows them. When it grows, each new row's entrance (row-in) waits until the
 * growing height has uncovered the whole row, so no row is seen cut off by the container's edge. Boxes marked data-slide (Wishlist price, range, link) glide to a new
 * column width and position when a row added, removed or edited changes the shared columns.
 */
export function AutoHeight({ className, wash, children }: { className?: string; wash?: boolean; children: ReactNode }) {
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
      if (next < from) return;
      const top = outer.getBoundingClientRect().top;
      for (const row of inner.children) {
        const entrance = row.getAnimations().find((a) => (a as CSSAnimation).animationName === "row-in");
        const timing = entrance?.effect?.getTiming();
        if (!entrance || !timing || Number(entrance.currentTime) >= Number(timing.delay)) continue; // already showing
        // The row's layout bottom: its centre ignores the entrance scale. 1px early, as the ease's tail is slow.
        const r = row.getBoundingClientRect();
        const bottom = r.top + r.height / 2 + (row as HTMLElement).offsetHeight / 2 - top - 1;
        const reach = resizeTime((bottom - from) / (next - from)) * RESIZE;
        if (reach > Number(timing.delay)) entrance.effect!.updateTiming({ delay: reach });
      }
    });
    const onEnd = (e: TransitionEvent) => e.target === outer && e.propertyName === "height" && settle();

    // A wash list hides its row wash while any row is entering or leaving (transitions are left out: the
    // wash's own fade is one), so the wash comes back once the whole list is in place.
    const washes = outer.hasAttribute("data-wash");
    if (washes) hold(inner);

    // Layout box (layoutX and offsetWidth ignore the rows' entrance scale) of every data-slide element.
    const boxes = new WeakMap<HTMLElement, { x: number; w: number }>();
    let width = inner.offsetWidth;
    const glides = (el: HTMLElement) => el.getAnimations().filter((a) => a.id === "slide");
    const slide = (animate: boolean) => {
      const els = [...inner.querySelectorAll<HTMLElement>("[data-slide]")];
      // While a glide runs, every box (also one only carried by a gliding column) restarts from where it is
      // on screen now. Read all before cancelling any.
      const running = els.some((el) => glides(el).length);
      const froms = els.map((el) =>
        boxes.has(el) && running
          ? { x: layoutX(el) + new DOMMatrixReadOnly(getComputedStyle(el).transform).m41, w: el.offsetWidth }
          : boxes.get(el),
      );
      els.forEach((el) => glides(el).forEach((a) => a.cancel()));
      const tos = els.map((el) => ({ x: layoutX(el), w: el.offsetWidth }));
      const timing = { duration: RESIZE, easing: RESIZE_EASE, id: "slide" };
      const moving: [HTMLElement, number][] = [];
      for (const [i, el] of els.entries()) {
        const from = froms[i];
        const to = tos[i];
        boxes.set(el, to);
        if (!animate || !from) continue;
        if (Math.abs(from.w - to.w) >= 1) el.animate([{ width: `${from.w}px` }, { width: `${to.w}px` }], timing);
        moving.push([el, from.x]);
      }
      // A gliding width also moves the shared columns after it, so translate only what layout does not cover.
      // Same duration and easing, so layout plus translate add up to a straight glide.
      const starts = moving.map(([el]) => layoutX(el));
      for (const [i, [el, fromX]] of moving.entries()) {
        const dx = fromX - starts[i];
        if (Math.abs(dx) >= 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], timing);
      }
    };
    slide(false);
    // A row added, removed or edited can change the shared columns; a window resize just re-measures.
    const mutations = new MutationObserver(() => {
      if (washes) hold(inner); // first: slide's measuring styles the new rows
      slide(!reducedMotion());
    });
    const widths = new ResizeObserver(() => {
      if (inner.offsetWidth === width) return;
      width = inner.offsetWidth;
      slide(false);
    });

    observer.observe(inner);
    mutations.observe(inner, { childList: true, subtree: true, characterData: true });
    widths.observe(inner);
    outer.addEventListener("transitionend", onEnd);
    return () => {
      mutations.disconnect();
      widths.disconnect();
      observer.disconnect();
      outer.removeEventListener("transitionend", onEnd);
    };
  }, []);

  return (
    <div ref={outerRef} className="auto-height" data-wash={wash ? "" : undefined}>
      {/* A wash list starts settling, so the rows' entrance on page load is unwashed too; hold() clears it. */}
      <div ref={innerRef} className={className} data-settling={wash ? "" : undefined}>
        {children}
      </div>
    </div>
  );
}

// Keyframes that take a row's height and padding down to nothing.
function spaceFrames(el: HTMLElement): Keyframe[] {
  const cs = getComputedStyle(el);
  return [
    { height: `${el.offsetHeight}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
    { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
  ];
}

// A grid track never shrinks below zero, so a collapsed row still has a gap on each side and the last one
// would pop when the row is removed. A neighbour takes in one gap instead (added to its own margin).
function closeGap(el: HTMLElement, opening: boolean, timing: KeyframeAnimationOptions) {
  const gap = parseFloat(getComputedStyle(el.parentElement!).rowGap) || 0;
  const next = el.nextElementSibling;
  const near = next ?? el.previousElementSibling;
  if (!gap || !near) return;
  const side = next ? "marginTop" : "marginBottom";
  const frames: Keyframe[] = [{ [side]: "0px" }, { [side]: `${-gap}px` }];
  return near.animate(opening ? frames.reverse() : frames, { ...timing, composite: "add" });
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
const FADE_IN = 180; // starts once the space is open, like row-in in .auto-height

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
  // A leaving row's neighbour holds the closed gap until the row is gone, then drops it in the same commit.
  const gaps = useRef(new Map<HTMLElement, Animation>());
  useLayoutEffect(() => {
    for (const [el, a] of gaps.current) {
      if (el.isConnected) continue;
      a.cancel();
      gaps.current.delete(el);
    }
  });

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
        gaps.current.get(el)?.cancel();
        gaps.current.delete(el);
        el.style.pointerEvents = el.style.overflow = "";
        delete el.dataset.rowMotion;
        el.style.animation = "none"; // its own entrance replaces the stagger in globals.css
        // In a wash list the other rows' wash fades out first; the row sits out the alternation until it is in,
        // so no wash jumps to another row meanwhile.
        const wait = washWait(el.parentElement);
        if (wait) el.dataset.entering = "";
        if (!alone(el)) {
          el.dataset.rowMotion = "";
          el.style.overflow = "hidden";
          const open = { duration: SPACE, easing: SPACE_EASE, delay: wait, fill: "backwards" } as const;
          closeGap(el, true, open);
          el.animate(spaceFrames(el).reverse(), open).finished.catch(() => {}).finally(() => {
            el.style.overflow = "";
            delete el.dataset.rowMotion;
          });
        }
        // A row fades in only once its space is fully open, so it is never seen clipped.
        el.animate([...FADE_OUT].reverse(), { duration: FADE_IN, delay: wait + (alone(el) ? 120 : SPACE), easing: EASE, fill: "backwards" })
          .finished.catch(() => {}).finally(() => {
            delete el.dataset.entering;
            done();
          });
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
    // In a wash list the wash fades out first and comes back once the row is gone (the next hold).
    const wait = washWait(el.parentElement);
    if (wait) hold(el.parentElement!, true);
    // The space closes while the row fades, so the exit is one movement of about a quarter of a second.
    const fade = el.animate(FADE_OUT, { ...FADE, delay: wait });
    let exit = fade;
    if (!alone(el)) {
      const close = { duration: SPACE, easing: SPACE_EASE, fill: "both", delay: wait } as const;
      const gap = closeGap(el, false, close);
      if (gap) gaps.current.set(el, gap);
      exit = el.animate(spaceFrames(el), close);
    }
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
