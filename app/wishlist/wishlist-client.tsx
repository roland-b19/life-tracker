"use client";

import { Fragment, useState } from "react";
import { Navigation } from "../components/navigation";
import { AnimatedNumber } from "../components/animated-number";
import { AutoHeight, useListMotion } from "../components/list-motion";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { Segmented } from "../components/segmented";
import { useToast } from "../components/toast";
import {
  addWishlistItemAction,
  deleteWishlistItemAction,
  restoreWishlistItemAction,
  updateWishlistItemAction,
} from "@/app/actions/wishlist";
import { WishlistItemData } from "@/lib/wishlist";
import { Priority, priorityForPrice } from "@/lib/validations/wishlist";

interface WishlistClientProps {
  userName: string;
  initialItems: WishlistItemData[];
}

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "badge-danger",
  medium: "badge-warning",
  low: "badge-rest",
};

const RANGE_LABEL: Record<Priority, string> = {
  low: "Under 250",
  medium: "250 – 750",
  high: "750+",
};

const FILTERS: { value: "all" | Priority; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: RANGE_LABEL.low },
  { value: "medium", label: RANGE_LABEL.medium },
  { value: "high", label: RANGE_LABEL.high },
];

const formatRon = (n: number) =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A typed URL opens as a link; anything else (a store name) is shown as plain text. */
function ItemLink({ value }: { value: string }) {
  const href = /^https?:\/\/\S+$/i.test(value) ? value : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) ? `https://${value}` : null;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="item-link">
      {value.replace(/^https?:\/\//i, "").split("/")[0]} ↗
    </a>
  ) : (
    <span className="item-link-text">{value}</span>
  );
}

export function WishlistClient({ userName, initialItems }: WishlistClientProps) {
  const [items, setItems] = useState<WishlistItemData[]>(initialItems);
  const [filterRange, setFilterRange] = useState<"all" | Priority>("all");
  // The rows switch only after the old ones have faded out, while the tab moves at once.
  const [listRange, setListRange] = useState<"all" | Priority>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { showToast } = useToast();
  const { rowRef, enter, leave, fadeAll } = useListMotion();

  // Form state
  const [name, setName] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Newest first; the range comes from the price, never from the stored column.
  const rangeOf = (item: WishlistItemData) => priorityForPrice(Number(item.estimatedPrice));
  const filteredItems = items
    .filter((item) => listRange === "all" || rangeOf(item) === listRange)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const totalCost = filteredItems.reduce((sum, item) => sum + Number(item.estimatedPrice), 0);

  const toInput = (item: WishlistItemData) => ({
    name: item.name,
    estimatedPrice: Number(item.estimatedPrice),
    url: item.url || undefined,
  });

  function switchRange(next: "all" | Priority) {
    if (next === filterRange) return;
    setFilterRange(next);
    fadeAll(() => setListRange(next));
  }

  function openForm(item?: WishlistItemData) {
    setErrorMsg("");
    setEditingId(item?.id ?? null);
    setName(item?.name ?? "");
    setEstimatedPrice(item ? String(Number(item.estimatedPrice)) : "");
    setUrl(item?.url ?? "");
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedPrice = parseFloat(estimatedPrice);
    if (!name.trim()) {
      setErrorMsg("Please enter an item name.");
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMsg("Please enter a valid price greater than 0.");
      return;
    }

    const input = {
      name: name.trim(),
      estimatedPrice: parsedPrice,
      url: url.trim() || undefined,
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
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        showToast({
          message: `Saved "${updated.name}"`,
          type: "success",
          actionLabel: before ? "Undo" : undefined,
          onAction: before
            ? async () => {
                const back = await updateWishlistItemAction(updated.id, toInput(before));
                if (back.success && back.item) {
                  setItems((prev) => prev.map((i) => (i.id === updated.id ? (back.item as WishlistItemData) : i)));
                }
              }
            : undefined,
        });
      } else {
        const res = await addWishlistItemAction(input);
        if (!res.success || !res.item) return;
        const added = res.item as WishlistItemData;
        enter(added.id);
        setItems((prev) => [added, ...prev]);
        showToast({
          message: `Added "${added.name}" (${formatRon(parsedPrice)} RON)`,
          type: "success",
          actionLabel: "Undo",
          onAction: () => {
            dropRow(added.id);
            void deleteWishlistItemAction(added.id);
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

  const putBack = (item: WishlistItemData) => {
    enter(item.id);
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
  };
  const dropRow = (id: string) => leave(id, () => setItems((prev) => prev.filter((i) => i.id !== id)));

  // The server call runs while the row fades, so nothing waits on the network; the toast comes as the row closes.
  function handleRemove(target: WishlistItemData) {
    const deleted = deleteWishlistItemAction(target.id).then(
      () => true,
      () => false,
    );
    leave(target.id, () => {
      setItems((prev) => prev.filter((i) => i.id !== target.id));
      void deleted.then((ok) => {
        if (!ok) {
          putBack(target);
          showToast({ message: "Failed to remove item", type: "warning" });
          return;
        }
        showToast({
          message: `Removed "${target.name}"`,
          actionLabel: "Undo",
          // Same id and date, so the row comes back where it was.
          onAction: async () => {
            putBack(target);
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
      });
    });
  }

  return (
    <main>
      <Navigation userName={userName} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="wishlist-items-title">
            <div className="section-head">
              <h2 id="wishlist-items-title" className="section-title">
                Items
              </h2>
              <span className="head-actions">
                <span className="muted number-tabular">{filteredItems.length}</span>
                <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                  <PlusIcon size={14} />
                  Add item
                </button>
              </span>
            </div>

            <Segmented
              label="Filter by price range"
              value={filterRange}
              options={FILTERS}
              onChange={switchRange}
            />

            <AutoHeight className="entries">
              {filteredItems.length === 0 ? (
                // Keyed like the rows: a reused note would keep fadeAll's faded-out state and stay invisible.
                <p key={`empty-${listRange}`} ref={rowRef("empty")} className="empty-note">
                  {items.length === 0 ? "No items yet." : "No items in this range."}
                </p>
              ) : (
                // Keyed by the filter so every row replays its entrance when the tab changes.
                <Fragment key={listRange}>
                  {filteredItems.map((item) => (
                    <div key={item.id} ref={rowRef(item.id)} className="entry-row item-row">
                      <strong className="item-name">{item.name}</strong>
                      <div className="item-meta">
                        <span className="item-price number-tabular">{formatRon(Number(item.estimatedPrice))} RON</span>
                        {listRange === "all" && (
                          <span className={`badge ${PRIORITY_BADGE[rangeOf(item)]}`}>{RANGE_LABEL[rangeOf(item)]}</span>
                        )}
                        {item.url && <ItemLink value={item.url} />}
                      </div>

                      <div className="item-actions">
                        <button
                          type="button"
                          className="delete-icon-btn edit"
                          onClick={() => openForm(item)}
                          aria-label={`Edit ${item.name}`}
                          title="Edit"
                        >
                          <PencilIcon size={17} />
                        </button>
                        <button
                          type="button"
                          className="delete-icon-btn"
                          onClick={() => handleRemove(item)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                        >
                          <TrashIcon size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                </Fragment>
              )}
            </AutoHeight>
          </section>
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-labelledby="wishlist-summary-title">
            <div className="section-head">
              <h2 id="wishlist-summary-title" className="section-title">
                Estimated Investment
              </h2>
            </div>
            <p className="item-total number-tabular">
              <AnimatedNumber value={totalCost} format={formatRon} /> <span className="muted">RON</span>
            </p>
          </section>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Edit item" : "New item"}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-stack">
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                maxLength={120}
                required
              />
            </label>

            <label>
              Price (RON)
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                disabled={busy}
                required
                className="number-tabular"
              />
            </label>

            <label>
              Link or store (optional)
              <input
                type="text"
                maxLength={500}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
            </label>

            {errorMsg && <p className="error">{errorMsg}</p>}
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim() || !estimatedPrice}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
