"use client";

import { useState } from "react";
import { AnimatedNumber } from "../components/animated-number";
import { AddButton, Badge, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FormModal, Page, SortSelect } from "../components/blocks";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { ListBox, RowActions } from "../components/lists";
import { Segmented } from "../components/segmented";
import { useToast } from "../components/toast";
import {
  addWishlistItemAction,
  deleteWishlistItemAction,
  restoreWishlistItemAction,
  updateWishlistItemAction,
} from "@/app/actions/wishlist";
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

const FILTERS: { value: "all" | Priority; label: string }[] = [
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
const SORT_BY: Record<Sort, (a: WishlistItemData, b: WishlistItemData) => number> = {
  newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  "price-asc": (a, b) => Number(a.estimatedPrice) - Number(b.estimatedPrice),
  "price-desc": (a, b) => Number(b.estimatedPrice) - Number(a.estimatedPrice),
};

// Whole lei with the thousands separator, no decimals (the user's call): 1.234 RON.
const ron = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });
const formatRon = (n: number) => ron.format(n);

/** A typed URL opens as a link (shown as its host); anything else (a store name) is plain text. */
function linkOf(value: string) {
  const href = /^https?:\/\/\S+$/i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) ? `https://${value}` : null;
  return { href, label: href ? `${value.replace(/^https?:\/\//i, "").split("/")[0]} ↗` : value };
}

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
  const [items, setItems] = useState<WishlistItemData[]>(initialItems);
  const [categories, setCategories] = useState(initialCategories);
  const [filterRange, setFilterRange] = useState<"all" | Priority>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { showToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("other");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // The range comes from the price, never from the stored column.
  const rangeOf = (item: WishlistItemData) => priorityForPrice(Number(item.estimatedPrice));
  // Every tab lists its items under their category, each group in the chosen sort; a group can be folded.
  const [isFolded, toggleFolded] = useFolded("wishlist");
  const foldKey = (category: string) => `${filterRange}/${category}`;
  const sorted = items.filter((i) => filterRange === "all" || rangeOf(i) === filterRange).sort(SORT_BY[sort]);
  const filteredItems = groupOrder(categories, items).flatMap((c) => sorted.filter((i) => i.category === c));
  const totalCost = filteredItems.reduce((sum, item) => sum + Number(item.estimatedPrice), 0);

  const toInput = (item: WishlistItemData) => ({
    name: item.name,
    estimatedPrice: Number(item.estimatedPrice),
    url: item.url || undefined,
    category: item.category,
  });

  const replace = (to: WishlistItemData) => setItems((prev) => prev.map((i) => (i.id === to.id ? to : i)));

  function openForm(item?: WishlistItemData) {
    setErrorMsg("");
    setEditingId(item?.id ?? null);
    setName(item?.name ?? "");
    setEstimatedPrice(item ? String(Math.round(Number(item.estimatedPrice))) : "");
    setUrl(item?.url ?? "");
    setCategory(item?.category ?? "other");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedPrice = Number(estimatedPrice.trim()); // unlike parseFloat, rejects trailing junk and "1,5"
    if (!name.trim()) {
      setErrorMsg("Please enter an item name.");
      return;
    }
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      setErrorMsg("Please enter a whole-number price greater than 0.");
      return;
    }

    const input = {
      name: name.trim(),
      estimatedPrice: parsedPrice,
      url: url.trim() || undefined,
      category,
    };

    setBusy(true);
    try {
      if (editingId) {
        const res = await updateWishlistItemAction(editingId, input);
        if (!res.success || !res.item) {
          setErrorMsg("Item not found.");
          return;
        }
        const updated = res.item as WishlistItemData;
        const before = items.find((i) => i.id === editingId);
        replace(updated);
        showToast({
          message: `Saved "${updated.name}"`,
          type: "success",
          ...(before && {
            // Writes the old values back; if that fails the edit stays, so the screen matches the database.
            onUndo: async () => {
              replace(before);
              const back = await updateWishlistItemAction(before.id, toInput(before)).catch(() => null);
              if (!back?.success) {
                replace(updated);
                showToast({ message: "Failed to undo the edit", type: "warning" });
              }
            },
          }),
        });
      } else {
        const res = await addWishlistItemAction(input);
        if (!res.success || !res.item) {
          setErrorMsg("Failed to save item");
          return;
        }
        const added = res.item as WishlistItemData;
        setItems((prev) => [added, ...prev]);
        showToast({
          message: `Added "${added.name}" (${formatRon(parsedPrice)} RON)`,
          type: "success",
          onUndo: async () => {
            setItems((prev) => prev.filter((i) => i.id !== added.id));
            const gone = await deleteWishlistItemAction(added.id).catch(() => null);
            if (gone?.success === false || !gone) {
              setItems((prev) => (prev.some((i) => i.id === added.id) ? prev : [added, ...prev]));
              showToast({ message: "Failed to undo", type: "warning" });
            }
          },
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  // A category was renamed or deleted: its items follow. The stored category is the only thing that changes.
  const refile = (from: string, to: string, only?: string[]) =>
    setItems((prev) => prev.map((i) => (i.category === from && (!only || only.includes(i.id)) ? { ...i, category: to } : i)));

  const putBack = (item: WishlistItemData) =>
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  const dropRow = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  async function handleRemove(target: WishlistItemData) {
    dropRow(target.id);
    const deleted = deleteWishlistItemAction(target.id).then(
      (res) => res.success !== false,
      () => false,
    );
    showToast({
      message: `Removed "${target.name}"`,
      // Same id and date, so the row comes back where it was.
      onUndo: async () => {
        putBack(target);
        if (!(await deleted)) return; // the delete never happened
        const back = await restoreWishlistItemAction({
          ...toInput(target),
          id: target.id,
          createdAt: target.createdAt,
        }).catch(() => null);
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
                    <div className="entry-row item-row">
                      <strong className="item-name">{item.name}</strong>
                      <div className="item-meta">
                        <Badge kind="info" className="item-price number-tabular">{formatRon(Number(item.estimatedPrice))} RON</Badge>
                        {filterRange === "all" && (
                          <Badge kind={PRIORITY_BADGE[rangeOf(item)]} className="item-range">{RANGE_LABEL[rangeOf(item)]}</Badge>
                        )}
                        {item.url && <ItemLink value={item.url} />}
                      </div>

                      <RowActions className="item-actions" onEdit={() => openForm(item)} onDelete={() => handleRemove(item)} editLabel={`Edit ${item.name}`} deleteLabel={`Delete ${item.name}`} />
                    </div>
                  )}
                />
              )}
            </ListBox>
          </Card>
          <CategoriesCard api={scopedCategories("wishlist")} categories={categories} onChange={setCategories} onRefile={refile} />
        </DashboardMain>

        <DashboardAside summaryFirst>
          <Card id="wishlist-summary-title" title="Estimated Investment">
            <p className="item-total number-tabular">
              <AnimatedNumber value={totalCost} format={formatRon} /> <span className="muted">RON</span>
            </p>
          </Card>
        </DashboardAside>
      </Dashboard>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Edit item" : "New item"}
        onSubmit={handleSubmit}
        error={errorMsg}
        busy={busy}
        canSubmit={!!name.trim() && !!estimatedPrice}
      >
        <Field label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={120} required />
        <Field
          label="Price (RON)"
          type="text"
          inputMode="numeric"
          value={estimatedPrice}
          onChange={(e) => setEstimatedPrice(e.target.value)}
          disabled={busy}
          required
          className="number-tabular"
        />
        <CategoryField categories={categories} value={category} onChange={setCategory} disabled={busy} />
        <Field label="Link or store (optional)" type="text" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
      </FormModal>
    </Page>
  );
}
