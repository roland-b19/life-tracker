"use client";

import { useState } from "react";
import { compareShopping } from "@/lib/check-order";
import { visible } from "@/lib/validations/common";
import { AddButton, Card, Checkbox, Dashboard, EmptyNote, Field, FieldPair, FormModal, SelectField, SmallButton } from "../components/blocks";
import { undoWith, useToast } from "../components/toast";
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
  const [shoppingList, setShoppingList] = useState(initialItems);
  const [categories, setCategories] = useState(initialCategories);
  const [units, setUnits] = useState(initialUnits);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShoppingItemData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
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

  /** Adds an item; the server adds the amount to the same item when it is already on the list. */
  async function addShopping(input: { name: string; amount: number; unit: string; category: string }) {
    setBusy(true);
    try {
      const res = await addShoppingItemAction(input);
      if (!res.success) {
        setErrorMsg(res.error);
        return false;
      }
      const item = res.item as ShoppingItemData;
      const before = shoppingList.find((i) => i.id === item.id);
      upsertShop(item);
      showToast(
        !before
          ? {
              message: `Added "${item.name}"`,
              type: "success",
              onUndo: undoWith(showToast, async () => {
                dropShop(item.id);
                const gone = await deleteShoppingItemAction(item.id).then((r) => r.success, () => false);
                if (!gone) upsertShop(item);
                return gone;
              }),
            }
          : {
              message: `"${item.name}" is now ${Number(item.amount)} ${item.unit}`,
              type: "success",
              onUndo: undoWith(
                showToast,
                async () => {
                  upsertShop(before);
                  const back = await updateShoppingItemAction({
                    ...toShopInput(before),
                    itemId: before.id,
                    isBought: before.isBought,
                    checkedAt: before.checkedAt,
                  }).catch(() => null);
                  if (!back?.success) upsertShop(item);
                  return back;
                },
                "Failed to undo the edit",
              ),
            },
      );
      return true;
    } catch {
      setErrorMsg("Failed to add item");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Writes an edited item into the list; the bought state stays as it is on screen.
  const replaceShop = (to: ShoppingItemData) =>
    setShoppingList((prev) => prev.map((i) => (i.id === to.id ? { ...to, isBought: i.isBought, checkedAt: i.checkedAt } : i)));

  async function handleShopSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      name: shopName.trim(),
      amount: shopAmount.trim() === "" ? 1 : parseFloat(shopAmount),
      unit: shopUnit.trim() || "pcs",
      category: shopCategory.trim().toLowerCase() || "other",
    };
    if (!visible(input.name)) return;
    // Same limits as addShoppingItemSchema, so a refusal always has a message on screen.
    if (input.name.length > 120) return setErrorMsg("The name must be 120 characters or less.");
    if (!(input.amount >= 0.01 && input.amount <= 1000)) return setErrorMsg("The amount must be between 0.01 and 1000.");
    if (input.unit.length > 30) return setErrorMsg("The unit must be 30 characters or less.");
    if (input.category.length > 50) return setErrorMsg("The category must be 50 characters or less.");
    setErrorMsg("");

    if (!editingShop) {
      if (await addShopping(input)) setIsShopModalOpen(false);
      return;
    }
    const before = editingShop;
    setBusy(true);
    try {
      const res = await updateShoppingItemAction({ ...input, itemId: before.id });
      if (!res.success) return setErrorMsg(res.error);
      const item = res.item as ShoppingItemData;
      replaceShop(item);
      setIsShopModalOpen(false);
      showToast({
        message: `Saved "${item.name}"`,
        type: "success",
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onUndo: undoWith(
          showToast,
          async () => {
            replaceShop(before);
            const back = await updateShoppingItemAction({ ...toShopInput(before), itemId: before.id }).catch(() => null);
            if (!back?.success) replaceShop(item);
            return back;
          },
          "Failed to undo the edit",
        ),
      });
    } catch {
      setErrorMsg("Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  /** The shared Categories card re-files the items: a rename or delete moves them, Undo moves `only` back. */
  const refile = (from: string, to: string, only?: string[]) =>
    setShoppingList((prev) => prev.map((i) => (i.category === from && (!only || only.includes(i.id)) ? { ...i, category: to } : i)));

  const refileUnit = (from: string, to: string, only?: string[]) =>
    setShoppingList((prev) => prev.map((i) => (i.unit === from && (!only || only.includes(i.id)) ? { ...i, unit: to } : i)));

  function handleToggleShopping(item: ShoppingItemData) {
    const next = !item.isBought;
    const setBought = (isBought: boolean) =>
      setShoppingList((prev) => prev.map((i) => (i.id === item.id ? { ...i, isBought, checkedAt: new Date() } : i)));
    setBought(next);
    const saved = toggleShoppingItemAction(item.id, next).then(
      (r) => r.success,
      () => false,
    );
    showToast({
      message: next ? `Bought "${item.name}"` : `"${item.name}" is back on the list`,
      type: "success",
      onUndo: undoWith(
        showToast,
        async () => {
          setBought(!next);
          if (!(await saved)) return true; // the failure path below put it back
          const back = await toggleShoppingItemAction(item.id, !next).then((r) => r.success, () => false);
          if (!back) setBought(next);
          return back;
        },
        "Failed to undo the edit",
      ),
    });
    void saved.then((ok) => {
      if (ok) return;
      setBought(!next);
      warn("Failed to update item");
    });
  }

  function handleDeleteShoppingItem(item: ShoppingItemData) {
    // The row leaves at once; the server delete runs alongside, so the tap never waits on the network.
    dropShop(item.id);
    const deleted = deleteShoppingItemAction(item.id).then(
      (r) => r.success,
      () => false,
    );
    showToast({
      message: `Removed "${item.name}"`,
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await deleted)) return true; // the failure path below puts it back
          upsertShop(item);
          const back = await restoreShoppingItemsAction({ itemIds: [item.id] }).catch(() => null);
          if (!back?.success) dropShop(item.id);
          return back;
        },
        "Failed to restore item",
      ),
    });
    void deleted.then((ok) => {
      if (ok) return;
      upsertShop(item);
      warn("Failed to remove item");
    });
  }

  // Like a delete: the rows leave and the toast shows at once; a failed clear puts them back.
  function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    if (!cleared.length) return;
    const ids = new Set(cleared.map((c) => c.id));
    const done = clearBoughtItemsAction({ itemIds: [...ids] }).then(
      (r) => r.success,
      () => false,
    );
    const drop = () => setShoppingList((prev) => prev.filter((i) => !ids.has(i.id)));
    const putBack = () => setShoppingList((prev) => [...prev.filter((i) => !ids.has(i.id)), ...cleared]);
    drop();
    showToast({
      message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
      onUndo: undoWith(
        showToast,
        async () => {
          putBack();
          if (!(await done)) return true; // the clear never happened
          const back = await restoreShoppingItemsAction({ itemIds: [...ids] }).catch(() => null);
          if (!back?.success) drop();
          return back;
        },
        "Failed to restore items",
      ),
    });
    void done.then((ok) => {
      if (ok) return;
      putBack();
      warn("Failed to clear bought items");
    });
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
            <SmallButton disabled={shoppingList.every((i) => !i.isBought)} onClick={handleClearBought}>
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
              <div className="shopping-row">
                <div className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                  <Checkbox
                    checked={item.isBought}
                    onChange={() => handleToggleShopping(item)}
                    label={`Mark ${item.name} as ${item.isBought ? "not bought" : "bought"}`}
                  />
                  <span className="entry-main entry-stack">
                    <span>{item.name}</span>
                    <span>
                      {Number(item.amount)} {item.unit}
                    </span>
                  </span>
                </div>
                <RowActions onEdit={() => openShopForm(item)} onDelete={() => handleDeleteShoppingItem(item)} editLabel={`Edit ${item.name}`} deleteLabel={`Delete ${item.name}`} />
              </div>
            )}
          />
        </ListBox>
      </Card>

      <CategoriesCard api={shoppingCategories} categories={categories} onChange={setCategories} onRefile={refile} />
      <CategoriesCard api={shoppingUnitsApi} categories={units} onChange={setUnits} onRefile={refileUnit} />
    </Dashboard>
      )}

      <FormModal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        title={editingShop ? "Edit shopping item" : "New shopping item"}
        onSubmit={handleShopSubmit}
        error={errorMsg}
        busy={busy}
        canSubmit={visible(shopName)}
      >
        <Field label="Name" type="text" maxLength={120} disabled={busy} value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        <FieldPair>
          <Field
            label="Amount"
            type="number"
            step="any"
            min="0.01"
            max="1000"
            inputMode="decimal"
            disabled={busy}
            value={shopAmount}
            onChange={(e) => setShopAmount(e.target.value)}
          />
          <SelectField
            label="Unit"
            disabled={busy}
            value={shopUnit}
            onChange={(e) => setShopUnit(e.target.value)}
            // An item whose unit the list lacks keeps it as an option.
            options={[...new Set(["pcs", ...units, shopUnit])].map((u) => ({ value: u, label: u }))}
          />
        </FieldPair>
        <CategoryField categories={categories} value={shopCategory} onChange={setShopCategory} disabled={busy} />
      </FormModal>
    </>
  );
}
