"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { addWishlistItemAction, deleteWishlistItemAction } from "@/app/actions/wishlist";
import { WishlistItemData } from "@/lib/wishlist";

interface WishlistClientProps {
  userName: string;
  initialItems: WishlistItemData[];
  initialStats?: {
    totalItems: number;
    totalEstimatedCost: number;
  };
}

export function WishlistClient({
  userName,
  initialItems,
}: WishlistClientProps) {
  const [items, setItems] = useState<WishlistItemData[]>(initialItems);
  const [filterPriority, setFilterPriority] = useState<"all" | "high" | "medium" | "low">("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const { showToast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const totalCost = items.reduce((sum, item) => sum + Number(item.estimatedPrice), 0);

  const filteredItems = items.filter((item) => {
    if (filterPriority === "all") return true;
    return item.priority === filterPriority;
  });

  async function handleAddItem(e: React.FormEvent) {
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

    setBusy(true);
    try {
      const res = await addWishlistItemAction({
        name: name.trim(),
        estimatedPrice: parsedPrice,
        priority,
        url: url.trim() || undefined,
      });

      if (res.success && res.item) {
        setItems((prev) => [res.item as WishlistItemData, ...prev]);
        setName("");
        setEstimatedPrice("");
        setUrl("");
        setPriority("medium");
        setIsAddModalOpen(false);
        showToast({
          message: `Added "${res.item.name}" (${parsedPrice.toFixed(2)} RON)`,
          type: "success",
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(id: string, reason: "bought" | "deleted" = "deleted") {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    // Optimistic removal
    setItems((prev) => prev.filter((item) => item.id !== id));

    setBusy(true);
    try {
      const res = await deleteWishlistItemAction(id);
      if (res.success) {
        showToast({
          message: reason === "bought" ? `Purchased "${target.name}"!` : `Removed "${target.name}"`,
          actionLabel: "Undo",
          onAction: async () => {
            const reRes = await addWishlistItemAction({
              name: target.name,
              estimatedPrice: Number(target.estimatedPrice),
              priority: target.priority as "low" | "medium" | "high",
              url: target.url || undefined,
            });
            if (reRes.success && reRes.item) {
              setItems((prev) => [reRes.item as WishlistItemData, ...prev]);
            }
          },
        });
      }
    } catch {
      // Revert if error
      setItems((prev) => [target, ...prev]);
      setErrorMsg("Failed to delete item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

      {/* Action Bar Header */}
      <div className="action-bar-header">
        <div>
          <span className="badge badge-info">Cost & Priority Planning</span>
          <h2 style={{ marginTop: "0.25rem" }}>Personal Wishlist</h2>
        </div>

        <button
          type="button"
          className="btn-open-modal"
          onClick={() => {
            setErrorMsg("");
            setIsAddModalOpen(true);
          }}
          aria-label="Open add wishlist item dialog"
        >
          <PlusIcon size={16} />
          <span>Add Desire</span>
        </button>
      </div>

      <div className="dashboard-grid">
        {/* Left Column: Filterable Wishlist Items */}
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="wishlist-items-title">
            <div className="section-heading" style={{ flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
              <div>
                <h2 id="wishlist-items-title">Purchase Desires</h2>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  Showing {filteredItems.length} of {items.length} items
                </span>
              </div>

              {/* Filter Pills */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {(["all", "high", "medium", "low"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={filterPriority === p ? "" : "secondary"}
                    style={{ minHeight: "2rem", padding: "0.25rem 0.75rem", fontSize: "0.8rem", textTransform: "capitalize" }}
                    onClick={() => setFilterPriority(p)}
                  >
                    {p === "all" ? `All (${items.length})` : p}
                  </button>
                ))}
              </div>
            </div>

            <div className="entries">
              {filteredItems.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "2.5rem 0" }}>
                  {items.length === 0
                    ? "Your wishlist is empty. Tap Add Desire to save your first goal."
                    : "No items match this priority filter."}
                </p>
              ) : (
                filteredItems.map((item) => (
                  <div key={item.id} className="entry-row" style={{ alignItems: "center" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span
                          className="badge"
                          style={{
                            fontSize: "0.75rem",
                            textTransform: "capitalize",
                            background:
                              item.priority === "high"
                                ? "rgba(240, 138, 138, 0.15)"
                                : item.priority === "medium"
                                ? "rgba(239, 197, 111, 0.15)"
                                : "rgba(179, 168, 161, 0.15)",
                            color:
                              item.priority === "high"
                                ? "var(--danger)"
                                : item.priority === "medium"
                                ? "var(--warning)"
                                : "var(--secondary)",
                          }}
                        >
                          {item.priority}
                        </span>
                        <strong style={{ fontSize: "1rem" }}>{item.name}</strong>
                      </div>

                      <div style={{ display: "flex", gap: "0.85rem", marginTop: "0.3rem", fontSize: "0.85rem" }}>
                        <span className="number-tabular" style={{ fontWeight: 600, color: "var(--tint)" }}>
                          {Number(item.estimatedPrice).toLocaleString("ro-RO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          RON
                        </span>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--secondary)", textDecoration: "underline" }}
                          >
                            Store Link ↗
                          </a>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id, "bought")}
                        disabled={busy}
                        style={{
                          minHeight: "2.1rem",
                          padding: "0.25rem 0.65rem",
                          fontSize: "0.8rem",
                          background: "var(--success-subtle)",
                          color: "var(--success)",
                          border: "1px solid rgba(143, 209, 158, 0.25)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                        title="Mark as bought and remove from list"
                      >
                        <CheckIcon size={12} strokeWidth={2.5} /> Bought
                      </button>

                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteItem(item.id, "deleted")}
                        disabled={busy}
                        aria-label={`Delete ${item.name}`}
                        title="Delete item"
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

        {/* Right Column: Cost Summary & Guidelines */}
        <div className="dashboard-aside">
          {/* Summary Card */}
          <section className="surface" aria-labelledby="wishlist-summary-title">
            <span className="badge badge-info">Budget Allocation</span>
            <h2 id="wishlist-summary-title" style={{ marginTop: "0.35rem", fontSize: "1.25rem" }}>
              Estimated Investment
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.75rem", marginTop: "1rem" }}>
              <div className="macro-card">
                <span className="macro-title">Total Estimated</span>
                <span className="macro-numbers number-tabular" style={{ fontSize: "1.6rem", color: "var(--tint)" }}>
                  {totalCost.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  <span className="macro-target" style={{ fontSize: "1rem" }}>RON</span>
                </span>
              </div>

              <div className="macro-card">
                <span className="macro-title">High Priority Items</span>
                <span className="macro-numbers number-tabular" style={{ fontSize: "1.6rem" }}>
                  {items.filter((i) => i.priority === "high").length}{" "}
                  <span className="macro-target" style={{ fontSize: "1rem" }}>items</span>
                </span>
              </div>
            </div>
          </section>

          {/* Decision Rule Card */}
          <section className="surface" style={{ padding: "1.35rem" }}>
            <h3 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "var(--secondary)", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>
              72-Hour Rule
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
              Wait at least 72 hours before purchasing non-essential items. If the desire remains strong after 3 days, it represents genuine value rather than impulse.
            </p>
          </section>
        </div>
      </div>

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Purchase Desire"
      >
        <form onSubmit={handleAddItem} style={{ display: "grid", gap: "0.85rem" }}>
          <label>
            Item Name
            <input
              type="text"
              autoFocus
              placeholder="e.g. Sony WH-1000XM5 Headphones"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          <label>
            Estimated Price (RON)
            <input
              type="number"
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
            Priority Level
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
              disabled={busy}
            >
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </label>

          <label>
            Store Link (Optional)
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </label>

          {errorMsg && (
            <p className="error" style={{ margin: 0 }}>
              {errorMsg}
            </p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsAddModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim() || !estimatedPrice}
              style={{ flex: 2 }}
            >
              {busy ? "Adding..." : "+ Save to Wishlist"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
