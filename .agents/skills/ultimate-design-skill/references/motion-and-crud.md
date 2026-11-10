# Lists, motion and add/edit/delete (the Wishlist pattern)

Copy this pattern for every list page. It is what the user approved in `app/wishlist/wishlist-client.tsx`. Other pages already follow it: Food categories and weight, Tasks, Gym days and routine, and the muscle map.

## Contents
- The parts
- Markup
- State
- Edit (with Undo) and moving rows
- Add (no Undo)
- Delete (with Undo)
- Switching the view
- Reordering in place (FLIP)
- Pages that refetch
- Rules that are easy to break

## The parts

**`AutoHeight`** (`app/components/list-motion.tsx`)

```tsx
<AutoHeight wash className="entries">{rows}</AutoHeight>
```

- Animates the list's height (180ms) and delays each new row until the height has uncovered it.
- Glides `data-slide` boxes to new columns.
- `wash` turns on the alternating band wash that fades out and back in around every change. Use it on the main card list of a page (Wishlist).

**`useListMotion()`** returns `{ rowRef, enter, leave, move, fadeAll, reorder }`; `move` returns a promise (resolved when the row has entered).

| Method | What it does |
|---|---|
| `rowRef(id)` | put on every row (and `rowRef("empty")` on the empty note) |
| `enter(id)` | call *before* adding the row to state: in a wash list the wash fades out (100ms), the rows below glide down (240ms), then the row fades in (240ms), then the wash returns |
| `leave(id, remove)` | in a wash list the wash fades out first (100ms); then the row fades out in place (240ms), then the rows below glide up (240ms); `remove` runs at the end and must drop it from state; the wash returns as the movement ends, not after the commit |
| `move(id, change)` | for an edit that changes the row's place: `move` = `leave` then `enter`, in the same total time as a delete or add (120 + 240 + 120): the wash fades out, the row fades out in place (120ms), `change` runs, the rows between glide to make space, the row fades in at the new place, the wash returns |

Add, delete and move share one animation: a FLIP glide of the siblings (`transform` only, 240ms `cubic-bezier(.4,0,.2,1)`) plus a row fade, and the card follows with one height animation. Never animate a row's height, margin or top. `data-hold` and `data-flip` on the card are set and cleared by the hook; in a wash list every animation starts after a 100ms wait (`--flip-delay` on the card), and a pure reorder still eases the held card back to its height (`growBox`).
| `fadeAll(then)` | every row fades together (120ms), then `then` switches the view |
| `reorder(change)` | FLIP: rows slide to new places (420ms), for drag sorting |

**`useAfterClose()`** (`app/components/modal.tsx`) returns `{ later, runAfterClose }`.
- `later(change)` holds a list change until the form has faded.
- `runAfterClose` runs held changes. It is the Modal's `onExited`, and is also called before reopening the form and at the start of an Undo.

**`useToast()`** (`app/components/toast.tsx`)

```ts
showToast({ message, type?: "info" | "success" | "warning", actionLabel?, onAction?, duration? }) // duration defaults to 5000ms
```

## Markup

```tsx
<AutoHeight wash className="entries">
  {visible.length === 0 ? (
    // Keyed like the rows: a reused note would keep fadeAll's faded-out state and stay invisible.
    <p key={`empty-${filter}`} ref={rowRef("empty")} className="empty-note">No items yet.</p>
  ) : (
    // Keyed by the view so every switch mounts fresh rows.
    <Fragment key={`${filter}-${sort}`}>
      {visible.map((item) => (
        <div key={item.id} ref={rowRef(item.id)} className="entry-row">
          <strong>{item.name}</strong>
          <span className="badge badge-info number-tabular" data-slide>{price}</span>
          <div className="item-actions">
            <button type="button" className="delete-icon-btn edit" onClick={() => openForm(item)}
              aria-label={`Edit ${item.name}`} title="Edit"><PencilIcon size={17} /></button>
            <button type="button" className="delete-icon-btn" onClick={() => handleRemove(item)}
              aria-label={`Delete ${item.name}`} title="Delete"><TrashIcon size={17} /></button>
          </div>
        </div>
      ))}
    </Fragment>
  )}
</AutoHeight>
```

## State

```tsx
const [filter, setFilter] = useState("all");       // the control: changes at once
const [view, setView] = useState({ range: "all", sort: "newest" }); // the rows: change after the fade
const { rowRef, enter, leave, move, fadeAll } = useListMotion();
const { later, runAfterClose } = useAfterClose();
// Undo runs from a toast seconds later, so it reads the list and view as they are then.
const latest = useRef({ items, view });
useEffect(() => { latest.current = { items, view }; });
```

## Edit (with Undo) and moving rows

```tsx
// Writes an edited item into the list. If that moves it, it enters its new place like a deleted item put
// back by Undo. If the edit takes it out of the current filter, it leaves like a delete.
function replace(to: Item) {
  const { items: now, view: v } = latest.current;
  const order = (list: Item[]) => list.filter(inView(v)).sort(SORT_BY[v.sort]).map((i) => i.id);
  const after = order(now.map((i) => (i.id === to.id ? to : i)));
  const write = () => setItems((prev) => prev.map((i) => (i.id === to.id ? to : i)));
  if (order(now).indexOf(to.id) === after.indexOf(to.id)) return write();
  if (after.includes(to.id)) move(to.id, write);
  else leave(to.id, write);
}

// in handleSubmit, after the server returned `updated`:
const before = items.find((i) => i.id === editingId);
later(() => replace(updated));
showToast({
  message: `Saved "${updated.name}"`,
  type: "success",
  ...(before && {
    actionLabel: "Undo",
    // Writes the old values back; if that fails the edit stays, so the screen matches the database.
    onAction: async () => {
      runAfterClose(); // the edit first, if the form is still closing
      replace(before);
      const back = await updateAction(before.id, toInput(before)).catch(() => null);
      if (!back?.success) {
        replace(updated);
        showToast({ message: "Failed to undo the edit", type: "warning" });
      }
    },
  }),
});
setIsModalOpen(false);
```

## Add (no Undo)

```tsx
later(() => {
  enter(added.id);              // before the add, so the row's space opens first
  setItems((prev) => [added, ...prev]);
});
// No Undo: a new item is one tap from Delete.
showToast({ message: `Added "${added.name}"`, type: "success" });
setIsModalOpen(false);
```

## Delete (with Undo)

```tsx
const putBack = (item: Item) => {
  enter(item.id);
  setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
};
const dropRow = (id: string) => leave(id, () => setItems((prev) => prev.filter((i) => i.id !== id)));

// Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
function handleRemove(target: Item) {
  const deleted = deleteAction(target.id).then((res) => res.success !== false, () => false);
  // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
  const gone = new Promise<void>((done) =>
    leave(target.id, () => { setItems((prev) => prev.filter((i) => i.id !== target.id)); done(); }),
  );
  showToast({
    message: `Removed "${target.name}"`,
    actionLabel: "Undo",
    // Same id and date, so the row comes back where it was.
    onAction: async () => {
      await gone;
      putBack(target);
      if (!(await deleted)) return; // the delete never happened
      const back = await restoreAction({ ...toInput(target), id: target.id, createdAt: target.createdAt })
        .catch(() => null);
      if (!back?.success) {
        dropRow(target.id);
        showToast({ message: "Failed to restore item", type: "warning" });
      }
    },
  });
  void Promise.all([deleted, gone]).then(([ok]) => {
    if (ok) return;
    putBack(target);
    showToast({ message: "Failed to remove item", type: "warning" });
  });
}
```

The restore server action:
- takes the original `id` and `createdAt`;
- is owner-scoped;
- has its own authorization tests (owner allowed, other user denied, anonymous denied).

## Switching the view

```tsx
function switchRange(next) {
  if (next === filter) return;
  setFilter(next);                                       // the segmented thumb moves at once
  fadeAll(() => setView((v) => ({ ...v, range: next }))); // old rows fade, then new rows build
}
function switchSort(next) {
  setSort(next);
  fadeAll(() => setView((v) => ({ ...v, sort: next })));
}
function openForm(item?) {
  runAfterClose(); // reopened before the last close finished
  // ...reset the fields from `item`...
  setIsModalOpen(true);
}
```

- A selection that switches a list does the same: the muscle map's group chips go through `fadeAll(() => setSelectedNow(g))`.
- Every filter, sort or selection change fades out first; none swaps rows instantly.

## Reordering in place

A tick that re-sorts a list is a `move`, like a Wishlist edit that changes position: wash out, the row fades while its space closes, space opens at the new place, the row fades in, wash in. Ticking a task moves it below the open ones, at the top of the done ones (most recently completed first). If the sort leaves the row where it is, the state is written at once. `move` returns a promise that resolves once the row has entered, so the refetch after the write waits for it (otherwise the server's answer replaces the list mid-fade):

```tsx
const write = () => setTodos((prev) => update(prev, id, done).sort(compareTodos));
const placed = indexBefore === indexAfter ? write() : move(id, write);
// ...server call..., then: await placed; await refetch();
```

`reorder(change)` (FLIP slide, 420ms) is only for drag sorting (Gym routine rows).

Marking done has no Undo and no toast with Undo.

A secret the browser never sees back (the Claude token on Settings) has no Undo either: Disconnect and a token change show a plain success toast, because there is nothing client-side to restore.

## Pages that refetch

Some pages (Tasks) reload the list from the server after a write. `enter(id)` waits up to 2s for the row to mount, so call it with the new id before the refetch lands. A row added outside the current filter never mounts and is forgotten after 2s.

## Long lists (More)

The Wishlist is the exception: it always shows every item and has no More button.

A list that can grow past 10 rows shows 10: `const [shown, more] = useMore(list)` at the top of the component (before any early return), map `shown`, and put `{more}` as the last child inside the list's `AutoHeight` (inside its keyed `Fragment` if it has one). More is a `btn-sm tint more-btn`, centred, with its top gap measured from the highlight band (not the row or the button) and the same gap below, and each press adds 10 rows while the list grows. Counts, totals and charts keep using the whole list. A select with a fixed set of values (the shopping Unit) is a native `select` like Category, never a text field with suggestions.

## Rules that are easy to break

**Ordering**
- Call `enter` **before** the state update that adds the row, or the row appears without its space animation.
- Do the list change inside `later()` when it comes from a modal form. Never change the list while the form is still closing.

**Keys and refs**
- Give rows a stable `key` and `rowRef(id)` with the same id. Wrap them in a `Fragment` keyed by the view.
- Key the empty note per view, and give it `ref={rowRef("empty")}` so it fades in and out like a row.
- A renamed row keeps its key (Food categories map each name to a stable `cat:` key), so a rename is a `move`, not a leave plus an enter.
- Every list is `<AutoHeight wash className="entries">` with `rowRef` rows, short lists such as Categories included. Two exceptions keep the row motion without the wash:
  - the Gym day editor's exercises are `--surface-solid` filled field cards (radius .85rem, no visible border) in a modal (`<AutoHeight className="routine-list">`), not rows;
  - the Shopping list is grouped by category: `<AutoHeight className="shopping-groups">` (a grid, row-gap 1.25rem) of `.shopping-group` sections, each a `rowRef` keyed by its category's stable key, so its alternating band is plain CSS (`.surface .shopping-group > .shopping-row`). A row that is its group's only one leaves or enters with its whole group (`shopKey`), so a header never pops; an item that changes group leaves, then enters at its new place. Its rows stagger per group through `sibling-index()` only, so in Safari they appear at once;
  - Gym Training days are a `<AutoHeight className="split-day-list">` of selectable `--surface-solid` cards (radius .85rem, padding .5rem .75rem .5rem 1rem, gap .6rem). The seven days never change, so there is no wash; a `--tint-subtle` fill marks the selected day.

**Animation**
- Never animate rows with `filter`, `box-shadow`, `height` in CSS transitions, or `animation-fill-mode: both`. Opacity and transform only; `useListMotion` does height and padding with WAAPI.
- Inside `AutoHeight`, space below content is padding, never margin: a child's bottom margin collapses out of the measured box, so the height animation ends short and jumps.
- Respect `prefers-reduced-motion`. The helpers already return immediately, so do not add your own animations around them.

**Optimistic updates and Undo**
- Toasts and row exits never wait for the network.
- Every failure path restores what the user sees and shows a `warning` toast naming what failed. Inside an open form, the failure goes to the form's `.error` instead and the form stays open.
- A form whose result changes the list (add, rename, merge, delete) wraps that change in `later()` and passes `onExited={runAfterClose}` to its Modal.
- A dialog that is not a form but changes the list (Tasks Move) does the same: its change goes through `later()` and its Modal gets `onExited={runAfterClose}`.
- A picker dialog that stays open while you use it (Food "Past foods") is the exception: each row has a `PlusIcon` 17 `.delete-icon-btn.edit` titled "Log" (aria-label "Log {name}, {kcal} kcal"), and a logged row leaves the picker at once with no `later()`, since the dialog does not close. When nothing is left it shows an `.empty-note`.
- A chat message that fails to send is taken back: its bubble is removed, the text returns to the input, and a `warning` toast says `Failed to send message`. Never answer with a fake assistant message.
- A dialog's content lives in its own state, separate from its open flag (`moving` + `moveOpen`, `catEdit` + `catOpen`): closing sets only the flag, so the content stays while the dialog fades instead of going blank. Call `runAfterClose()` before reopening.
- An Undo started while a row is still leaving must `await gone` first.
- An Undo of an edit calls `runAfterClose()` first, because the form may still be closing.
- An edit that takes a row off the list on screen (Tasks: a move to another day) makes the row leave like a delete after the form closes; its Undo awaits that exit, then puts the row back with `enter`.
- New rows go on top of the list (Tasks: open tasks newest first; done tasks still sink below them).

Sources: `app/wishlist/wishlist-client.tsx`, `app/components/list-motion.tsx`, `app/components/modal.tsx`, `app/components/toast.tsx`, `app/todos/todos-client.tsx`, `app/gym/muscle-map.tsx`.

## Reorder by dragging, round checks, session bands (Gym)

- Reorder: a grip handle (`GripIcon`, `.drag-handle`) starts `useDragSort`; rows carry `data-sort`. The dragged row follows the pointer; the other rows slide by the dragged row's height plus the gap with the normal transition; on drop the list reorders as a FLIP (`reorder`) with transitions off for one frame. Any position, not one step at a time. No autoscroll yet.
- Every checkbox is the round `.todo-checkbox-btn` look, Gym included.
- A screen of rows (the workout session) gets the same wash striping as lists, so rows are easy to tell apart.
- Exit and Cancel live in the session footer (`.session-exit`); Cancel always asks first; an exited workout shows a Resume bar.
