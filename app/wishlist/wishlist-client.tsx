"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { Segmented } from "../components/segmented";
import { useToast } from "../components/toast";
import {
  addWishlistItemAction,
  deleteWishlistItemAction,
  updateWishlistItemAction,
} from "@/app/actions/wishlist";
import { WishlistItemData } from "@/lib/wishlist";

interface WishlistClientProps {
  userName: string;
  initialItems: WishlistItemData[];
}

type Priority = "low" | "medium" | "high";

const PRIORITY_BADGE: Record<Priority, string> = {
  high: "badge-danger",
  medium: "badge-warning",
  low: "badge-rest",
};

const FILTERS: { value: "all" | Priority; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const formatRon = (n: number) =>
  n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WishlistClient({ userName, initialItems }: WishlistClientProps) {
  const [items, setItems] = useState<WishlistItemData[]>(initialItems);
  const [filterPriority, setFilterPriority] = useState<"all" | Priority>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { showToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const totalCost = items.reduce((sum, item) => sum + Number(item.estimatedPrice), 0);
  const filteredItems = items.filter((item) => filterPriority === "all" || item.priority === filterPriority);

  function openForm(item?: WishlistItemData) {
    setErrorMsg("");
    setEditingId(item?.id ?? null);
    setName(item?.name ?? "");
    setEstimatedPrice(item ? String(Number(item.estimatedPrice)) : "");
    setPriority((item?.priority as Priority) ?? "medium");
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
      priority,
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
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        showToast({ message: `Saved "${updated.name}"`, type: "success" });
      } else {
        const res = await addWishlistItemAction(input);
        if (!res.success || !res.item) return;
        setItems((prev) => [res.item as WishlistItemData, ...prev]);
        showToast({ message: `Added "${res.item.name}" (${formatRon(parsedPrice)} RON)`, type: "success" });
      }
      setIsModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string, reason: "bought" | "deleted") {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    // Optimistic removal
    setItems((prev) => prev.filter((item) => item.id !== id));

    setBusy(true);
    try {
      const res = await deleteWishlistItemAction(id);
      if (res.success) {
        showToast({
          message: reason === "bought" ? `Bought "${target.name}"` : `Removed "${target.name}"`,
          actionLabel: "Undo",
          onAction: async () => {
            const reRes = await addWishlistItemAction({
              name: target.name,
              estimatedPrice: Number(target.estimatedPrice),
              priority: target.priority as Priority,
              url: target.url || undefined,
            });
            if (reRes.success && reRes.item) {
              setItems((prev) => [reRes.item as WishlistItemData, ...prev]);
            }
          },
        });
      }
    } catch {
      setItems((prev) => [target, ...prev]);
      showToast({ message: "Failed to remove item", type: "warning" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      <div className="toolbar toolbar-end">
        <button type="button" className="btn-open-modal" onClick={() => openForm()}>
          <PlusIcon size={16} />
          <span>Add item</span>
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="wishlist-items-title">
            <div className="section-head">
              <h2 id="wishlist-items-title" className="section-title">
                Items
              </h2>
              <span className="muted number-tabular">{items.length}</span>
            </div>

            <Segmented
              label="Filter by priority"
              value={filterPriority}
              options={FILTERS}
              onChange={setFilterPriority}
            />

            <div className="entries">
              {filteredItems.length === 0 ? (
                <p className="empty-note">
                  {items.length === 0 ? "No items yet." : "No items with this priority."}
                </p>
              ) : (
                filteredItems.map((item) => (
                  <div key={item.id} className="entry-row item-row">
                    <strong className="item-name">{item.name}</strong>
                    <div className="item-meta">
                      <span className={`badge ${PRIORITY_BADGE[item.priority as Priority]}`}>{item.priority}</span>
                      <span className="item-price number-tabular">{formatRon(Number(item.estimatedPrice))} RON</span>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="item-link">
                          Link ↗
                        </a>
                      )}
                    </div>

                    <div className="item-actions">
                      <button
                        type="button"
                        className="btn-sm tint"
                        onClick={() => handleRemove(item.id, "bought")}
                        disabled={busy}
                        title="Mark as bought and remove from the list"
                      >
                        <CheckIcon size={12} strokeWidth={2.5} /> Buy
                      </button>
                      <button
                        type="button"
                        className="delete-icon-btn edit"
                        onClick={() => openForm(item)}
                        disabled={busy}
                        aria-label={`Edit ${item.name}`}
                        title="Edit"
                      >
                        <PencilIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleRemove(item.id, "deleted")}
                        disabled={busy}
                        aria-label={`Delete ${item.name}`}
                        title="Delete"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-labelledby="wishlist-summary-title">
            <div className="section-head">
              <h2 id="wishlist-summary-title" className="section-title">
                Estimated Investment
              </h2>
            </div>
            <div className="macro-card">
              <span className="macro-title">Total Estimated</span>
              <span className="macro-numbers number-tabular item-total">
                {formatRon(totalCost)} <span className="macro-target">RON</span>
              </span>
            </div>
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
                placeholder="e.g. Headphones"
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
                placeholder="0.00"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
                disabled={busy}
                required
                className="number-tabular"
              />
            </label>

            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} disabled={busy}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            <label>
              Link (optional)
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
            </label>

            {errorMsg && <p className="error">{errorMsg}</p>}
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="secondary" onClick={() => setIsModalOpen(false)} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !name.trim() || !estimatedPrice} style={{ flex: 2 }}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
