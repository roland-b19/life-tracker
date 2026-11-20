"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, reorderCategoriesAction, revertCategoryAction } from "@/actions/categories";
import type { CategoryScope } from "@/lib/validations/categories";
import type { Answer } from "@/lib/validations/result";
import { AddButton, Card, EmptyNote, Field, FormModal, GroupLabel, SelectField } from "./blocks";
import { useDeviceState } from "./device-state";
import { ChevronRightIcon } from "./icons";
import { DragHandle, ListBox, RowActions, useDragSort, useKeepPlace } from "./lists";
import { useOnce } from "./once";
import { undoWith, useToast } from "./toast";

/** What a list's categories are saved with. Wishlist and Tasks share one table per scope; Health's shopping list has its own. */
export interface CategoriesApi {
  /** Keeps this list's heading id apart from the other lists on the page. */
  id: string;
  /** What the card is about, in the card title, buttons and toasts: "category" (default) or "unit". */
  noun?: string;
  /** The built-in fallback name that cannot be added, renamed or deleted ("other"; "pcs" for units). */
  builtIn?: string;
  /**
   * The `touches` keys of the card's Undo toasts (D-040): `category` names a category's row as "<table>:<what
   * identifies it>" (categories have no row id: the name does it, with the scope where one table holds several lists),
   * and `items` is the table of the items a rename or delete re-files.
   */
  keys: { category: (name: string) => string; items: string };
  add: (name: string) => Promise<Answer>;
  rename: (from: string, to: string) => Promise<Answer<{ change: Change }>>;
  remove: (name: string) => Promise<Answer<{ change: Change }>>;
  /** `keptCurrent`: the server kept `current`, because an item was filed under it after the rename. */
  revert: (input: { name: string; current: string; dropCurrent: boolean } & Change) => Promise<Answer<{ keptCurrent?: boolean }>>;
  reorder: (names: string[]) => Promise<Answer>;
}

/** The api of a scope-based list (Wishlist, or a Tasks space). */
export const scopedCategories = (scope: CategoryScope): CategoriesApi => ({
  id: scope,
  keys: { category: (name) => `item_categories:${scope}/${name}`, items: scope === "wishlist" ? "wishlist_items" : "todos" },
  add: (name) => addCategoryAction({ scope, name }),
  rename: (from, to) => renameCategoryAction({ scope, from, to }),
  remove: (name) => deleteCategoryAction({ scope, name }),
  revert: (input) => revertCategoryAction({ scope, ...input }),
  reorder: (names) => reorderCategoriesAction({ scope, names }),
});

interface Props {
  api: CategoriesApi;
  categories: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  /** The page re-files its items: a rename (merging onto an existing name included) or a delete (to "other"). `only` limits it to those item ids (Undo). */
  onRefile: (from: string, to: string, only?: string[]) => void;
  /** Called once the server has saved a change or an Undo, so a page that reads its items from the server reads them after it. */
  onSynced?: () => void;
  /** The ids of the items on screen in a category. With it a delete moves the items at once, not after the server answers; a failed delete moves exactly those back. */
  idsIn?: (category: string) => string[];
}

/** What a rename or delete reported moving, as the server sent it. */
interface Change {
  sortOrder: number;
  itemIds: string[];
  merged: boolean;
  /** Where the server had put repeating tasks before filing them on top of the new category; sent back so Undo restores them. */
  before?: { id: string; placedAt: string }[];
}

/** The card that adds, renames and deletes the categories of one list (Wishlist, or a Tasks space). */
export function CategoriesCard({ api, categories, onChange, onRefile, onSynced, idsIn }: Props) {
  const { showToast } = useToast();
  const noun = api.noun ?? "category";
  const builtIn = api.builtIn ?? "other";
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // Folded or open stays as the user left it, across pages and reloads.
  const [isFolded, toggleFolded] = useFolded("categories");
  // A Delete acts once per tap burst (D-043): the rest of a double tap on the tapped Delete is swallowed, so it neither
  // repeats the write nor lands on the next row's Delete, which slid into its place. Save gets the same from FormModal.
  const once = useOnce();
  // The button last tapped in a row, set before its own handler runs.
  const tappedButton = useRef<Element | null>(null);
  // What an Undo toast touches: these categories' rows and the items it re-filed.
  const touches = (names: string[], itemIds: string[] = []) => [
    ...names.map(api.keys.category),
    ...itemIds.map((id) => `${api.keys.items}:${id}`),
  ];

  const [card, keepPlace] = useKeepPlace<HTMLElement>(categories);
  const reorder = (update: string[]) => {
    keepPlace();
    onChange(() => update);
  };

  // The new order shows at once (the pages list their items in it too); a failed save puts the old one back, and Undo saves it again.
  async function move(from: number, to: number) {
    const next = [...categories];
    next.splice(to, 0, ...next.splice(from, 1));
    const previous = categories;
    reorder(next);
    const res = await api.reorder(next).catch(() => null);
    if (!res?.success) {
      reorder(previous);
      showToast({ message: why(res, `Failed to move ${noun}`), type: "warning" });
      return;
    }
    showToast({
      message: `Moved "${next[to]}"`,
      type: "success",
      // A move saves the whole list's order.
      touches: touches(next),
      onUndo: undoWith(
        showToast,
        async () => {
          reorder(previous);
          const back = await api.reorder(previous).catch(() => null);
          if (!back?.success) reorder(next);
          return back;
        },
        undoFailed,
      ),
    });
  }
  const dragRow = useDragSort(move);

  function openForm(edit: string | null) {
    setErrorMsg("");
    setFrom(edit);
    setName(edit ?? "");
    setOpen(true);
  }

  // Puts a renamed or deleted category and exactly its items back. The screen changes first; a failure takes back exactly
  // what it changed (never a name that was not on screen), so no orphan category shows.
  const revert = (name: string, current: string, change: Change, dropCurrent: boolean, at: number) =>
    undoWith(
      showToast,
      async () => {
        // Filled in by the update below, which React has run by the time the server answers.
        let added = false;
        let droppedAt = -1;
        onChange((prev) => {
          droppedAt = dropCurrent ? prev.indexOf(current) : -1;
          const without = droppedAt >= 0 ? prev.filter((c) => c !== current) : prev;
          added = !without.includes(name);
          return added ? [...without.slice(0, at), name, ...without.slice(at)] : without;
        });
        onRefile(current, name, change.itemIds);
        const back = await api.revert({ name, current, dropCurrent, ...change }).catch(() => null);
        onSynced?.();
        if (!back?.success) {
          onChange((prev) => insertAt(added ? prev.filter((c) => c !== name) : prev, current, droppedAt));
          onRefile(name, current, change.itemIds);
        } else if (back.keptCurrent) {
          // The server kept it right after the restored one.
          onChange((prev) => insertAt(prev, current, prev.indexOf(name) + 1));
        }
        return back;
      },
      undoFailed,
    );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    return save();
  }

  async function save() {
    const to = name.trim().toLowerCase();
    if (!to) return;
    if (to === from) return setOpen(false);
    if (to === builtIn) return setErrorMsg(`Please pick a name other than "${builtIn}".`);
    setErrorMsg("");
    setBusy(true);
    try {
      if (from === null) {
        const added = await api.add(to);
        if (!added.success) return setErrorMsg(added.error);
        onChange((prev) => [...prev, to]);
        showToast({
          message: `Added "${to}"`,
          type: "success",
          touches: touches([to]),
          onUndo: undoWith(
            showToast,
            async () => {
              // Filled in by the update below; a failure puts it back only where it was, and only if it was on screen.
              let was = -1;
              onChange((prev) => {
                was = prev.indexOf(to);
                return prev.filter((c) => c !== to);
              });
              const gone = await api.remove(to).catch(() => null);
              onSynced?.();
              if (!gone?.success) onChange((prev) => insertAt(prev, to, was));
              // Items filed under it since go to the fallback, like any delete.
              else onRefile(to, builtIn);
              return gone;
            },
            undoFailed,
          ),
        });
      } else {
        const res = await api.rename(from, to);
        if (!res.success) return setErrorMsg(res.error);
        const change = res.change;
        const at = categories.indexOf(from);
        onRefile(from, to);
        onSynced?.();
        onChange((prev) =>
          prev.includes(to) ? prev.filter((c) => c !== from) : prev.map((c) => (c === from ? to : c)),
        );
        showToast({
          message: `Renamed "${from}" to "${to}"`,
          type: "success",
          touches: touches([from, to], change.itemIds),
          onUndo: revert(from, to, change, !change.merged, at),
        });
      }
      setOpen(false);
    } catch {
      setErrorMsg(`Failed to save ${noun}`);
    } finally {
      setBusy(false);
    }
  }

  // The row leaves, its items move to Other and the toast shows at once; a failed delete puts them back. Undo re-files exactly the items
  // that moved to Other.
  async function remove(cat: string) {
    const at = categories.indexOf(cat);
    const moved = idsIn?.(cat);
    onChange((prev) => prev.filter((c) => c !== cat));
    if (moved) onRefile(cat, builtIn, moved);
    const res = await api.remove(cat).catch(() => null);
    if (!res?.success) {
      onChange((prev) => insertAt(prev, cat, at));
      if (moved) onRefile(builtIn, cat, moved);
      onSynced?.();
      showToast({ message: why(res, `Failed to remove ${noun}`), type: "warning" });
      return;
    }
    const change = res.change;
    onRefile(cat, builtIn);
    onSynced?.();
    showToast({
      message: `Removed "${cat}"; its items are in ${categoryLabel(builtIn)}`,
      touches: touches([cat], change.itemIds),
      onUndo: revert(cat, builtIn, change, false, at),
    });
  }

  return (
    <>
      <Card
        ref={card}
        id={`categories-title-${api.id}`}
        title={noun === "unit" ? "Units" : "Categories"}
        count={categories.length}
        fold={{ folded: isFolded(api.id), onToggle: () => toggleFolded(api.id) }}
        actions={<AddButton onClick={() => openForm(null)}>Add {noun}</AddButton>}
      >
        <ListBox wash className="entries">
          {categories.length === 0 && <EmptyNote>No {noun === "unit" ? "units" : "categories"} yet.</EmptyNote>}
          {categories.map((cat, i) => (
            <div key={cat} className="entry-row" data-sort onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
              <DragHandle
                label={`Drag ${cat} to reorder`}
                {...dragRow}
                onKeyDown={(e) => {
                  const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
                  if (to < 0 || to >= categories.length) return;
                  e.preventDefault();
                  move(i, to);
                }}
              />
              <span className={`category-name${noun === "unit" ? " raw" : ""}`}>{cat}</span>
              <RowActions onEdit={() => openForm(cat)} onDelete={() => once(() => remove(cat), tappedButton.current)} editLabel={`Edit ${noun} ${cat}`} deleteLabel={`Delete ${noun} ${cat}`} />
            </div>
          ))}
        </ListBox>
      </Card>

      <FormModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={from ? `Edit ${noun}` : `New ${noun}`}
        onSubmit={submit}
        error={errorMsg}
        busy={busy}
        canSubmit={!!name.trim()}
      >
        <Field label="Name" type="text" disabled={busy} value={name} onChange={(e) => setName(e.target.value)} required />
        {from && <p className="muted move-hint">Its items move along. An existing name merges the two.</p>}
      </FormModal>
    </>
  );
}

/** Category order for a grouped list: the user's list, any category an item has that the list lacks, and "other" last. */
export const groupOrder = (categories: string[], items: { category: string }[]) => [
  ...new Set([...categories, ...items.map((i) => i.category).filter((c) => c !== "other"), "other"]),
];

/** What a refused write shows: the server's own message, or `fallback` when no answer came (D-040). */
const why = (answer: Answer<object> | null, fallback: string) => (answer && !answer.success ? answer.error : fallback);
const undoFailed = (back: Answer<object> | null) => why(back, "Failed to undo");

/** `list` with `name` put back at `at` (clamped to the list), unless `at` is negative or the name is there already. */
const insertAt = (list: string[], name: string, at: number) =>
  at < 0 || list.includes(name) ? list : [...list.slice(0, at), name, ...list.slice(at)];

const noFolds: string[] = [];

/**
 * Which category groups of a list are folded, kept on this device (`useDeviceState`, key "lt-folded": every folded
 * "page/group") so a group stays folded across pages and reloads. `page` keeps pages apart; the caller keys each group
 * by its tab too, so tabs fold independently.
 */
export function useFolded(page: string) {
  const [folded, setFolded] = useDeviceState("lt-folded", noFolds);
  return [
    (key: string) => folded.includes(`${page}/${key}`),
    (key: string) => {
      const id = `${page}/${key}`;
      setFolded((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
    },
  ] as const;
}

/** A category title in a grouped list: press it to fold or unfold the group's rows; the arrow after the text shows which. */
function GroupToggle({ name, folded, onToggle }: { name: string; folded: boolean; onToggle: () => void }) {
  return (
    <GroupLabel>
      <button type="button" className="group-toggle" aria-expanded={!folded} onClick={onToggle}>
        {categoryLabel(name)}
        <ChevronRightIcon size={14} />
      </button>
    </GroupLabel>
  );
}

/**
 * Rows grouped under category titles with fold: Wishlist, the Tasks daily list and the Health shopping list all draw their
 * rows through this. `items` arrive with each category together; `row` draws one row; `wrap` puts a div of that class around
 * each group (the shopping list's cards); `grouped: false` draws the rows alone (Tasks outside the daily list).
 */
export function GroupedList<T extends { id: string; category: string }>({
  items,
  isFolded,
  onToggle,
  row,
  wrap,
  grouped = true,
}: {
  items: T[];
  isFolded: (category: string) => boolean;
  onToggle: (category: string) => void;
  row: (item: T) => ReactNode;
  wrap?: string;
  grouped?: boolean;
}) {
  if (!grouped) return items.map((item) => <Fragment key={item.id}>{row(item)}</Fragment>);
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0].category === item.category) last.push(item);
    else groups.push([item]);
  }
  return groups.map((group) => {
    const category = group[0].category;
    const body = (
      <>
        <GroupToggle name={category} folded={isFolded(category)} onToggle={() => onToggle(category)} />
        {!isFolded(category) && group.map((item) => <Fragment key={item.id}>{row(item)}</Fragment>)}
      </>
    );
    return wrap ? <div key={category} className={wrap}>{body}</div> : <Fragment key={category}>{body}</Fragment>;
  });
}

/** "gifts" → "Gifts": categories are stored lower case and shown with a capital. */
const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/** The Category drop-down of an item's form: the list's categories, the item's own if the list lacks it, and Other. */
export function CategoryField({
  categories,
  value,
  onChange,
  disabled,
}: {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
  disabled?: boolean;
}) {
  return (
    <SelectField
      label="Category"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[...new Set([...categories, value, "other"])].map((c) => ({ value: c, label: categoryLabel(c) }))}
    />
  );
}
