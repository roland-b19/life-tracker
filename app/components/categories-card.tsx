"use client";

import { useState } from "react";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, revertCategoryAction } from "@/app/actions/categories";
import type { CategoryScope } from "@/lib/validations/categories";
import { ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { ListBox, useMore } from "./lists";
import { Modal } from "./modal";
import { useToast } from "./toast";

interface Props {
  scope: CategoryScope;
  categories: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  /** The page re-files its items: a rename (merging onto an existing name included) or a delete (to "other"). `only` limits it to those item ids (Undo). */
  onRefile: (from: string, to: string, only?: string[]) => void;
}

/** What a rename or delete reported moving, as the server sent it. */
interface Change {
  sortOrder: number;
  itemIds: string[];
  merged: boolean;
}

/** The card that adds, renames and deletes the categories of one list (Wishlist, or a Tasks space). */
export function CategoriesCard({ scope, categories, onChange, onRefile }: Props) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, more] = useMore(categories);

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
    const back = await revertCategoryAction({ scope, name, current, dropCurrent, ...change }).catch(() => null);
    if (!back?.success) {
      onChange((prev) => (current === "other" ? prev.filter((c) => c !== name) : prev.map((c) => (c === name ? current : c))));
      onRefile(name, current, change.itemIds);
      showToast({ message: "Failed to undo", type: "warning" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const to = name.trim().toLowerCase();
    if (!to) return;
    if (to === from) return setOpen(false);
    if (to === "other") return setError('Please pick a name other than "other".');
    setError("");
    setBusy(true);
    try {
      if (from === null) {
        if (!(await addCategoryAction({ scope, name: to })).success) return setError(`"${to}" already exists.`);
        onChange((prev) => [...prev, to]);
        showToast({
          message: `Added "${to}"`,
          type: "success",
          actionLabel: "Undo",
          onAction: async () => {
            onChange((prev) => prev.filter((c) => c !== to));
            const gone = await deleteCategoryAction({ scope, name: to }).catch(() => null);
            if (!gone?.success) {
              onChange((prev) => (prev.includes(to) ? prev : [...prev, to]));
              showToast({ message: "Failed to undo", type: "warning" });
              return;
            }
            // Items filed under it since go to Other, like any delete.
            onRefile(to, "other");
          },
        });
      } else {
        const res = await renameCategoryAction({ scope, from, to });
        if (!res.success || !res.change) throw new Error("Category not found");
        const change = res.change;
        const at = categories.indexOf(from);
        onRefile(from, to);
        onChange((prev) =>
          prev.includes(to) ? prev.filter((c) => c !== from) : prev.map((c) => (c === from ? to : c)),
        );
        showToast({
          message: `Renamed "${from}" to "${to}"`,
          type: "success",
          actionLabel: "Undo",
          onAction: () => revert(from, to, change, !change.merged, at),
        });
      }
      setOpen(false);
    } catch {
      setError("Failed to save category");
    } finally {
      setBusy(false);
    }
  }

  // The row leaves and the toast shows at once; a failed delete puts it back. Undo re-files exactly the items
  // that moved to Other.
  async function remove(cat: string) {
    const at = categories.indexOf(cat);
    onChange((prev) => prev.filter((c) => c !== cat));
    const res = await deleteCategoryAction({ scope, name: cat }).catch(() => null);
    if (!res?.success || !res.change) {
      onChange((prev) => (prev.includes(cat) ? prev : [...prev.slice(0, at), cat, ...prev.slice(at)]));
      showToast({ message: "Failed to remove category", type: "warning" });
      return;
    }
    const change = res.change;
    onRefile(cat, "other");
    showToast({
      message: `Removed "${cat}"; its items are in Other`,
      actionLabel: "Undo",
      onAction: () => revert(cat, "other", change, false, at),
    });
  }

  return (
    <>
      <section className="surface" aria-labelledby={`categories-title-${scope}`}>
        <div className="section-head">
          <h2 id={`categories-title-${scope}`} className="section-title">
            Categories <span className="muted number-tabular">{categories.length}</span>
          </h2>
          <button type="button" className="btn-sm tint" onClick={() => openForm(null)}>
            <PlusIcon size={14} />
            Add category
          </button>
        </div>
        <ListBox wash className="entries">
          {categories.length === 0 && (
            <p className="empty-note">No categories yet.</p>
          )}
          {shown.map((cat) => (
            <div key={cat} className="entry-row">
              <span className="category-name">{cat}</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={() => openForm(cat)}
                  aria-label={`Edit category ${cat}`}
                  title="Edit"
                >
                  <PencilIcon size={17} />
                </button>
                <button
                  type="button"
                  className="delete-icon-btn"
                  onClick={() => remove(cat)}
                  aria-label={`Delete category ${cat}`}
                  title="Delete"
                >
                  <TrashIcon size={17} />
                </button>
              </div>
            </div>
          ))}
          {more}
        </ListBox>
      </section>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={from ? "Edit category" : "New category"}>
        <form onSubmit={submit}>
          <div className="form-stack">
            <label>
              Name
              <input type="text" maxLength={50} disabled={busy} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            {from && <p className="muted move-hint">Its items move along. An existing name merges the two.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Category order for a grouped list: the user's list, any category an item has that the list lacks, and "other" last. */
export const groupOrder = (categories: string[], items: { category: string }[]) => [
  ...new Set([...categories, ...items.map((i) => i.category).filter((c) => c !== "other"), "other"]),
];

/** Which category groups of a list are folded; they stay folded across its tabs until the page is left. */
export function useFolded() {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return [folded, toggle] as const;
}

/** A category title in a grouped list: press it to fold or unfold the group's rows; the arrow shows which. */
export function GroupToggle({ name, folded, onToggle }: { name: string; folded: boolean; onToggle: () => void }) {
  return (
    <h3 className="group-label">
      <button type="button" className="group-toggle" aria-expanded={!folded} onClick={onToggle}>
        <ChevronRightIcon size={14} />
        {categoryLabel(name)}
      </button>
    </h3>
  );
}

/** "gifts" → "Gifts": categories are stored lower case and shown with a capital. */
export const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
