"use client";

import { Fragment, useState, useSyncExternalStore, type ReactNode } from "react";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, reorderCategoriesAction, revertCategoryAction } from "@/app/actions/categories";
import type { CategoryScope } from "@/lib/validations/categories";
import { AddButton, Card, EmptyNote, Field, FormModal, GroupLabel, SelectField } from "./blocks";
import { ChevronRightIcon } from "./icons";
import { DragHandle, ListBox, RowActions, useDragSort, useKeepPlace } from "./lists";
import { useToast } from "./toast";

/** What a list's categories are saved with. Wishlist and Tasks share one table per scope; Health's shopping list has its own. */
export interface CategoriesApi {
  /** Keeps this list's heading id apart from the other lists on the page. */
  id: string;
  /** What the card is about, in the card title, buttons and toasts: "category" (default) or "unit". */
  noun?: string;
  /** The built-in fallback name that cannot be added, renamed or deleted ("other"; "pcs" for units). */
  builtIn?: string;
  add: (name: string) => Promise<{ success: boolean }>;
  rename: (from: string, to: string) => Promise<{ success: boolean; change?: Change | null }>;
  remove: (name: string) => Promise<{ success: boolean; change?: Change | null }>;
  revert: (input: { name: string; current: string; dropCurrent: boolean } & Change) => Promise<{ success: boolean }>;
  reorder: (names: string[]) => Promise<{ success: boolean }>;
}

/** The api of a scope-based list (Wishlist, or a Tasks space). */
export const scopedCategories = (scope: CategoryScope): CategoriesApi => ({
  id: scope,
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Folded or open stays as the user left it, across pages and reloads.
  const [isFolded, toggleFolded] = useFolded("categories");

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
      showToast({ message: `Failed to move ${noun}`, type: "warning" });
      return;
    }
    showToast({
      message: `Moved "${next[to]}"`,
      type: "success",
      onUndo: async () => {
        reorder(previous);
        const back = await api.reorder(previous).catch(() => null);
        if (!back?.success) {
          reorder(next);
          showToast({ message: "Failed to undo", type: "warning" });
        }
      },
    });
  }
  const dragRow = useDragSort(move);

  function openForm(edit: string | null) {
    setError("");
    setFrom(edit);
    setName(edit ?? "");
    setOpen(true);
  }

  // Puts a renamed or deleted category and exactly its items back. The screen changes first; a failure undoes that.
  async function revert(name: string, current: string, change: Change, dropCurrent: boolean, at: number) {
    const put = () => {
      onChange((prev) => {
        const without = dropCurrent ? prev.filter((c) => c !== current) : prev;
        return without.includes(name) ? without : [...without.slice(0, at), name, ...without.slice(at)];
      });
      onRefile(current, name, change.itemIds);
    };
    put();
    const back = await api.revert({ name, current, dropCurrent, ...change }).catch(() => null);
    onSynced?.();
    if (!back?.success) {
      onChange((prev) => (current === builtIn ? prev.filter((c) => c !== name) : prev.map((c) => (c === name ? current : c))));
      onRefile(name, current, change.itemIds);
      showToast({ message: "Failed to undo", type: "warning" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const to = name.trim().toLowerCase();
    if (!to) return;
    if (to === from) return setOpen(false);
    if (to === builtIn) return setError(`Please pick a name other than "${builtIn}".`);
    setError("");
    setBusy(true);
    try {
      if (from === null) {
        if (!(await api.add(to)).success) return setError(`"${to}" already exists.`);
        onChange((prev) => [...prev, to]);
        showToast({
          message: `Added "${to}"`,
          type: "success",
          onUndo: async () => {
            onChange((prev) => prev.filter((c) => c !== to));
            const gone = await api.remove(to).catch(() => null);
            onSynced?.();
            if (!gone?.success) {
              onChange((prev) => (prev.includes(to) ? prev : [...prev, to]));
              showToast({ message: "Failed to undo", type: "warning" });
              return;
            }
            // Items filed under it since go to the fallback, like any delete.
            onRefile(to, builtIn);
          },
        });
      } else {
        const res = await api.rename(from, to);
        if (!res.success || !res.change) throw new Error("Category not found");
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
          onUndo: () => revert(from, to, change, !change.merged, at),
        });
      }
      setOpen(false);
    } catch {
      setError(`Failed to save ${noun}`);
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
    if (!res?.success || !res.change) {
      onChange((prev) => (prev.includes(cat) ? prev : [...prev.slice(0, at), cat, ...prev.slice(at)]));
      if (moved) onRefile(builtIn, cat, moved);
      onSynced?.();
      showToast({ message: `Failed to remove ${noun}`, type: "warning" });
      return;
    }
    const change = res.change;
    onRefile(cat, builtIn);
    onSynced?.();
    showToast({
      message: `Removed "${cat}"; its items are in ${categoryLabel(builtIn)}`,
      onUndo: () => revert(cat, builtIn, change, false, at),
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
            <div key={cat} className="entry-row" data-sort>
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
              <RowActions onEdit={() => openForm(cat)} onDelete={() => remove(cat)} editLabel={`Edit ${noun} ${cat}`} deleteLabel={`Delete ${noun} ${cat}`} />
            </div>
          ))}
        </ListBox>
      </Card>

      <FormModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={from ? `Edit ${noun}` : `New ${noun}`}
        onSubmit={submit}
        error={error}
        busy={busy}
        canSubmit={!!name.trim()}
      >
        <Field label="Name" type="text" maxLength={50} disabled={busy} value={name} onChange={(e) => setName(e.target.value)} required />
        {from && <p className="muted move-hint">Its items move along. An existing name merges the two.</p>}
      </FormModal>
    </>
  );
}

/** Category order for a grouped list: the user's list, any category an item has that the list lacks, and "other" last. */
export const groupOrder = (categories: string[], items: { category: string }[]) => [
  ...new Set([...categories, ...items.map((i) => i.category).filter((c) => c !== "other"), "other"]),
];

const FOLD_STORAGE = "lt-folded";
let foldedKeys: ReadonlySet<string> | null = null; // read from storage on first use in the browser
const foldListeners = new Set<() => void>();
const noFolds: ReadonlySet<string> = new Set();

const loadFolded = (): ReadonlySet<string> => {
  if (!foldedKeys) {
    try {
      foldedKeys = new Set<string>(JSON.parse(localStorage.getItem(FOLD_STORAGE) ?? "[]"));
    } catch {
      foldedKeys = new Set(); // storage blocked or corrupt: folds last until the page reloads
    }
  }
  return foldedKeys;
};

const toggleFolded = (key: string) => {
  const next = new Set(loadFolded());
  if (!next.delete(key)) next.add(key);
  foldedKeys = next;
  try {
    localStorage.setItem(FOLD_STORAGE, JSON.stringify([...next]));
  } catch {}
  foldListeners.forEach((l) => l());
};

const subscribeFolded = (l: () => void) => {
  foldListeners.add(l);
  return () => void foldListeners.delete(l);
};

/**
 * Which category groups of a list are folded, kept in this browser so a group stays folded across pages and reloads.
 * `page` keeps pages apart; the caller keys each group by its tab too, so tabs fold independently.
 */
export function useFolded(page: string) {
  const folded = useSyncExternalStore(subscribeFolded, loadFolded, () => noFolds);
  return [(key: string) => folded.has(`${page}/${key}`), (key: string) => toggleFolded(`${page}/${key}`)] as const;
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
