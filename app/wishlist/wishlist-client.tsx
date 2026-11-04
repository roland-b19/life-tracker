"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import { addWishlistItemAction, deleteWishlistItemAction } from "@/app/actions/wishlist";
import { WishlistItemData } from "@/lib/wishlist";

interface WishlistClientProps {
  userName: string;
  initialItems: WishlistItemData[];
  initialStats: {
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

      {/* Summary Header Card */}
      <section className="surface" aria-labelledby="wishlist-summary-title">
        <div className="section-heading">
          <div>
            <span className="badge badge-info">Private Wishlist</span>
            <h2 id="wishlist-summary-title" style={{ marginTop: "0.25rem" }}>
              Purchase Desires
            </h2>
          </div>
          <span className="muted">{items.length} items planned</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
          <div className="macro-card">
            <span className="macro-title">Total Estimated Cost</span>
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
      <section className="surface" aria-labelledby="add-wishlist-title" style={{ marginTop: "1.25rem" }}>
        <h2 id="add-wishlist-title" style={{ fontSize: "1.1rem" }}>
          + Add Wishlist Item
        </h2>

        <form onSubmit={handleAddItem} style={{ marginTop: "0.85rem", display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: "0.5rem" }}>
            <label>
              Item Title
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
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
                disabled={busy}
                style={{
                  minHeight: "2.75rem",
                  borderRadius: "0.65rem",
                  border: "1px solid var(--separator)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  padding: "0.5rem",
                }}
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
          </div>

          {errorMsg && (
            <p className="error" style={{ color: "var(--tint)", margin: 0, fontSize: "0.85rem" }}>
              {errorMsg}
            </p>
          )}

          <button type="submit" disabled={busy || !name.trim() || !estimatedPrice} style={{ alignSelf: "start" }}>
            {busy ? "Adding..." : "+ Add to Wishlist"}
          </button>
        </form>
      </section>

      {/* Items Filter & List */}
      <section className="surface" aria-labelledby="wishlist-items-title" style={{ marginTop: "1.25rem" }}>
        <div className="section-heading" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 id="wishlist-items-title" style={{ fontSize: "1.1rem" }}>
            Wishlist Items
          </h2>

          {/* Filter Pills */}
          <div style={{ display: "flex", gap: "0.35rem" }}>
            {(["all", "high", "medium", "low"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={filterPriority === p ? "" : "secondary"}
                style={{ minHeight: "1.9rem", padding: "0.2rem 0.65rem", fontSize: "0.8rem", textTransform: "capitalize" }}
                onClick={() => setFilterPriority(p)}
              >
                {p === "all" ? `All (${items.length})` : p}
              </button>
            ))}
          </div>
        </div>

        <div className="entries" style={{ marginTop: "1rem" }}>
          {filteredItems.length === 0 ? (
            <p className="muted" style={{ padding: "0.5rem 0" }}>
              {items.length === 0
                ? "Your wishlist is empty. Add your desired purchases above!"
                : `No items found with ${filterPriority} priority.`}
            </p>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="entry-row" style={{ alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong>{item.name}</strong>
                    <span
                      className="badge"
                      style={{
                        fontSize: "0.75rem",
                        background:
                          item.priority === "high"
                            ? "rgba(255, 59, 48, 0.15)"
                            : item.priority === "medium"
                            ? "rgba(255, 149, 0, 0.15)"
                            : "rgba(142, 142, 147, 0.15)",
                        color:
                          item.priority === "high"
                            ? "#ff3b30"
                            : item.priority === "medium"
                            ? "#ff9500"
                            : "var(--muted)",
                      }}
                    >
                      {item.priority}
                    </span>
                  </div>

                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem", color: "var(--tint)", fontWeight: "600" }}>
                    {Number(item.estimatedPrice).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "0.25rem 0.65rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.8rem",
                        textDecoration: "none",
                        color: "var(--text)",
                        background: "var(--surface)",
                        border: "1px solid var(--separator)",
                      }}
                    >
                      Store ↗
                    </a>
                  )}

                  <button
                    type="button"
                    className="danger"
                    style={{ minHeight: "2rem", padding: "0.25rem 0.65rem", fontSize: "0.8rem" }}
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={busy}
                    title="Mark as bought and remove from list"
                  >
                    Bought
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
