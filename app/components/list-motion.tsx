"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

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

// MOVE and MOVE_EASE: the one movement every list change shares (a row added, deleted or moved to another place):
// the rows glide to their new places and the card follows, all in MOVE. They match .auto-height[data-flip] in globals.css.
// A wash list (the alternating highlight) fades its wash out first (WASH, --wash in globals.css) and back in at the
// end: wash out, then the movement, then wash in.
// Only transform and opacity animate on the rows, so a phone keeps them on the compositor (no layout per frame).
const MOVE = 240;
const WASH = 100;
const MOVE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// A card (AutoHeight's outer box) that follows a row leaving: its height animates down while the row is still in place
// and stays there until the row is removed. `to` is the height it is going to, `n` the rows still leaving in it.
const boxHolds = new WeakMap<HTMLElement, { n: number; to: number }>();

// While rows move, the card resizes in MOVE too (not the quicker RESIZE): the attribute switches its transition.
const flips = new WeakMap<HTMLElement, number>();
function flipTiming(from: Element, delay = 0) {
  for (let box = from.closest<HTMLElement>(".auto-height"); box; box = box.parentElement?.closest<HTMLElement>(".auto-height") ?? null) {
    box.dataset.flip = "";
    box.style.setProperty("--flip-delay", `${delay}ms`);
    clearTimeout(flips.get(box));
    flips.set(box, window.setTimeout(() => (delete box.dataset.flip, box.style.removeProperty("--flip-delay")), MOVE + delay + 100));
  }
}

// A wash list (AutoHeight's `wash`) fades its alternating row wash out (--fade) while rows move and back in after.
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

// The row-in stagger in globals.css needs sibling-index(), which not every browser has (Safari): new rows get the
// same delays here, so a list that shrinks still builds one row after another (a growing one also waits for its
// height, in AutoHeight's ResizeObserver).
const entranceOf = (row: Element) => row.getAnimations().find((a) => (a as CSSAnimation).animationName === "row-in");
function stagger(list: HTMLElement) {
  [...list.children].forEach((row, i) => {
    const entrance = entranceOf(row);
    const delay = Math.min(i, 8) * 20;
    if (entrance && Number(entrance.currentTime) === 0 && Number(entrance.effect!.getTiming().delay) < delay)
      entrance.effect!.updateTiming({ delay });
  });
}

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
 * or removed), instead of popping. A row leaving through useListMotion shrinks it itself while the row is still in
 * place (`data-hold`), and the container follows a row entering. When it grows, each new row's entrance (row-in) waits until the
 * growing height has uncovered the whole row, so no row is seen cut off by the container's edge. Boxes marked data-slide (Wishlist price, range, link) glide to a new
 * column width and position when a row added, removed or edited changes the shared columns.
 */
/** `wash`: the alternating row bands fade out and in around row changes. */
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
      // A leaving row holds the card at the height it is shrinking to. Once its removal has landed (the hold is
      // released) the card continues from there, which is a no-op when the row's space was measured right.
      const held = outer.getAttribute("data-hold");
      if (held !== null) {
        if (boxHolds.get(outer)?.n) return void (last = next);
        outer.removeAttribute("data-hold");
        boxHolds.delete(outer);
        settle();
        last = Number(held);
      }
      if (next === last) return;
      const from = outer.style.height ? outer.getBoundingClientRect().height : last;
      last = next;
      // data-swap: a whole-list view switch (Wishlist range or sort) fades the list and resizes the card at once.
      if (reducedMotion() || outer.hasAttribute("data-swap") || Math.abs(from - next) < 1.5) return settle(); // offsetHeight rounds a subpixel gap (a row vs its empty note) up to 1px
      outer.style.overflow = "hidden";
      outer.style.height = `${from}px`;
      void outer.offsetHeight; // commit the start height before transitioning
      outer.style.height = `${next}px`;
      if (next < from) return;
      const top = outer.getBoundingClientRect().top;
      for (const row of inner.children) {
        const entrance = entranceOf(row);
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
    stagger(inner); // a list that mounts with its rows gets no mutation: Safari's delays on page load

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
      stagger(inner);
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

// The gap a row leaves (or takes) between its neighbours, besides its own height.
const gapOf = (el: HTMLElement) => parseFloat(getComputedStyle(el.parentElement!).rowGap) || 0;

// Where every child of the rows' lists is on the page now (visual: a row still gliding is measured where it is).
function positions(rows: Iterable<HTMLElement>) {
  const tops = new Map<HTMLElement, number>();
  for (const parent of new Set([...rows].map((r) => r.parentElement)))
    for (const c of parent?.children ?? []) tops.set(c as HTMLElement, c.getBoundingClientRect().top + window.scrollY);
  return tops;
}

// Shrinks the card (AutoHeight's outer box) by `d` while the leaving row is still in place; released by the hook
// once the row is removed (see `release`).
function shrinkBox(box: HTMLElement, d: number, delay: number) {
  const from = box.getBoundingClientRect().height;
  const hold = boxHolds.get(box) ?? { n: 0, to: from };
  hold.n++;
  hold.to -= d;
  boxHolds.set(box, hold);
  box.dataset.hold = String(hold.to);
  box.style.overflow = "hidden";
  box.getAnimations().forEach((a) => a.cancel());
  box.animate([{ height: `${from}px` }, { height: `${hold.to}px` }], { duration: MOVE, delay, easing: MOVE_EASE, fill: "forwards" });
}

// The card of a row that left and came back (a move) grows from the height it was held at to its natural one.
function growBox(box: HTMLElement, from: number) {
  box.removeAttribute("data-hold");
  boxHolds.delete(box);
  box.style.overflow = "";
  const to = box.getBoundingClientRect().height;
  if (Math.abs(to - from) < 1.5) return;
  box.style.overflow = "hidden";
  box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: MOVE, easing: MOVE_EASE }).finished
    .catch(() => {})
    .finally(() => (box.style.overflow = ""));
}

// Rows fade where they stand; row-in in globals.css is the reverse. Opacity and transform only: they stay
// on the compositor, while a filter would repaint the row over the glass card every frame.
const FADE_OUT: Keyframe[] = [
  { opacity: 1, transform: "none" },
  { opacity: 0, transform: "scale(0.97)" },
];
const FADE = { duration: 160, easing: EASE, fill: "forwards" } as const;
// Every list change takes the same time, 2 x MOVE, between the wash fading out and back in: a delete fades the row, then
// closes the space; an add opens the space, then fades the row in; a move fades the row out (QUICK), glides the rows (MOVE)
// and fades it in (QUICK).
const QUICK = 120;
const SWITCH = { ...FADE, duration: 120 }; // fadeAll: a view switch should feel instant
// A list's only row swaps with its empty note, which takes the same space, so it only fades.
const alone = (el: HTMLElement) => !el.previousElementSibling && !el.nextElementSibling;
const FADE_IN = MOVE; // starts once the space is open (after MOVE), like row-in in .auto-height

// A control that goes away with its view (Tasks' Week button) fades like a leaving row, then `remove` runs.
// Cancelling the fade (the control is wanted again) skips `remove`. It comes back with row-in from globals.css.
export function fadeOut(el: HTMLElement | null, remove: () => void) {
  if (!el || reducedMotion()) return remove();
  el.animate(FADE_OUT, FADE).finished.then(remove, () => {});
}

/**
 * Row motion for lists. Add, delete and move are one movement: the rows glide to their new places (MOVE) while the card
 * follows, and a row fades out where it stood (`leave`) or fades in once its space is open (`enter`).
 * `leave` fades a row out while the rows after it glide up over it, then calls `remove`;
 * `enter` (called just before the row is added) resolves when the row is in;
 * `move` leaves a row, runs `change` (the state update that puts it elsewhere) and enters it at its new place;
 * `fadeAll` fades every row out in place before a view switch.
 * Attach `rowRef(id)` to each row.
 */
export function useListMotion() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const entering = useRef(new Map<string, () => void>());
  const leaving = useRef(new WeakSet<HTMLElement>());
  // Rows that left for a move: they fade back in QUICK, like they faded out.
  const quick = useRef(new Set<string>());
  // Where the rows were when the next `enter` was called: they glide from there to where the commit puts them.
  const before = useRef<Map<HTMLElement, number> | null>(null);
  // What a leaving row holds in place (the rows after it have glided up, the card has shrunk) until it is removed.
  const held = useRef(new Map<HTMLElement, { glides: Animation[]; box: HTMLElement | null }>());

  // Lets go of a leaving row's hold. The commit that removed the row is already in place, so nothing moves.
  // Returns the card and the height it was held at when this was its last leaving row.
  const release = useCallback((el: HTMLElement) => {
    const h = held.current.get(el);
    if (!h) return;
    held.current.delete(el);
    h.glides.forEach((a) => a.cancel());
    const hold = h.box && boxHolds.get(h.box);
    if (!h.box || !hold) return;
    // The card stays held while another row is still leaving in it. AutoHeight then continues from the held height.
    if (--hold.n > 0) return;
    h.box.getAnimations().forEach((a) => a.cancel());
    return { box: h.box, from: hold.to };
  }, []);
  useLayoutEffect(() => {
    for (const el of held.current.keys()) if (!el.isConnected) release(el);
  });

  const seen = useRef(new WeakSet<HTMLElement>());
  const rowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (!el) return;
      nodes.current.set(id, el);
      if (!seen.current.has(el)) {
        seen.current.add(el);
        // Once in, a row stays put: React re-inserting it (a row moved above it, an Undo of an edit) would replay row-in.
        el.addEventListener("animationend", (e) => {
          if (e.target === el && e.animationName === "row-in") el.style.animation = "none";
        });
      }
      const done = entering.current.get(id);
      if (done) {
        entering.current.delete(id);
        // A row that moved (an edit) is the same element: drop its held exit before it enters again.
        el.getAnimations().forEach((a) => a.cancel());
        leaving.current.delete(el);
        delete el.dataset.leaving;
        const freed = release(el);
        el.style.pointerEvents = "";
        el.style.animation = "none"; // its own entrance replaces the stagger in globals.css
        // In a wash list the wash fades out while the row moves (nothing waits for it); the row sits out the
        // alternation until it is in, so no wash jumps to another row meanwhile.
        if (el.closest("[data-wash]")) el.dataset.entering = "";
        // The rows glide from where they were to where this commit put them, and the card follows.
        const from = before.current;
        before.current = null;
        // The wash fades out first, unless a leaving row (a move) already started that.
        const wait = el.closest("[data-wash]") && !el.parentElement?.hasAttribute("data-settling") ? WASH : 0;
        if (from) {
          for (const row of from.keys()) row.getAnimations().filter((a) => a.id === "glide").forEach((a) => a.cancel());
          for (const [row, top] of from) {
            const dy = top - (row.getBoundingClientRect().top + window.scrollY);
            if (row !== el && row.isConnected && Math.abs(dy) >= 1)
              row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { id: "glide", duration: MOVE, delay: wait, easing: MOVE_EASE, fill: "backwards" });
          }
          flipTiming(el, wait);
        }
        // A row that moved leaves the list as tall as before, so AutoHeight sees no change: the card grows back itself.
        if (freed) growBox(freed.box, freed.from);
        // A row fades in only once its space is fully open, so it is never seen clipped.
        el.animate([...FADE_OUT].reverse(), { duration: quick.current.delete(id) ? QUICK : FADE_IN, delay: wait + (alone(el) ? 120 : MOVE), easing: EASE, fill: "backwards" })
          .finished.catch(() => {}).finally(() => {
            delete el.dataset.entering;
            done();
          });
      }
      return () => {
        if (nodes.current.get(id) === el) nodes.current.delete(id);
      };
    },
    [release],
  );

  const enter = useCallback(
    (id: string) =>
      new Promise<void>((done) => {
        if (reducedMotion()) return done();
        entering.current.set(id, done);
        before.current = positions(nodes.current.values());
        // A row added outside the current filter never mounts; forget it so it does not glide later.
        // Long enough for pages that refetch the list before the row mounts (Tasks).
        setTimeout(() => entering.current.get(id) === done && (entering.current.delete(id), quick.current.delete(id), done()), 2000);
      }),
    [],
  );

  const leave = useCallback((id: string, remove: () => void, moving = false) => {
    const el = nodes.current.get(id);
    if (!el || reducedMotion()) return remove();
    if (leaving.current.has(el)) return; // a row still entering may leave
    leaving.current.add(el);
    el.style.pointerEvents = "none";
    // In a wash list the wash fades out first (WASH) and the row leaves after it. The row drops out of the
    // alternation (data-leaving) so the rows keep the bands they will have once it is removed.
    const list = el.closest("[data-wash]") ? el.parentElement! : null;
    const wait = list ? WASH : 0;
    let hold_ = 0;
    if (list) {
      el.dataset.leaving = "";
      hold(list, true);
      hold_ = holds.get(list)!;
    }
    const motion: Animation[] = [];
    const glides: Animation[] = [];
    let box: HTMLElement | null = null;
    // A delete fades the row first, then the rows glide up over it and the card shrinks; a move only fades the row
    // (the rows glide once it has been placed again, see `enter`). The row itself stays in place until `remove`.
    const fade = moving ? QUICK : MOVE;
    const glide = wait + fade;
    if (!alone(el) && !moving) {
      const d = el.offsetHeight + gapOf(el);
      for (let next = el.nextElementSibling; next; next = next.nextElementSibling)
        glides.push(next.animate([{ transform: "none" }, { transform: `translateY(${-d}px)` }], { duration: MOVE, delay: glide, easing: MOVE_EASE, fill: "forwards", composite: "add" }));
      box = el.closest<HTMLElement>(".auto-height");
      if (box) shrinkBox(box, d, glide);
      flipTiming(el);
      // A clock for the whole movement (translate is a property nothing else animates), so `remove` lands as it ends.
      motion.push(el.animate({ translate: ["0 0", "0 0"] }, { duration: MOVE, delay: glide }));
    }
    motion.push(el.animate(FADE_OUT, { ...FADE, duration: alone(el) ? FADE.duration : fade, delay: wait }));
    held.current.set(el, { glides, box });
    Promise.all(motion.map((a) => a.finished)).catch(() => {}).finally(() => {
      // The wash comes back as the movement ends, not after the commit that removes the row (a slow phone would
      // show a dead pause there). A move keeps it away: the row enters again next. A later hold takes over.
      if (list && !moving && holds.get(list) === hold_) delete list.dataset.settling;
      remove();
    });
  }, []);

  // Runs `change` (a state update that moves a row): the row leaves like a deleted one, then `change` puts it
  // at its new place, where it enters like an added row (the rows glide, then it fades in).
  const move = useCallback(
    (id: string, change: () => void) => {
      const el = nodes.current.get(id);
      const go = () => {
        void enter(id);
        change();
      };
      // Out like a delete (the row fades while its space closes), then in like an add (space opens, the row fades in).
      if (!el || reducedMotion() || alone(el)) return go();
      leave(id, () => (quick.current.add(id), go()), true);
    },
    [enter, leave],
  );

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

  return { rowRef, enter, leave, move, fadeAll, reorder };
}

/**
 * True once a page's rows have built one after another on load (700ms: the 11th row starts at 300ms and runs 260ms).
 * After that a view switch replaces the whole list at once (`swapIn`), so the list adds `built` to its class and
 * globals.css turns the rows' own entrance off.
 */
export function useBuilt() {
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBuilt(true), 700);
    return () => clearTimeout(t);
  }, []);
  return built;
}

/**
 * A view switch (range, sort, day, tab, muscle group) replaces the rows in one step: the card resizes at once and the
 * new list fades in as a whole, never row by row. Call it with the card that holds the list, just before the state
 * change that swaps the rows (after `fadeAll` has faded the old ones).
 */
export function swapIn(card: Element | null | undefined) {
  const box = card?.querySelector<HTMLElement>(".auto-height:has(> :is(.entries, .todo-list))");
  if (!box) return;
  box.dataset.swap = "";
  setTimeout(() => delete box.dataset.swap, 300);
  if (reducedMotion()) return;
  // React has committed by the next frame, before it paints.
  requestAnimationFrame(() =>
    box.querySelector(":scope > :is(.entries, .todo-list)")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE }),
  );
}

const PAGE = 10;

/**
 * A long list shows 10 rows; `more` (put it last inside the list's AutoHeight) adds 10 at a time.
 * The new rows enter with row-in while AutoHeight opens their space, like any added row.
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
 * row follows the pointer, the rows in between slide out of its way (the row's own transform transition), and on
 * drop `move(from, to)` reorders through `reorder` (useListMotion's) so the rows settle into place.
 * Spread the result on the handle; it needs `touch-action: none`.
 */
export function useDragSort(reorder: (change: () => void) => void, move: (from: number, to: number) => void) {
  const drag = useRef<{ rows: HTMLElement[]; i: number; to: number; y: number; tops: number[]; mids: number[]; step: number } | null>(null);

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
      tops: rects.map((r) => r.top),
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
    if (d.to === d.i) return settle(d.rows, d.i); // back to its place, sliding
    // The rows jump to their new places under the animation reorder starts from where they are now.
    reorder(() => {
      for (const r of d.rows) r.style.transition = "none";
      settle(d.rows, d.i);
      move(d.i, d.to);
    });
    requestAnimationFrame(() => d.rows.forEach((r) => (r.style.transition = "")));
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d) settle(d.rows, d.i);
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
