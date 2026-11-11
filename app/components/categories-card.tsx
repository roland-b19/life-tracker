"use client";

import { useState } from "react";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction } from "@/app/actions/categories";
import type { CategoryScope } from "@/lib/validations/categories";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { AutoHeight, useListMotion, useMore } from "./list-motion";
import { Modal, useAfterClose } from "./modal";
import { useToast } from "./toast";

interface Props {
  scope: CategoryScope;
  categories: string[];
  onChange: (update: (prev: string[]) => string[]) => void;
  /** The page re-files its items: a rename (merging onto an existing name included) or a delete (to "other"). */
  onRefile: (from: string, to: string) => void;
}

/** The card that adds, renames and deletes the categories of one list (Wishlist, or a Tasks space). */
export function CategoriesCard({ scope, categories, onChange, onRefile }: Props) {
  const { showToast } = useToast();
  const { rowRef, enter, leave, move } = useListMotion();
  const { later, runAfterClose } = useAfterClose();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(null); // outlives the close, so the dialog keeps its content while it fades
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, more] = useMore(categories);
  // A row keeps its key when renamed, so it glides to its new place instead of being replaced.
  const [keys] = useState(() => new Map<string, string>());
  const keyOf = (cat: string) => {
    if (!keys.has(cat)) keys.set(cat, `cat:${cat}`);
    return keys.get(cat)!;
  };

  function openForm(edit: string | null) {
    runAfterClose(); // reopened before the last close finished
    setError("");
    setFrom(edit);
    setName(edit ?? "");
    setOpen(true);
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
        later(() => {
          void enter(keyOf(to));
          onChange((prev) => [...prev, to]);
        });
        showToast({ message: `Added "${to}"`, type: "success" });
      } else {
        if (!(await renameCategoryAction({ scope, from, to })).success) throw new Error("Category not found");
        later(() => {
          onRefile(from, to);
          if (categories.includes(to)) return leave(keyOf(from), () => onChange((prev) => prev.filter((c) => c !== from)));
          keys.set(to, keyOf(from));
          keys.delete(from);
          void move(keyOf(to), () => onChange((prev) => prev.map((c) => (c === from ? to : c))));
        });
        showToast({ message: `Renamed "${from}" to "${to}"`, type: "success" });
      }
      setOpen(false);
    } catch {
      setError("Failed to save category");
    } finally {
      setBusy(false);
    }
  }

  // Like a row delete: the row leaves and the toast shows at once and a failed delete puts it back. No Undo:
  // the server merges its items into Other, so a restore could not tell them apart.
  function remove(cat: string) {
    const at = categories.indexOf(cat);
    const deleted = deleteCategoryAction({ scope, name: cat }).then((r) => r.success, () => false);
    const gone = new Promise<void>((done) =>
      leave(keyOf(cat), () => {
        onChange((prev) => prev.filter((c) => c !== cat));
        done();
      }),
    );
    onRefile(cat, "other");
    showToast({ message: `Removed "${cat}"; its items are in Other` });
    void Promise.all([deleted, gone]).then(([ok]) => {
      if (ok) return;
      void enter(keyOf(cat));
      onChange((prev) => (prev.includes(cat) ? prev : [...prev.slice(0, at), cat, ...prev.slice(at)]));
      showToast({ message: "Failed to remove category", type: "warning" });
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
        <AutoHeight wash className="entries">
          {categories.length === 0 && (
            <p key="cat-empty" ref={rowRef("cat:empty")} className="empty-note">No categories yet.</p>
          )}
          {shown.map((cat) => (
            <div key={keyOf(cat)} ref={rowRef(keyOf(cat))} className="entry-row">
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
        </AutoHeight>
      </section>

      <Modal isOpen={open} onClose={() => setOpen(false)} onExited={runAfterClose} title={from ? "Edit category" : "New category"}>
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

/** "gifts" → "Gifts": categories are stored lower case and shown with a capital. */
export const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
