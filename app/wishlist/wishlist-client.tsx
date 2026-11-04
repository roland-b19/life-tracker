"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
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
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(id: string) {
    setBusy(true);
    try {
      const res = await deleteWishlistItemAction(id);
      if (res.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      setErrorMsg("Failed to delete item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Navigation userName={userName} />

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

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {filteredItems.length === 0 ? (
                <p className="muted" style={{ padding: "2rem 0", textAlign: "center" }}>
                  {items.length === 0
                    ? "Your wishlist is empty. Add your desired purchases using the panel on the right."
                    : `No items with ${filterPriority} priority found.`}
                </p>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "1rem 1.15rem",
                      borderRadius: "0.85rem",
                      border: "1px solid var(--separator)",
                      background: "var(--surface-solid)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "1rem",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "1.05rem" }}>{item.name}</span>
                        <span
                          className={`badge ${
                            item.priority === "high"
                              ? "badge-danger"
                              : item.priority === "medium"
                              ? "badge-warning"
                              : "badge-rest"
                          }`}
                        >
                          {item.priority}
                        </span>
                      </div>

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontSize: "0.8rem",
                            color: "var(--tint)",
                            textDecoration: "none",
                            marginTop: "0.35rem",
                          }}
                        >
                          <span>Visit Store Link ↗</span>
                        </a>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {Number(item.estimatedPrice).toLocaleString("ro-RO", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>RON</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={busy}
                        style={{
                          minHeight: "2rem",
                          padding: "0.25rem 0.65rem",
                          fontSize: "0.8rem",
                          background: "var(--success-subtle)",
                          color: "var(--success)",
                          border: "1px solid rgba(52, 199, 89, 0.25)",
                        }}
                        title="Mark as bought and remove from list"
                      >
                        ✓ Bought
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Cost Summary & Add Item Form */}
        <div className="dashboard-aside sticky">
          {/* Summary Card */}
          <section className="surface" aria-labelledby="wishlist-summary-title">
            <span className="badge badge-info">Cost Estimation</span>
            <h2 id="wishlist-summary-title" style={{ marginTop: "0.35rem", fontSize: "1.3rem" }}>
              Budget Overview
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
              <div className="macro-card">
                <span className="macro-title">Total Estimated</span>
                <span className="macro-numbers" style={{ fontSize: "1.4rem", color: "var(--tint)" }}>
                  {totalCost.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  <span className="macro-target">RON</span>
                </span>
              </div>

              <div className="macro-card">
                <span className="macro-title">High Priority</span>
                <span className="macro-numbers" style={{ fontSize: "1.4rem" }}>
                  {items.filter((i) => i.priority === "high").length}{" "}
                  <span className="macro-target">items</span>
                </span>
              </div>
            </div>
          </section>

          {/* Add New Wishlist Item Form */}
          <section className="surface" aria-labelledby="add-wishlist-title">
            <h2 id="add-wishlist-title" style={{ fontSize: "1.15rem" }}>
              + Add Purchase Desire
            </h2>

            <form onSubmit={handleAddItem} style={{ marginTop: "0.85rem", display: "grid", gap: "0.75rem" }}>
              <label>
                Item Name
                <input
                  type="text"
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
                />
              </label>

              <label>
                Priority Level
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                  disabled={busy}
                >
                  <option value="high">🔴 High Priority</option>
                  <option value="medium">🟡 Medium Priority</option>
                  <option value="low">⚪ Low Priority</option>
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

              <button
                type="submit"
                disabled={busy || !name.trim() || !estimatedPrice}
                style={{ width: "100%", marginTop: "0.35rem" }}
              >
                {busy ? "Adding..." : "+ Add to Wishlist"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
