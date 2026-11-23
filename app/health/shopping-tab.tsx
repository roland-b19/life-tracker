"use client";

import { useRef, useState } from "react";
import { compareShopping } from "@/lib/check-order";
import { formatAmount, formatNumber } from "@/lib/number-format";
import { visible } from "@/lib/validations/common";
import { MAX_CLEARED, SHOPPING_ITEM_GONE } from "@/lib/validations/food";
import { AddButton, Card, Checkbox, Dashboard, EmptyNote, Field, FieldPair, FormModal, SelectField, SmallButton, type FormOpening } from "../components/blocks";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { ListBox, RowActions } from "../components/lists";
import { CategoriesCard, CategoryField, GroupedList, useFolded, type CategoriesApi } from "../components/categories-card";
import {
  addShoppingCategoryAction,
  addShoppingItemAction,
  clearBoughtItemsAction,
  deleteShoppingCategoryAction,
  deleteShoppingItemAction,
  renameShoppingCategoryAction,
  reorderShoppingCategoriesAction,
  revertShoppingCategoryAction,
  restoreShoppingItemsAction,
  toggleShoppingItemAction,
  unmergeShoppingItemAction,
  updateShoppingItemAction,
} from "@/actions/food";

/** Health's shopping categories live in their own table; the shared Categories card saves through these. */
const shoppingNames = (kind: "category" | "unit"): CategoriesApi => ({
  id: kind === "unit" ? "units" : "shopping",
  noun: kind,
  builtIn: kind === "unit" ? "pcs" : "other",
  keys: { category: (name) => `${kind === "unit" ? "shopping_units" : "shopping_categories"}:${name}`, items: "shopping_items" },
  add: (name) => addShoppingCategoryAction({ kind, name }),
  rename: (from, to) => renameShoppingCategoryAction({ kind, from, to }),
  remove: (name) => deleteShoppingCategoryAction({ kind, name }),
  revert: (input) => revertShoppingCategoryAction({ kind, ...input }),
  reorder: (names) => reorderShoppingCategoriesAction({ kind, names }),
});
const shoppingCategories = shoppingNames("category");
const shoppingUnitsApi = shoppingNames("unit");

export interface ShoppingItemData {
  id: string;
  name: string;
  amount: string;
  unit: string;
  category: string;
  isBought: boolean;
  /** When the box last changed; null if it never did. */
  checkedAt: Date | string | null;
}

/** What a shopping toast touches (D-040): the items' rows. */
const touches = (ids: string[]) => ids.map((id) => `shopping_items:${id}`);

/** The Shopping tab: its list, its two Categories cards and its form. It stays mounted when another tab shows, so an edit still in flight keeps its state. */
export function ShoppingTab({
  active,
  initialItems,
  initialCategories,
  initialUnits,
}: {
  active: boolean;
  initialItems: ShoppingItemData[];
  initialCategories: string[];
  initialUnits: string[];
}) {
  const { showToast } = useToast();
  const warn = (message: string) => showToast({ message, type: "warning" });
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShoppingItemData | null>(null);
  // The edit form closes when another device deletes its item.
  const [shoppingList, setShoppingList] = useServerState(initialItems, {
    editing: isShopModalOpen ? (editingShop?.id ?? null) : null,
    onDeleted: () => setIsShopModalOpen(false),
  });
  const [categories, setCategories] = useServerState(initialCategories);
  const [units, setUnits] = useServerState(initialUnits);
  // A tick or a Delete acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);
  // Items deleted one by one since the last Clear bought: it purges them for good, so its toast takes their Undos too.
  const offList = useRef(new Set<string>());
  const [errorMsg, setErrorMsg] = useState("");
  // Shopping input state
  const [shopName, setShopName] = useState("");
  const [shopAmount, setShopAmount] = useState("1");
  const [shopUnit, setShopUnit] = useState("pcs");
  const [shopCategory, setShopCategory] = useState("other");
  // Walking order, unknown categories after the user's own, "other" last.
  const shopCategories = [...new Set([...categories, ...shoppingList.map((i) => i.category).filter((c) => c !== "other"), "other"])].filter(
    (c) => shoppingList.some((i) => i.category === c),
  );
  const [isShopFolded, toggleShop] = useFolded("shopping");
  const allShopping = shopCategories.flatMap((c) => shoppingList.filter((i) => i.category === c).sort(compareShopping));

  const toShopInput = (i: ShoppingItemData) => ({
    name: i.name,
    amount: Number(i.amount),
    unit: i.unit,
    category: i.category,
  });

  function openShopForm(item: ShoppingItemData | null) {
    setErrorMsg("");
    setEditingShop(item);
    setShopName(item?.name ?? "");
    setShopAmount(item ? String(Number(item.amount)) : "1");
    setShopUnit(item?.unit ?? "pcs");
    setShopCategory(item?.category ?? "other");
    setIsShopModalOpen(true);
  }

  const upsertShop = (item: ShoppingItemData) =>
    setShoppingList((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]));
  const dropShop = (id: string) => setShoppingList((prev) => prev.filter((i) => i.id !== id));

  /**
   * Adds an item; the server adds the amount to the same item (name and unit) when it is already on the list, which then
   * takes the new category (D-042) and the add's id. The id is the form opening's, so a repeat of the same add after a
   * lost answer adds nothing (D-040): the server answers the row the first one made, and the toast says it was already
   * added, without an Undo (whether that add merged is no longer known). Answers the refusal, or "" once added.
   */
  async function addShopping(id: string, input: { name: string; amount: number; unit: string; category: string }) {
    const res = await addShoppingItemAction({ id, ...input }).catch(() => null);
    if (!res?.success) return res?.error ?? "Failed to add item";
    const item = res.item as ShoppingItemData;
    const before = res.before as ShoppingItemData | null;
    if (before) dropShop(before.id);
    upsertShop(item);
    showToast(
      res.repeated
        ? { message: `Already added "${item.name}"`, type: "success", touches: touches([item.id]) }
        : !before
        ? {
            message: `Added "${item.name}"`,
            type: "success",
            touches: touches([item.id]),
            onUndo: undoWith(
              showToast,
              async () => {
                dropShop(item.id);
                const gone = await deleteShoppingItemAction(item.id).catch(() => null);
                // An item already off the list (deleted or merged on another device) stays off the screen.
                if (!gone?.success && gone?.error !== SHOPPING_ITEM_GONE) upsertShop(item);
                return gone;
              },
              (back) => (back && !back.success ? back.error : "Failed to undo"),
            ),
          }
        : {
            message: "Merged with existing item",
            type: "success",
            touches: touches([item.id, before.id]),
            // The row the add replaced comes back under its own id; a refusal (the item deleted or changed since) says why.
            onUndo: undoWith(
              showToast,
              async () => {
                dropShop(item.id);
                upsertShop(before);
                const back = await unmergeShoppingItemAction({
                  id: item.id,
                  before: { ...toShopInput(before), id: before.id, isBought: before.isBought, checkedAt: before.checkedAt },
                }).catch(() => null);
                if (!back?.success) {
                  dropShop(before.id);
                  if (back?.error !== SHOPPING_ITEM_GONE) upsertShop(item);
                }
                return back;
              },
              (back) => (back && !back.success ? back.error : "Failed to undo the merge"),
            ),
          },
    );
    return "";
  }

  // Writes an edited item into the list; the bought state stays as it is on screen.
  const replaceShop = (to: ShoppingItemData) =>
    setShoppingList((prev) => prev.map((i) => (i.id === to.id ? { ...to, isBought: i.isBought, checkedAt: i.checkedAt } : i)));

  async function handleShopSubmit(e: React.FormEvent, { id, stillOpen }: FormOpening) {
    e.preventDefault();
    const input = {
      name: shopName.trim(),
      // The number field hands over the machine value ("1.5"); empty means one.
      amount: shopAmount.trim() === "" ? 1 : Number(shopAmount),
      unit: shopUnit.trim() || "pcs",
      category: shopCategory.trim().toLowerCase() || "other",
    };
    if (!visible(input.name)) return;
    // The server checks the limits; its message shows in the form, which keeps what was typed.
    setErrorMsg("");
    // A refusal shows in the form while it is on screen, else as a toast.
    const refused = (message: string) => (stillOpen() ? setErrorMsg(message) : warn(message));

    if (!editingShop) {
      const refusal = await addShopping(id, input);
      if (refusal) refused(refusal);
      else if (stillOpen()) setIsShopModalOpen(false);
      return;
    }
    const before = editingShop;
    const res = await updateShoppingItemAction({ ...input, id: before.id }).catch(() => null);
    if (!res?.success) {
      if (res?.error !== SHOPPING_ITEM_GONE) return refused(res?.error ?? "Failed to save item");
      // Deleted on another device: the form closes and the row leaves.
      if (stillOpen()) setIsShopModalOpen(false);
      dropShop(before.id);
      return warn(res.error);
    }
    const item = res.item as ShoppingItemData;
    replaceShop(item);
    if (stillOpen()) setIsShopModalOpen(false);
    showToast({
      message: `Saved "${item.name}"`,
      type: "success",
      touches: touches([item.id]),
      // Writes the old values back; if that fails the edit stays, so the screen matches the database.
      onUndo: undoWith(
        showToast,
        async () => {
          replaceShop(before);
          const back = await updateShoppingItemAction({ ...toShopInput(before), id: before.id }).catch(() => null);
          if (!back?.success) replaceShop(item);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
      ),
    });
  }

  /** The shared Categories card re-files the items: a rename or delete moves them, Undo moves `only` back. */
  const refile = (from: string, to: string, only?: string[]) =>
    setShoppingList((prev) => prev.map((i) => (i.category === from && (!only || only.includes(i.id)) ? { ...i, category: to } : i)));

  const refileUnit = (from: string, to: string, only?: string[]) =>
    setShoppingList((prev) => prev.map((i) => (i.unit === from && (!only || only.includes(i.id)) ? { ...i, unit: to } : i)));

  // What a restore answered: the rows now on the list. A row that merged into one with its name and unit leaves the screen (D-042).
  function showRestored(ids: string[], items: ShoppingItemData[], merged: number) {
    const back = new Set(items.map((i) => i.id));
    setShoppingList((prev) => [...prev.filter((i) => !ids.includes(i.id) && !back.has(i.id)), ...items]);
    if (merged > 0) showToast({ message: "Merged with existing item", type: "success", touches: touches([...back]) });
  }

  /** Undo of a tick sends the time the box had before, so the row goes back to its old place. */
  function handleToggleShopping(item: ShoppingItemData) {
    const next = !item.isBought;
    const setBought = (isBought: boolean, checkedAt: Date | string | null) =>
      setShoppingList((prev) => prev.map((i) => (i.id === item.id ? { ...i, isBought, checkedAt } : i)));
    setBought(next, new Date());
    const saved = toggleShoppingItemAction({ id: item.id, isBought: next }).catch(() => null);
    showToast({
      message: next ? `Bought "${item.name}"` : `"${item.name}" is back on the list`,
      type: "success",
      touches: touches([item.id]),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          setBought(!next, item.checkedAt);
          const done = await saved;
          if (!done?.success) return true; // the failure path below put it back
          const back = await toggleShoppingItemAction({ id: item.id, isBought: !next, checkedAt: item.checkedAt }).catch(() => null);
          if (!back?.success) setBought(next, done.item.checkedAt);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
      ),
    });
    // An item no longer on the list (merged or deleted on another device) leaves the screen, with the server's reason.
    void saved.then((res) => {
      if (res?.success) return;
      if (res?.error === SHOPPING_ITEM_GONE) dropShop(item.id);
      else setBought(!next, item.checkedAt);
      warn(res?.error ?? "Failed to update item");
    });
    return saved;
  }

  function handleDeleteShoppingItem(item: ShoppingItemData) {
    // The row leaves at once; the server delete runs alongside, so the tap never waits on the network.
    dropShop(item.id);
    offList.current.add(item.id);
    const saved = deleteShoppingItemAction(item.id).catch(() => null);
    showToast({
      message: `Removed "${item.name}"`,
      touches: touches([item.id]),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)?.success) return true; // the failure path below puts it back
          upsertShop(item);
          const back = await restoreShoppingItemsAction({ itemIds: [item.id] }).catch(() => null);
          if (back?.success) showRestored([item.id], back.items as ShoppingItemData[], back.merged);
          else dropShop(item.id);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore item"),
      ),
    });
    void saved.then((res) => {
      if (res?.success) return;
      if (res?.error !== SHOPPING_ITEM_GONE) upsertShop(item);
      warn(res?.error ?? "Failed to remove item");
    });
    return saved;
  }

  // Like a delete: the rows leave and the toast shows at once; a failed clear puts them back. More than one clear takes
  // is refused before anything changes. The server deletes for good what was taken off the list before (the last
  // batch, the items deleted since), so the toast touches those too and their older toasts lose their Undo.
  function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    if (!cleared.length) return;
    if (cleared.length > MAX_CLEARED) return warn(`Clear bought takes at most ${formatNumber(MAX_CLEARED)} items at once; untick some first.`);
    const ids = cleared.map((c) => c.id);
    const purged = [...offList.current].filter((id) => !shoppingList.some((i) => i.id === id));
    offList.current = new Set(ids);
    const saved = clearBoughtItemsAction({ itemIds: ids }).catch(() => null);
    const gone = new Set(ids);
    const drop = () => setShoppingList((prev) => prev.filter((i) => !gone.has(i.id)));
    const putBack = () => setShoppingList((prev) => [...prev.filter((i) => !gone.has(i.id)), ...cleared]);
    drop();
    showToast({
      message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
      touches: touches([...ids, ...purged]),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          putBack();
          if (!(await saved)?.success) return true; // the clear never happened
          const back = await restoreShoppingItemsAction({ itemIds: ids }).catch(() => null);
          if (back?.success) showRestored(ids, back.items as ShoppingItemData[], back.merged);
          else drop();
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore items"),
      ),
    });
    void saved.then((res) => {
      if (res?.success) return;
      putBack();
      for (const id of purged) offList.current.add(id); // not purged after all
      warn(res?.error ?? "Failed to clear bought items");
    });
    return saved;
  }

  return (
    <>
      {active && (
    <Dashboard>
      <Card
        id="shopping-title"
        title="Shopping list"
        count={shoppingList.length}
        below
        actions={
          <>
            <SmallButton
              disabled={shoppingList.every((i) => !i.isBought)}
              onClick={(e) => once("shopping:clear", handleClearBought, e.currentTarget)}
            >
              Clear bought
            </SmallButton>
            <AddButton onClick={() => openShopForm(null)}>Add item</AddButton>
          </>
        }
      >
        <ListBox className="shopping-groups">
          {shoppingList.length === 0 && <EmptyNote>Your shopping list is empty.</EmptyNote>}
          <GroupedList
            items={allShopping}
            wrap="shopping-group"
            isFolded={isShopFolded}
            onToggle={toggleShop}
            row={(item) => (
              <div className="shopping-row" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                <div className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                  <Checkbox
                    checked={item.isBought}
                    onChange={() => once(`shopping:${item.id}`, () => handleToggleShopping(item), tappedButton.current)}
                    label={`Mark ${item.name} as ${item.isBought ? "not bought" : "bought"}`}
                  />
                  <span className="entry-main entry-stack">
                    <span>{item.name}</span>
                    <span>
                      {formatAmount(item.amount, 2)} {item.unit}
                    </span>
                  </span>
                </div>
                <RowActions onEdit={() => openShopForm(item)} onDelete={() => once(`shopping:${item.id}`, () => handleDeleteShoppingItem(item), tappedButton.current)} editLabel={`Edit ${item.name}`} deleteLabel={`Delete ${item.name}`} />
              </div>
            )}
          />
        </ListBox>
      </Card>

      <CategoriesCard
        api={shoppingCategories}
        categories={categories}
        onChange={setCategories}
        onRefile={refile}
        idsIn={(c) => shoppingList.filter((i) => i.category === c).map((i) => i.id)}
      />
      <CategoriesCard
        api={shoppingUnitsApi}
        categories={units}
        onChange={setUnits}
        onRefile={refileUnit}
        idsIn={(u) => shoppingList.filter((i) => i.unit === u).map((i) => i.id)}
      />
    </Dashboard>
      )}

      <FormModal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        title={editingShop ? "Edit shopping item" : "New shopping item"}
        onSubmit={handleShopSubmit}
        error={errorMsg}
        canSubmit={visible(shopName)}
      >
        <Field label="Name" type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        <FieldPair>
          <Field
            label="Amount"
            type="number"
            inputMode="decimal"
            value={shopAmount}
            onChange={(e) => setShopAmount(e.target.value)}
          />
          <SelectField
            label="Unit"
            value={shopUnit}
            onChange={(e) => setShopUnit(e.target.value)}
            // An item whose unit the list lacks keeps it as an option.
            options={[...new Set(["pcs", ...units, shopUnit])].map((u) => ({ value: u, label: u }))}
          />
        </FieldPair>
        <CategoryField categories={categories} value={shopCategory} onChange={setShopCategory} />
      </FormModal>
    </>
  );
}
