"use client";

import { useRef, useState } from "react";
import { visible } from "@/lib/validations/common";
import { WISHLIST_ITEM_GONE } from "@/lib/validations/wishlist";
import { linkOf } from "@/lib/link";
import { formatNumber, roundTo } from "@/lib/number-format";
import { AnimatedNumber } from "../components/animated-number";
import { AddButton, Badge, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FormModal, Page, SortSelect, type FormOpening } from "../components/blocks";
import { changedFields } from "../components/forms";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { ListBox, RowActions } from "../components/lists";
import { Segmented } from "../components/segmented";
import { undoWith, useToast } from "../components/toast";
import { useDeviceState } from "../components/device-state";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import {
  addWishlistItemAction,
  deleteWishlistItemAction,
  restoreWishlistItemAction,
  updateWishlistItemAction,
} from "@/actions/wishlist";
import { WishlistItemData } from "@/lib/wishlist";
import { type Priority, priorityForPrice } from "@/lib/rules";

interface WishlistClientProps {
  userName: string;
  initialItems: WishlistItemData[];
  initialCategories: string[];
}

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "danger",
  medium: "warning",
  low: "rest",
};

const RANGE_LABEL: Record<Priority, string> = {
  low: "< 250",
  medium: "250-750",
  high: "750+",
};

type Range = "all" | Priority;
const FILTERS: { value: Range; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: RANGE_LABEL.low },
  { value: "medium", label: RANGE_LABEL.medium },
  { value: "high", label: RANGE_LABEL.high },
];

type Sort = "newest" | "price-asc" | "price-desc";
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
];
// Equal prices (or equal times) keep a fixed order, so an item moves only when it is acted on.
const newest = (a: WishlistItemData, b: WishlistItemData) => +new Date(b.createdAt) - +new Date(a.createdAt) || a.id.localeCompare(b.id);
const SORT_BY: Record<Sort, (a: WishlistItemData, b: WishlistItemData) => number> = {
  newest,
  "price-asc": (a, b) => Number(a.estimatedPrice) - Number(b.estimatedPrice) || newest(a, b),
  "price-desc": (a, b) => Number(b.estimatedPrice) - Number(a.estimatedPrice) || newest(a, b),
};

// Lei in the app's number format (D-037): whole lei without decimals, cents with two ("1.234" and "99,90").
const decimalsOf = (n: number) => (Number.isInteger(roundTo(n, 2)) ? 0 : 2);
const formatRon = (n: number) => formatNumber(n, decimalsOf(n));

/** What a wishlist toast touches (D-040): the item's row. */
const touches = (id: string) => [`wishlist_items:${id}`];

function ItemLink({ value }: { value: string }) {
  const { href, label } = linkOf(value);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="item-link" title={value}>
      {label}
    </a>
  ) : (
    <span className="item-link-text" title={value}>{label}</span>
  );
}

export function WishlistClient({ userName, initialItems, initialCategories }: WishlistClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // The item the form opened on (its values then), null for a new item.
  const [editing, setEditing] = useState<WishlistItemData | null>(null);
  const closeForm = () => setIsModalOpen(false);
  // The edit form closes when another device deletes its item.
  const [items, setItems] = useServerState(initialItems, { editing: isModalOpen ? (editing?.id ?? null) : null, onDeleted: closeForm });
  const [categories, setCategories] = useServerState(initialCategories);
  // The tab and the sort are kept on this device (only values the page offers count).
  const [storedRange, setFilterRange] = useDeviceState<string>("lt-wishlist-range", "all");
  const [storedSort, setSort] = useDeviceState<string>("lt-wishlist-sort", "newest");
  const filterRange = FILTERS.find((f) => f.value === storedRange)?.value ?? "all";
  const sort = SORTS.find((o) => o.value === storedSort)?.value ?? "newest";

  const { showToast } = useToast();
  const warn = (message: string) => showToast({ message, type: "warning" });
  // A Delete acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("other");
  const [errorMsg, setErrorMsg] = useState("");

  // The range comes from the price, never from the stored column.
  const rangeOf = (item: WishlistItemData) => priorityForPrice(Number(item.estimatedPrice));
  // Every tab lists its items under their category, each group in the chosen sort; a group can be folded.
  const [isFolded, toggleFolded] = useFolded("wishlist");
  const foldKey = (category: string) => `${filterRange}/${category}`;
  const sorted = items.filter((i) => filterRange === "all" || rangeOf(i) === filterRange).sort(SORT_BY[sort]);
  const filteredItems = groupOrder(categories, items).flatMap((c) => sorted.filter((i) => i.category === c));
  // Prices have two decimals; the sum is rounded back to two, so float error does not show in the total.
  const totalCost = roundTo(filteredItems.reduce((sum, item) => sum + Number(item.estimatedPrice), 0), 2);
  const tabLabel = FILTERS.find((f) => f.value === filterRange)!.label;

  const toInput = (item: WishlistItemData) => ({
    name: item.name,
    estimatedPrice: Number(item.estimatedPrice),
    url: item.url || undefined,
    category: item.category,
  });

  const replace = (to: WishlistItemData) => setItems((prev) => prev.map((i) => (i.id === to.id ? to : i)));
  // Puts these fields onto the row as the screen holds it now, so a change another tab made since stays on screen.
  const putFields = (id: string, fields: Partial<WishlistItemData>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...fields } : i)));

  function openForm(item?: WishlistItemData) {
    setErrorMsg("");
    setEditing(item ?? null);
    setName(item?.name ?? "");
    setEstimatedPrice(item ? Number(item.estimatedPrice).toFixed(decimalsOf(Number(item.estimatedPrice))) : "");
    setUrl(item?.url ?? "");
    setCategory(item?.category ?? "other");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent, { id, stillOpen }: FormOpening) {
    e.preventDefault();
    if (!visible(name)) return setErrorMsg("Please enter an item name");
    // The server checks the limits; its message shows in the form, which keeps what was typed.
    setErrorMsg("");
    const input = {
      name: name.trim(),
      // The number field hands over the machine value ("99.9").
      estimatedPrice: Number(estimatedPrice),
      url: url.trim() || undefined,
      category,
    };
    const before = editing;
    // The answer belongs to the opening it came from: a form closed or opened since stays as it is, and a refusal is told
    // in a toast.
    const refused = (message: string) => (stillOpen() ? setErrorMsg(message) : warn(message));

    if (before) {
      const changed = changedFields(toInput(before), input);
      const res = await updateWishlistItemAction({ id: before.id, ...changed }).catch(() => null);
      if (!res?.success) {
        if (res?.error !== WISHLIST_ITEM_GONE) return refused(res?.error ?? "Failed to save item. Please try again.");
        // Deleted on another device: the form closes and the row leaves.
        if (stillOpen()) closeForm();
        dropRow(before.id);
        return warn(res.error);
      }
      const updated = res.item as WishlistItemData;
      // The old values of the fields this edit changed, so its Undo leaves another tab's change to the rest alone.
      const undo = Object.fromEntries(Object.keys(changed).map((k) => [k, toInput(before)[k as keyof typeof changed] ?? null]));
      // Those fields of a row as the screen holds them: the Undo puts back on screen only what it writes back.
      const fieldsOf = (item: WishlistItemData) => Object.fromEntries(Object.keys(changed).map((k) => [k, item[k as keyof typeof changed]]));
      replace(updated);
      keepCategory(updated.category);
      if (stillOpen()) closeForm();
      showToast({
        message: `Saved "${updated.name}"`,
        type: "success",
        touches: touches(updated.id),
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onUndo: undoWith(
          showToast,
          async () => {
            putFields(before.id, fieldsOf(before));
            const back = await updateWishlistItemAction({ id: before.id, ...undo }).catch(() => null);
            if (back?.success) {
              putFields(before.id, fieldsOf(back.item as WishlistItemData));
              keepCategory(before.category);
            } else putFields(before.id, fieldsOf(updated));
            return back;
          },
          (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
        ),
      });
      return;
    }
    const res = await addWishlistItemAction({ id, ...input }).catch(() => null);
    if (!res?.success) return refused(res?.error ?? "Failed to save item. Please try again.");
    const added = res.item as WishlistItemData;
    setItems((prev) => [added, ...prev.filter((i) => i.id !== added.id)]);
    keepCategory(added.category);
    if (stillOpen()) closeForm();
    // A repeat of an add whose answer was lost adds nothing (D-040): the toast says so, without an Undo.
    showToast(
      res.repeated
        ? { message: `Already added "${added.name}"`, type: "success", touches: touches(added.id) }
        : {
            message: `Added "${added.name}" (${formatRon(Number(added.estimatedPrice))} RON)`,
            type: "success",
            touches: touches(added.id),
            onUndo: undoWith(
              showToast,
              async () => {
                dropRow(added.id);
                const gone = await deleteWishlistItemAction(added.id).catch(() => null);
                // An item already deleted on another device stays off the screen.
                if (!gone?.success && gone?.error !== WISHLIST_ITEM_GONE) putBack(added);
                return gone;
              },
              (back) => (back && !back.success ? back.error : "Failed to undo"),
            ),
          },
    );
  }

  // A category was renamed or deleted: its items follow. The stored category is the only thing that changes.
  const refile = (from: string, to: string, only?: string[]) =>
    setItems((prev) => prev.map((i) => (i.category === from && (!only || only.includes(i.id)) ? { ...i, category: to } : i)));

  // The server files a saved item under its category and creates the category if it is gone (an Undo after the category was deleted): the card shows it too.
  const keepCategory = (c: string) => setCategories((prev) => (c === "other" || prev.includes(c) ? prev : [...prev, c]));

  const putBack = (item: WishlistItemData) =>
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  const dropRow = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function handleRemove(target: WishlistItemData) {
    dropRow(target.id);
    const saved = deleteWishlistItemAction(target.id).catch(() => null);
    showToast({
      message: `Removed "${target.name}"`,
      touches: touches(target.id),
      saved,
      // Same id and date, so the row comes back where it was.
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)?.success) return true; // the failure path below puts it back
          putBack(target);
          const back = await restoreWishlistItemAction({
            ...toInput(target),
            id: target.id,
            createdAt: target.createdAt,
          }).catch(() => null);
          if (back?.success) keepCategory(target.category);
          else dropRow(target.id);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore item"),
      ),
    });
    // An item already deleted on another device stays off the screen, with the server's reason.
    void saved.then((res) => {
      if (res?.success) return;
      if (res?.error !== WISHLIST_ITEM_GONE) putBack(target);
      warn(res?.error ?? "Failed to remove item");
    });
    return saved;
  }

  return (
    <Page userName={userName}>
      <Dashboard>
        <DashboardMain>
          <Card
            id="wishlist-items-title"
            title="Items"
            count={filteredItems.length}
            below
            actions={
              <>
                <SortSelect label="Sort items" value={sort} options={SORTS} onChange={setSort} />
                <AddButton onClick={() => openForm()}>Add item</AddButton>
              </>
            }
          >
            <Segmented
              label="Filter by price range"
              value={filterRange}
              options={FILTERS}
              onChange={setFilterRange}
            />

            <ListBox wash className="entries wishlist-entries">
              {filteredItems.length === 0 ? (
                <EmptyNote>{items.length === 0 ? "No items yet." : "No items in this range."}</EmptyNote>
              ) : (
                <GroupedList
                  items={filteredItems}
                  isFolded={(c) => isFolded(foldKey(c))}
                  onToggle={(c) => toggleFolded(foldKey(c))}
                  row={(item) => (
                    <div className="entry-row item-row" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                      <strong className="item-name">{item.name}</strong>
                      <div className="item-meta">
                        <Badge kind="info" className="item-price number-tabular">{formatRon(Number(item.estimatedPrice))} RON</Badge>
                        {filterRange === "all" && (
                          <Badge kind={PRIORITY_BADGE[rangeOf(item)]} className="item-range">{RANGE_LABEL[rangeOf(item)]}</Badge>
                        )}
                        {item.url && <ItemLink value={item.url} />}
                      </div>

                      <RowActions className="item-actions" onEdit={() => openForm(item)} onDelete={() => once(`wishlist:${item.id}`, () => handleRemove(item), tappedButton.current)} editLabel={`Edit ${item.name}`} deleteLabel={`Delete ${item.name}`} />
                    </div>
                  )}
                />
              )}
            </ListBox>
          </Card>
          <CategoriesCard api={scopedCategories("wishlist")} categories={categories} onChange={setCategories} onRefile={refile} idsIn={(c) => items.filter((i) => i.category === c).map((i) => i.id)} />
        </DashboardMain>

        <DashboardAside summaryFirst>
          <Card id="wishlist-summary-title" title={`Estimated investment · ${tabLabel}`}>
            <p className="item-total number-tabular">
              <AnimatedNumber value={totalCost} format={(n) => formatNumber(n, decimalsOf(totalCost))} /> <span className="item-currency">RON</span>
            </p>
          </Card>
        </DashboardAside>
      </Dashboard>

      <FormModal
        isOpen={isModalOpen}
        onClose={closeForm}
        title={editing ? "Edit item" : "New item"}
        onSubmit={handleSubmit}
        error={errorMsg}
        canSubmit={!!name.trim() && !!estimatedPrice}
      >
        <Field label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        <Field
          label="Price (RON)"
          type="number"
          value={estimatedPrice}
          onChange={(e) => setEstimatedPrice(e.target.value)}
          required
          className="number-tabular"
        />
        <CategoryField categories={categories} value={category} onChange={setCategory} />
        <Field label="Link or store (optional)" type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
      </FormModal>
    </Page>
  );
}
