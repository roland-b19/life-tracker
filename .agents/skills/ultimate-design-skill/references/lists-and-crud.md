# Lists and add/edit/delete with Undo (the Wishlist pattern)

Copy this pattern for every list page (`app/wishlist/wishlist-client.tsx`). Other pages follow it: Food categories and weight, Tasks, Gym days and routine, Settings.

**There is no motion anywhere** (decision 2026-11-11), except the Tasks progress ring and the Wishlist total count-up (`animated-number.tsx`). Rows, modals and toasts appear, change and disappear instantly. Never add a CSS `transition`, `animation` or `@keyframes`, a view transition, smooth scrolling, a WAAPI/rAF tween or another counting number.

## Contents
- The parts
- Markup
- Add (with Undo)
- Edit (with Undo)
- Delete (with Undo)
- Every other action (with Undo)
- Switching the view
- Long lists (More)
- Rules that are easy to break
- Reorder by dragging, round checks, session bands (Gym)

## The parts

**`ListBox`** (`app/components/lists.tsx`) is the layout box around a list. It only holds the rows' bands; it does nothing else.

```tsx
<ListBox wash className="entries">{rows}</ListBox>
```

- `wash` turns on the alternating band (every even row gets white .03). It is plain CSS, so adding or removing a row re-stripes the list at once.

**`useMore(list)`** (same file) returns `[shown, more]`: 10 rows, plus a More button that adds 10 more.

**`useDragSort(move)`** (same file): drag a row by its handle (`data-sort` rows). The dragged row follows the pointer, the rows in between step aside, and on drop `move(from, to)` reorders. Rows jump to their place; nothing glides.

**`Modal`** (`app/components/modal.tsx`) opens and closes at once. It has no exit callback: a list change from a form simply runs when the form saves, right after `setIsModalOpen(false)`.

**`useToast()`** (`app/components/toast.tsx`)

```ts
showToast({ message, type?: "info" | "success" | "warning", actionLabel?, onAction?, duration? }) // duration defaults to 5000ms
```

## Markup

```tsx
<ListBox wash className="entries">
  {visible.length === 0 ? (
    <p className="empty-note">No items yet.</p>
  ) : (
    visible.map((item) => (
      <div key={item.id} className="entry-row">
        <strong>{item.name}</strong>
        <span className="badge badge-info number-tabular">{price}</span>
        <div className="item-actions">
          <button type="button" className="delete-icon-btn edit" onClick={() => openForm(item)}
            aria-label={`Edit ${item.name}`} title="Edit"><PencilIcon size={17} /></button>
          <button type="button" className="delete-icon-btn" onClick={() => handleRemove(item)}
            aria-label={`Delete ${item.name}`} title="Delete"><TrashIcon size={17} /></button>
        </div>
      </div>
    ))
  )}
</ListBox>
```

## The Undo rule

**Every action that changes something shows a toast with an Undo button, and Undo puts the previous state back:**

| Action | Undo does |
|---|---|
| create | deletes what was created |
| delete | restores it with the same data (same id and `createdAt` where the restore action takes them) |
| edit | writes the old values back |
| toggle (tick, bought) | toggles back |
| quick tap (+250 ml, a set) | removes or reverts it |
| category rename / delete | reverts exactly the items that moved (`revertCategory`, `revertShoppingCategory`) |
| a secret the browser cannot read back (Claude token) | sends the previous ciphertext back to a restore action that validates it |

- Reuse the existing restore and revert actions. A new server action ships an authorization test (owner allowed, other user denied; anonymous is covered by the glob test in `tests/actions-anonymous.test.ts`).
- Undo puts the screen back first and writes after. When the server re-creates the item with a new id (meals, gym sets, weigh-ins, shopping items) it comes back when the server answers.
- Every Undo has a failure path: if writing the old values back fails, the screen is put back to match the database and a warning toast says `Failed to undo` / `Failed to undo the edit` / `Failed to restore item`.
- An Undo that cannot be safe says so instead of guessing: starting a workout is undone only while it has no sets (`Sets are logged; use Cancel workout instead`); a custom exercise is removed only if no routine or set uses it (`Failed to undo: the exercise is already in use`).
- An action with no user effect on data (a background carry-over) has no toast and no Undo.

## Add (with Undo)

```tsx
const added = res.item;
setItems((prev) => [added, ...prev]);
showToast({
  message: `Added "${added.name}"`,
  type: "success",
  actionLabel: "Undo",
  onAction: async () => {
    setItems((prev) => prev.filter((i) => i.id !== added.id));
    const gone = await deleteAction(added.id).catch(() => null);
    if (!gone || gone.success === false) {
      setItems((prev) => (prev.some((i) => i.id === added.id) ? prev : [added, ...prev]));
      showToast({ message: "Failed to undo", type: "warning" });
    }
  },
});
setIsModalOpen(false);
```

Adding onto something that already exists is an edit: the Undo restores the old amount (`"X" is now 2 kg`).

## Edit (with Undo)

```tsx
// Writes an edited item into the list in place.
const replace = (to: Item) => setItems((prev) => prev.map((i) => (i.id === to.id ? to : i)));

// in handleSubmit, after the server returned `updated`:
const before = items.find((i) => i.id === editingId);
replace(updated);
showToast({
  message: `Saved "${updated.name}"`,
  type: "success",
  ...(before && {
    actionLabel: "Undo",
    // Writes the old values back; if that fails the edit stays, so the screen matches the database.
    onAction: async () => {
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

A list that is sorted or filtered re-sorts when the state changes; the row simply is in its new place.

## Delete (with Undo)

```tsx
const putBack = (item: Item) =>
  setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
const dropRow = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

// Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
async function handleRemove(target: Item) {
  dropRow(target.id);
  const deleted = deleteAction(target.id).then((res) => res.success !== false, () => false);
  showToast({
    message: `Removed "${target.name}"`,
    actionLabel: "Undo",
    // Same id and date, so the row comes back where it was.
    onAction: async () => {
      putBack(target);
      if (!(await deleted)) return; // the delete never happened
      const back = await restoreAction({ ...toInput(target), id: target.id, createdAt: target.createdAt }).catch(() => null);
      if (!back?.success) {
        dropRow(target.id);
        showToast({ message: "Failed to restore item", type: "warning" });
      }
    },
  });
  if (!(await deleted)) {
    putBack(target);
    showToast({ message: "Failed to remove item", type: "warning" });
  }
}
```

The restore server action takes the original `id` and `createdAt`, is owner-scoped and has its own authorization tests.

## Switching the view

A filter, sort or selection change just switches the rows:

```tsx
const [filter, setFilter] = useState("all");
const [sort, setSort] = useState("newest");
const visible = items.filter(inView(filter)).sort(SORT_BY[sort]);
```

Nothing fades; the control and the rows change in the same render. The page keeps its scroll position: `.list-box` has `overflow-anchor: none`, so the browser does not pull the page up to follow a row that moved. `Segmented` also puts the page back in a layout effect, because Safari on iPhone ignores `overflow-anchor`. Only a list too short to fill the page moves it, and then its end sits at the bottom of the screen.

## Long lists (More)

The Wishlist and the Tasks lists always show every item and have no More button. A list that can grow past 10 rows shows 10: `const [shown, more] = useMore(list)` at the top of the component (before any early return), map `shown`, and put `{more}` as the last child inside the `ListBox`. More is a `btn-sm tint more-btn`, centred, with its top gap measured from the highlight band and the same gap below; each press adds 10 rows. Counts, totals and charts keep using the whole list. A select with a fixed set of values (the shopping Unit) is a native `select`, never a text field with suggestions.

## Rules that are easy to break

**Structure**
- Rows have a stable `key`. A renamed row keeps its key (Food categories map each name to a stable `cat:` key).
- Every list is `<ListBox wash className="entries">`, short lists such as Categories included. Exceptions without the wash:
  - the Gym day editor's exercises are `--surface-solid` filled field cards (radius .85rem, no visible border) in a modal (`.routine-list`), not rows;
  - the Shopping list is grouped by category: `.shopping-groups` (a grid, row-gap 1.25rem) of `.shopping-group` sections, so the alternating band is plain CSS (`.surface .shopping-group > .shopping-row`); an item that changes group simply shows in its new group;
  - Gym Training days are a `.split-day-list` of selectable `--surface-solid` cards (radius .85rem, padding .5rem .75rem .5rem 1rem, gap .6rem). The seven days never change, so there is no wash; a `--tint-subtle` fill marks the selected day.
- Space below content inside a list is padding, never margin (a collapsing margin would clip the last band).
- New rows go on top of the list (Tasks: open tasks newest first; done tasks sort below them).
- Pages that refetch after a write (Tasks, Gym days) write the old values first for Undo and show them with the refresh; on failure only the warning toast shows.

**Optimistic updates and Undo**
- Toasts and row exits never wait for the network.
- Every failure path restores what the user sees and shows a `warning` toast naming what failed. Inside an open form, the failure goes to the form's `.error` instead and the form stays open.
- A picker dialog that stays open while you use it (Food "Past foods") is the exception to closing: each row has a `PlusIcon` 17 `.delete-icon-btn.edit` titled "Log" (aria-label "Log {name}, {kcal} kcal"), and a logged row leaves the picker at once. Its toast has Undo too. When nothing is left it shows an `.empty-note`.
- A chat message that fails to send is taken back: its bubble is removed, the text returns to the input, and a `warning` toast says `Failed to send message`. Never answer with a fake assistant message. Meals the Assistant logged show an Undo that removes them.
- A dialog's content lives in its own state, separate from its open flag (`moving` + `moveOpen`, `catEdit` + `catOpen`), so closing never blanks the content mid-close.

Sources: `app/wishlist/wishlist-client.tsx`, `app/components/lists.tsx`, `app/components/modal.tsx`, `app/components/toast.tsx`, `app/todos/todos-client.tsx`, `app/gym/muscle-map.tsx`.

## Reorder by dragging, round checks, session bands (Gym)

- Reorder: a grip handle (`GripIcon`, `.drag-handle`) starts `useDragSort`; rows carry `data-sort`. The dragged row follows the pointer; the rows in between step aside by the dragged row's height plus the gap; on drop the list reorders at once. Any position, not one step at a time. No autoscroll yet.
- Every checkbox is the round `.todo-checkbox-btn` look, Gym included.
- A screen of rows (the workout session) gets the same wash striping as lists, so rows are easy to tell apart.
- Exit and Cancel live in the session footer (`.session-exit`); Cancel always asks first; an exited workout shows a Resume bar.

## Category groups

A list with categories (Wishlist in every tab, the Tasks daily list) shows its rows under category titles. A title is a `GroupToggle` (`categories-card.tsx`): the title keeps the plain title look, with an arrow after the text (right when folded, down when open), and the whole title is the button (its tap area is widened with `::before`, so nothing moves). State is `useFolded()`, keyed by tab too (Wishlist by price range, Tasks by space and tab), so every tab folds on its own; totals still count folded rows. Every group has its title, even when a tab has one category (or only Other). The Categories card sits under the Items section. The first title of Wishlist, Tasks and the Health shopping list has 0.5rem above it. The Health shopping list folds the same way (`useFolded`, one key per category). The task Reminder field and badge show only where push is on (`isPushEnabled()`), so not on the Vercel deploy. A More-menu link (Settings) leaves the menu open until the new page arrives, so the old page never shows through. In the tab bar a pressed link sets `target` so the bar's thumb goes straight to the chosen page, not back to the current one first.

## Reordering categories

The Categories card (`categories-card.tsx`, Wishlist and Tasks; the Health shopping Categories card does the same with `reorderShoppingCategoriesAction`) copies the Gym reorder: a `GripIcon` `.drag-handle` button first in each `.entry-row[data-sort]`, then the name, then the edit and delete buttons. The handle also takes ArrowUp/ArrowDown. A move updates the screen at once, saves the order (`reorderCategoriesAction`), and shows `Moved "x"` with an Undo that writes the previous order back; on failure the screen is restored with a warning. The items list under the same page groups by this order (`groupOrder`). The page must not move while dragging: `useDragSort` blocks touch panning, and the card keeps its screen position across the reorder and Undo (`useKeepPlace` in `lists.tsx`).

On a phone the Tasks sections run Progress, Tasks, Last x days, Categories (the two column wrappers are `display: contents` there and each card has an `order`).

## One shared structure per repeated piece

A new page reuses these; it never copies their markup. Change the piece, every page follows.

- **`RowActions`** (`lists.tsx`): the Edit + Delete icon pair at the end of a row. `className` for the wrapper (`row-actions`, `item-actions`), `bare` for no wrapper, `deleteTitle` for "Disconnect"-like wording.
- **`GroupedList`** (`categories-card.tsx`): rows under category titles with folding. Give it `items` (each has `id` and `category`), `isFolded`/`onToggle` from `useFolded(page)`, a `row` renderer and optionally `wrap` (a class around each group) or `grouped={false}` (rows only). Wishlist, Tasks and the Health shopping list all use it.
- **`useFolded(page)`**: which category titles are folded, kept in `localStorage["lt-folded"]`, so a closed category stays closed after navigating away and back, on every page.
- **`CategoriesCard`** takes a `CategoriesApi` (`id`, `add`, `rename`, `remove`, `revert`, `reorder`). `scopedCategories(scope)` builds it for Wishlist and Tasks; Health passes its shopping-category actions. Add, rename, delete, drag reorder and Undo live only here.
- **Check order** (`src/lib/check-order.ts`, `compareChecked`, `compareShopping`): unchecked rows first; ticking puts a row at the top of the checked ones; unticking puts it at the bottom of the unchecked ones (after rows nobody touched), not back where it was. Tasks (`completedAt`, same-day only) and the Health shopping list (`checked_at`) use it. Wishlist has no checks.
- **`blocks.tsx`** (page and form structures): `Page`, `CenterCard` (sign-in, error, not found), `Toolbar`, `Dashboard` (`even` for two equal columns) with `DashboardMain` and `DashboardAside`, `Card` (title, icon, count, actions), `Banner`, `Hint`, `EmptyNote`, `SkeletonRows`, `StatRow`, `BigNumber`, `ProgressBar`, `Badge`, `AddButton`, `TintButton`, `Checkbox`, `Field`, `Toggle`, `FieldPair`, `DateField`, `SortSelect`, `SelectField`, `FormActions`, `FormModal`, `DayStepper`, `ChartControls`. A page is these pieces plus its data; it never writes the markup again.
- **Buttons in rows** (`lists.tsx`): `IconButton`, `EditButton`, `DeleteButton`, `DragHandle`; `RowActions` is built from them.
- **Undo**: every toast that can be undone is `showToast({ message, onUndo })`.
- The few structures left inline on purpose are listed in `docs/decisions.md` (2026-11-11, "One shared component per UI structure").

