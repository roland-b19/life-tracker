"use client";

import { useState } from "react";
import { Navigation } from "../components/navigation";
import {
  DropIcon,
  FootstepsIcon,
  ScaleIcon,
  ChatIcon,
  LockIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import {
  addShoppingItemAction,
  addWaterAction,
  clearBoughtItemsAction,
  deleteMealAction,
  deleteShoppingItemAction,
  generateShoppingListAction,
  logMealAction,
  toggleShoppingItemAction,
  updateStepsAction,
} from "@/app/actions/food";
import {
  generateFoodTokenAction,
  revokeFoodTokenAction,
} from "@/app/actions/api-tokens";
import { sendFoodChatMessageAction } from "@/app/actions/food-chat";
import { WeightAnalytics } from "@/lib/food";

interface MealData {
  id: string;
  date: string;
  mealType: string;
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  isEstimated?: boolean;
}

interface ApiTokenData {
  id: string;
  name: string;
  scope: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

interface ShoppingItemData {
  id: string;
  name: string;
  amount: string;
  unit: string;
  category: string;
  isBought: boolean;
}

interface FoodClientProps {
  userName: string;
  todayDate: string;
  targets: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    waterMl: number;
    steps: number;
  };
  initialSummary: {
    date: string;
    meals: MealData[];
    totals: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    metrics: {
      waterMl: number;
      steps: number;
      notes: string | null;
    };
  };
  weightAnalytics: WeightAnalytics;
  initialShoppingList: ShoppingItemData[];
  initialTokens?: ApiTokenData[];
}

export function FoodClient({
  userName,
  todayDate,
  targets,
  initialSummary,
  weightAnalytics,
  initialShoppingList,
  initialTokens = [],
}: FoodClientProps) {
  const [selectedDate] = useState(todayDate);
  const [summary, setSummary] = useState(initialSummary);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const [tokens, setTokens] = useState<ApiTokenData[]>(initialTokens);
  const [activeTab, setActiveTab] = useState<"daily" | "shopping" | "chat" | "api">("daily");
  const [tokenNameInput, setTokenNameInput] = useState("");
  const [generatedPlaintextToken, setGeneratedPlaintextToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);

  const { showToast } = useToast();

  // In-app Food AI Chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      role: "user" | "model";
      text: string;
      toolExecuted?: {
        name: string;
        args: Record<string, unknown>;
        result: Record<string, unknown>;
      };
    }>
  >([
    {
      role: "model",
      text: "Salut! Sunt asistentul tău de nutriție. Spune-mi ce ai mâncat sau băut (de exemplu: „la prânz am avut o ciorbă de pui și 2 felii de pâine”), iar eu voi calcula caloriile și macro-urile și le voi înregistra direct în aplicație. Mă poți întreba și despre rețete sau poți adăuga alimente pe lista de cumpărături!",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Meal input state
  const [mealType, setMealType] = useState<"breakfast" | "lunch" | "dinner" | "snack">("lunch");
  const [mealName, setMealName] = useState("");
  const [mealCalories, setMealCalories] = useState("");
  const [mealProtein, setMealProtein] = useState("");
  const [mealCarbs, setMealCarbs] = useState("");
  const [mealFat, setMealFat] = useState("");

  // Steps input state
  const [stepsInput, setStepsInput] = useState(String(summary.metrics.steps || ""));

  // Shopping input state
  const [shopName, setShopName] = useState("");
  const [shopAmount, setShopAmount] = useState("1");
  const [shopUnit, setShopUnit] = useState("pcs");
  const [shopCategory, setShopCategory] = useState<
    "meat" | "produce" | "dairy" | "bakery" | "pantry" | "other"
  >("other");

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function handleLogMeal(e: React.FormEvent) {
    e.preventDefault();
    if (!mealName.trim()) return;

    setBusy(true);
    setStatusMessage("");
    try {
      const res = await logMealAction({
        date: selectedDate,
        mealType,
        name: mealName.trim(),
        calories: parseInt(mealCalories, 10) || 0,
        protein: parseFloat(mealProtein) || 0,
        carbs: parseFloat(mealCarbs) || 0,
        fat: parseFloat(mealFat) || 0,
      });

      if (res.success && res.meal) {
        setSummary((prev) => ({
          ...prev,
          meals: [...prev.meals, res.meal as MealData],
          totals: {
            calories: prev.totals.calories + res.meal.calories,
            protein: Math.round((prev.totals.protein + parseFloat(res.meal.protein)) * 10) / 10,
            carbs: Math.round((prev.totals.carbs + parseFloat(res.meal.carbs)) * 10) / 10,
            fat: Math.round((prev.totals.fat + parseFloat(res.meal.fat)) * 10) / 10,
          },
        }));

        setMealName("");
        setMealCalories("");
        setMealProtein("");
        setMealCarbs("");
        setMealFat("");
        setIsMealModalOpen(false);
        showToast({
          message: `Logged meal "${res.meal.name}" (${res.meal.calories} kcal)`,
          type: "success",
        });
      }
    } catch {
      setStatusMessage("Failed to log meal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMeal(mealId: string) {
    const deleted = summary.meals.find((m) => m.id === mealId);
    if (!deleted) return;

    // Optimistic removal
    setSummary((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== mealId),
      totals: {
        calories: Math.max(0, prev.totals.calories - deleted.calories),
        protein: Math.max(0, Math.round((prev.totals.protein - parseFloat(deleted.protein)) * 10) / 10),
        carbs: Math.max(0, Math.round((prev.totals.carbs - parseFloat(deleted.carbs)) * 10) / 10),
        fat: Math.max(0, Math.round((prev.totals.fat - parseFloat(deleted.fat)) * 10) / 10),
      },
    }));

    setBusy(true);
    try {
      await deleteMealAction(mealId);
      showToast({
        message: `Deleted "${deleted.name}"`,
        actionLabel: "Undo",
        onAction: async () => {
          const res = await logMealAction({
            date: deleted.date,
            mealType: deleted.mealType as "breakfast" | "lunch" | "dinner" | "snack",
            name: deleted.name,
            calories: deleted.calories,
            protein: parseFloat(deleted.protein),
            carbs: parseFloat(deleted.carbs),
            fat: parseFloat(deleted.fat),
          });
          if (res.success && res.meal) {
            setSummary((prev) => ({
              ...prev,
              meals: [...prev.meals, res.meal as MealData],
              totals: {
                calories: prev.totals.calories + res.meal.calories,
                protein: Math.round((prev.totals.protein + parseFloat(res.meal.protein)) * 10) / 10,
                carbs: Math.round((prev.totals.carbs + parseFloat(res.meal.carbs)) * 10) / 10,
                fat: Math.round((prev.totals.fat + parseFloat(res.meal.fat)) * 10) / 10,
              },
            }));
          }
        },
      });
    } catch {
      // Revert if error
      setSummary((prev) => ({
        ...prev,
        meals: [...prev.meals, deleted],
        totals: {
          calories: prev.totals.calories + deleted.calories,
          protein: Math.round((prev.totals.protein + parseFloat(deleted.protein)) * 10) / 10,
          carbs: Math.round((prev.totals.carbs + parseFloat(deleted.carbs)) * 10) / 10,
          fat: Math.round((prev.totals.fat + parseFloat(deleted.fat)) * 10) / 10,
        },
      }));
      setStatusMessage("Failed to delete meal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddWater(amountMl: number) {
    setBusy(true);
    try {
      const res = await addWaterAction(selectedDate, amountMl);
      if (res.success && res.metrics) {
        setSummary((prev) => ({
          ...prev,
          metrics: {
            ...prev.metrics,
            waterMl: res.metrics.waterMl,
          },
        }));
      }
    } catch {
      setStatusMessage("Could not update water.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSteps() {
    const stepsNum = parseInt(stepsInput, 10);
    if (isNaN(stepsNum) || stepsNum < 0) return;

    setBusy(true);
    try {
      const res = await updateStepsAction(selectedDate, stepsNum);
      if (res.success && res.metrics) {
        setSummary((prev) => ({
          ...prev,
          metrics: {
            ...prev.metrics,
            steps: res.metrics.steps,
          },
        }));
        setStatusMessage("Steps updated!");
      }
    } catch {
      setStatusMessage("Could not update steps.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddShoppingItem(e: React.FormEvent) {
    e.preventDefault();
    if (!shopName.trim()) return;

    setBusy(true);
    try {
      const res = await addShoppingItemAction({
        name: shopName.trim(),
        amount: parseFloat(shopAmount) || 1,
        unit: shopUnit.trim() || "pcs",
        category: shopCategory,
      });

      if (res.success && res.item) {
        setShoppingList((prev) => [...prev, res.item as ShoppingItemData]);
        setShopName("");
        setShopAmount("1");
      }
    } catch {
      setStatusMessage("Could not add shopping item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleShopping(itemId: string, currentState: boolean) {
    try {
      await toggleShoppingItemAction(itemId, !currentState);
      setShoppingList((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, isBought: !currentState } : item,
        ),
      );
    } catch {
      setStatusMessage("Could not update item.");
    }
  }

  async function handleDeleteShoppingItem(itemId: string) {
    try {
      await deleteShoppingItemAction(itemId);
      setShoppingList((prev) => prev.filter((item) => item.id !== itemId));
    } catch {
      setStatusMessage("Could not delete item.");
    }
  }

  async function handleGenerateShoppingList() {
    setBusy(true);
    try {
      const res = await generateShoppingListAction();
      if (res.success && res.items) {
        setShoppingList((prev) => [...prev, ...(res.items as ShoppingItemData[])]);
        setStatusMessage("Shopping list populated from recipes!");
      }
    } catch {
      setStatusMessage("Failed to generate shopping list.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearBought() {
    setBusy(true);
    try {
      await clearBoughtItemsAction();
      setShoppingList((prev) => prev.filter((item) => !item.isBought));
      setStatusMessage("Cleared bought items!");
    } catch {
      setStatusMessage("Failed to clear bought items.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateToken(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatusMessage("");
    try {
      const res = await generateFoodTokenAction(tokenNameInput.trim() || undefined);
      if (res.success && res.token) {
        setGeneratedPlaintextToken(res.token.plaintextToken);
        setTokens((prev) => [
          {
            id: res.token.id,
            name: res.token.name,
            scope: res.token.scope,
            lastUsedAt: null,
            createdAt: res.token.createdAt,
          },
          ...prev,
        ]);
        setTokenNameInput("");
        setStatusMessage("API token generated successfully. Copy it now, it won't be shown again!");
      }
    } catch {
      setStatusMessage("Failed to generate API token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeToken(tokenId: string) {
    if (!confirm("Are you sure you want to revoke this API token? Any client using it will be disconnected.")) {
      return;
    }
    setBusy(true);
    setStatusMessage("");
    try {
      const res = await revokeFoodTokenAction(tokenId);
      if (res.success) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
        setStatusMessage("API token revoked.");
      }
    } catch {
      setStatusMessage("Failed to revoke API token.");
    } finally {
      setBusy(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendChatMessage(textToSend?: string) {
    const text = (textToSend || chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg = { role: "user" as const, text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const history = chatMessages.map((m) => ({ role: m.role, text: m.text }));
      const res = await sendFoodChatMessageAction(text, history, selectedDate);
      if (res.success) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "model",
            text: res.reply,
            toolExecuted: res.toolExecuted,
          },
        ]);

        if (res.freshSummary) {
          setSummary(res.freshSummary);
        }
        if (res.freshShoppingList) {
          setShoppingList(res.freshShoppingList);
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "A apărut o eroare la procesarea mesajului. Te rog să reîncerci.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  const caloriePct = Math.min(100, Math.round((summary.totals.calories / targets.calories) * 100));
  const proteinPct = Math.min(100, Math.round((summary.totals.protein / targets.proteinGrams) * 100));
  const carbsPct = Math.min(100, Math.round((summary.totals.carbs / targets.carbsGrams) * 100));
  const fatPct = Math.min(100, Math.round((summary.totals.fat / targets.fatGrams) * 100));
  const waterPct = Math.min(100, Math.round((summary.metrics.waterMl / targets.waterMl) * 100));

  return (
    <main>
      <Navigation userName={userName} />

      {/* Sub tabs: Daily Log vs Shopping List vs Food AI Chat vs AI Connector API */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={activeTab === "daily" ? "" : "secondary"}
          onClick={() => setActiveTab("daily")}
        >
          Daily Macros & Log
        </button>
        <button
          type="button"
          className={activeTab === "shopping" ? "" : "secondary"}
          onClick={() => setActiveTab("shopping")}
        >
          Shopping List ({shoppingList.filter((i) => !i.isBought).length})
        </button>
        <button
          type="button"
          className={activeTab === "chat" ? "" : "secondary"}
          onClick={() => setActiveTab("chat")}
        >
          Food Assistant
        </button>
        <button
          type="button"
          className={activeTab === "api" ? "" : "secondary"}
          onClick={() => setActiveTab("api")}
        >
          AI Connector API (MCP)
        </button>
      </div>

      {activeTab === "daily" && (
        <>
          {/* Daily Macros Target & Progress */}
          <section className="surface" aria-labelledby="macros-title">
            <div className="section-heading">
              <div>
                <span className="badge badge-info">Today&apos;s Targets</span>
                <h2 id="macros-title" style={{ marginTop: "0.25rem" }}>
                  Nutrition Summary
                </h2>
              </div>
              <span className="muted">{selectedDate}</span>
            </div>

            <div className="macro-grid">
              <div className="macro-card">
                <span className="macro-title">Calories</span>
                <span className="macro-numbers">
                  {summary.totals.calories}{" "}
                  <span className="macro-target">/ {targets.calories} kcal</span>
                </span>
                <div className="progress-track">
                  <div
                    className={`progress-fill ${summary.totals.calories > targets.calories ? "over" : ""}`}
                    style={{ width: `${caloriePct}%` }}
                  />
                </div>
              </div>

              <div className="macro-card">
                <span className="macro-title">Protein</span>
                <span className="macro-numbers">
                  {summary.totals.protein}g{" "}
                  <span className="macro-target">/ {targets.proteinGrams}g</span>
                </span>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${proteinPct}%` }}
                  />
                </div>
              </div>

              <div className="macro-card">
                <span className="macro-title">Carbs</span>
                <span className="macro-numbers">
                  {summary.totals.carbs}g{" "}
                  <span className="macro-target">/ {targets.carbsGrams}g</span>
                </span>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${carbsPct}%` }}
                  />
                </div>
              </div>

              <div className="macro-card">
                <span className="macro-title">Fat</span>
                <span className="macro-numbers">
                  {summary.totals.fat}g{" "}
                  <span className="macro-target">/ {targets.fatGrams}g</span>
                </span>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${fatPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Water Tap Counter */}
            <div className="water-card">
              <div>
                <span style={{ fontSize: "1.05rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <DropIcon size={16} /> Water Tracker
                </span>
                <p style={{ margin: "0.15rem 0 0" }} className="muted">
                  {summary.metrics.waterMl} ml / {targets.waterMl} ml ({waterPct}%)
                </p>
                <div className="progress-track" style={{ width: "12rem", marginTop: "0.4rem" }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${waterPct}%`, background: "var(--tint)" }}
                  />
                </div>
              </div>
              <div className="tap-buttons">
                <button
                  type="button"
                  className="secondary tap-btn"
                  disabled={busy}
                  onClick={() => handleAddWater(250)}
                >
                  +250 ml
                </button>
                <button
                  type="button"
                  className="secondary tap-btn"
                  disabled={busy}
                  onClick={() => handleAddWater(500)}
                >
                  +500 ml
                </button>
              </div>
            </div>

            {/* Steps & Weight Trend Cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
                gap: "0.75rem",
                marginTop: "1rem",
              }}
            >
              {/* Daily Steps */}
              <div className="surface" style={{ padding: "0.85rem", background: "var(--background)" }}>
                <span className="macro-title" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <FootstepsIcon size={14} /> Daily Steps
                </span>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                  <input
                    type="number"
                    style={{ minHeight: "2.2rem", padding: "0.2rem 0.5rem" }}
                    placeholder="Steps count"
                    value={stepsInput}
                    onChange={(e) => setStepsInput(e.target.value)}
                  />
                  <button
                    type="button"
                    style={{ minHeight: "2.2rem", padding: "0.2rem 0.75rem", fontSize: "0.85rem" }}
                    disabled={busy}
                    onClick={handleUpdateSteps}
                  >
                    Save
                  </button>
                </div>
                <span className="muted" style={{ fontSize: "0.8rem", marginTop: "0.3rem", display: "block" }}>
                  Target: {targets.steps} steps / day
                </span>
              </div>

              {/* 7-Day Weight Analytics */}
              <div className="surface" style={{ padding: "0.85rem", background: "var(--background)" }}>
                <span className="macro-title" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <ScaleIcon size={14} /> Weight Trend
                </span>
                <div style={{ marginTop: "0.4rem" }}>
                  <strong style={{ fontSize: "1.1rem" }}>
                    {weightAnalytics.sevenDayAverage
                      ? `${weightAnalytics.sevenDayAverage} kg (7-day avg)`
                      : weightAnalytics.latestWeight
                      ? `${weightAnalytics.latestWeight} kg`
                      : "No weigh-ins yet"}
                  </strong>
                  {weightAnalytics.weeklyRateOfChange !== null && (
                    <span
                      className="badge"
                      style={{
                        marginLeft: "0.5rem",
                        background:
                          weightAnalytics.trend === "gaining"
                            ? "rgba(52, 199, 89, 0.15)"
                            : "rgba(255, 149, 0, 0.15)",
                        color:
                          weightAnalytics.trend === "gaining" ? "#34c759" : "#ff9500",
                      }}
                    >
                      {weightAnalytics.weeklyRateOfChange > 0 ? "+" : ""}
                      {weightAnalytics.weeklyRateOfChange} kg/week
                    </span>
                  )}
                </div>
                <span className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem", display: "block" }}>
                  {weightAnalytics.previousWeekAverage
                    ? `Previous week avg: ${weightAnalytics.previousWeekAverage} kg`
                    : "Log daily weigh-ins in Weigh-ins tab for rolling trends"}
                </span>
              </div>
            </div>
          </section>

          {/* Daily Dashboard Grid: Meals & Fast Entry */}
          <div className="dashboard-grid" style={{ marginTop: "1.25rem" }}>
            {/* Left Column: Today's Meals Log */}
            <div className="dashboard-main">
              <section className="surface" aria-labelledby="meals-history-title">
                <div className="section-heading">
                  <div>
                    <span className="badge badge-info">{summary.meals.length} Logged Meals</span>
                    <h2 id="meals-history-title" style={{ marginTop: "0.25rem" }}>
                      Today&apos;s Meals
                    </h2>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className="muted number-tabular" style={{ fontWeight: 600 }}>
                      {summary.totals.calories} kcal total
                    </span>
                    <button
                      type="button"
                      className="btn-open-modal"
                      onClick={() => setIsMealModalOpen(true)}
                      style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", minHeight: "38px" }}
                    >
                      <PlusIcon size={14} />
                      <span>Log Meal</span>
                    </button>
                  </div>
                </div>

                <div className="entries" style={{ marginTop: "1rem" }}>
                  {summary.meals.length === 0 && (
                    <p className="muted" style={{ padding: "2rem 0", textAlign: "center" }}>
                      No meals logged for today yet. Use the quick logger on the right or ask the Food AI Chat.
                    </p>
                  )}
                  {summary.meals.map((meal) => (
                    <div key={meal.id} className="entry-row">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                          <span className="badge badge-info">
                            {meal.mealType}
                          </span>
                          <strong>{meal.name}</strong>
                          {meal.isEstimated && (
                            <span
                              className="badge"
                              style={{
                                background: "rgba(175, 82, 222, 0.15)",
                                color: "#af52de",
                                fontSize: "0.75rem",
                              }}
                            >
                              AI Estimated
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }} className="muted">
                          {meal.calories} kcal · {meal.protein}g P · {meal.carbs}g C · {meal.fat}g F
                        </p>
                      </div>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteMeal(meal.id)}
                        aria-label={`Delete meal ${meal.name}`}
                        title="Delete meal"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Right Column: AI Assistant Prompt & Nutrition Coaching */}
            <div className="dashboard-aside">
              {/* Fast AI Chat Shortcut */}
              <section className="surface" style={{ padding: "1.35rem", textAlign: "center" }}>
                <span className="badge badge-info" style={{ marginBottom: "0.4rem" }}>
                  Conversational Food AI
                </span>
                <h3 style={{ fontSize: "1.05rem", margin: "0.3rem 0 0.5rem" }}>
                  Natural Language Logging
                </h3>
                <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 1rem", lineHeight: 1.5 }}>
                  Simply tell Food AI what you ate (e.g. &ldquo;am mâncat o ciorbă de pui cu smântână&rdquo;) and it computes macros and logs it automatically.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setActiveTab("chat")}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.45rem", minHeight: "44px" }}
                >
                  <ChatIcon size={16} />
                  <span>Open Food Assistant</span>
                </button>
              </section>

              {/* Nutrition Guidelines Card */}
              <section className="surface" style={{ padding: "1.35rem" }}>
                <h3 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "var(--secondary)", letterSpacing: "0.05em", margin: "0 0 0.5rem" }}>
                  Macro Priorities
                </h3>
                <p className="muted" style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>
                  Hit your daily protein target first to preserve lean muscle mass. Water and steps directly correlate with energetic deficit consistency.
                </p>
              </section>
            </div>
          </div>
        </>
      )}

      {activeTab === "shopping" && (
        /* Shopping List View */
        <section className="surface" aria-labelledby="shopping-title">
          <div className="section-heading">
            <div>
              <h2 id="shopping-title">Smart Shopping List</h2>
              <span className="muted">Grouped by category from meal plans</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={handleGenerateShoppingList}
              >
                + From Recipes
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy || shoppingList.filter((i) => i.isBought).length === 0}
                onClick={handleClearBought}
              >
                Clear Bought
              </button>
            </div>
          </div>

          {/* Quick Add Shopping Item Form */}
          <form
            onSubmit={handleAddShoppingItem}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(6.5rem, 1fr))",
              gap: "0.5rem",
              marginTop: "1rem",
              alignItems: "end",
            }}
          >
            <label style={{ gridColumn: "span 2" }}>
              Item Name
              <input
                type="text"
                placeholder="e.g. Eggs"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={shopAmount}
                onChange={(e) => setShopAmount(e.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                type="text"
                placeholder="g, ml, pcs"
                value={shopUnit}
                onChange={(e) => setShopUnit(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                style={{
                  minHeight: "2.75rem",
                  borderRadius: "0.65rem",
                  border: "1px solid var(--separator)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  padding: "0.4rem",
                }}
                value={shopCategory}
                onChange={(e) =>
                  setShopCategory(
                    e.target.value as "meat" | "produce" | "dairy" | "bakery" | "pantry" | "other",
                  )
                }
              >
                <option value="meat">Meat</option>
                <option value="produce">Produce</option>
                <option value="dairy">Dairy</option>
                <option value="bakery">Bakery</option>
                <option value="pantry">Pantry</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !shopName.trim()}>
              + Add
            </button>
          </form>

          {/* Items by Category */}
          <div style={{ marginTop: "1.25rem" }}>
            {shoppingList.length === 0 && (
              <p className="muted">Your shopping list is empty. Add items or generate from recipes!</p>
            )}
            {["meat", "produce", "dairy", "bakery", "pantry", "other"].map((cat) => {
              const catItems = shoppingList.filter((item) => item.category === cat);
              if (catItems.length === 0) return null;

              return (
                <div key={cat} style={{ marginBottom: "1rem" }}>
                  <span className="badge badge-info" style={{ textTransform: "capitalize" }}>
                    {cat}
                  </span>
                  <div className="entries" style={{ marginTop: "0.4rem" }}>
                    {catItems.map((item) => (
                      <div key={item.id} className="shopping-row">
                        <label className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                          <input
                            type="checkbox"
                            checked={item.isBought}
                            onChange={() => handleToggleShopping(item.id, item.isBought)}
                          />
                          <span>
                            {item.name} — {Number(item.amount)} {item.unit}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="danger"
                          style={{ minHeight: "1.8rem", padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}
                          onClick={() => handleDeleteShoppingItem(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeTab === "chat" && (
        <section className="surface" aria-labelledby="chat-title">
          <div className="section-heading">
            <div>
              <span className="badge badge-info">Gemini Flash</span>
              <h2 id="chat-title" style={{ marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <ChatIcon size={20} /> Food AI Assistant
              </h2>
            </div>
            <span
              className="badge"
              style={{ background: "rgba(52, 199, 89, 0.15)", color: "#34c759", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              <LockIcon size={12} /> Restricted: Food &amp; Macros Only
            </span>
          </div>

          <p className="muted" style={{ fontSize: "0.9rem", margin: "0.5rem 0 1rem" }}>
            Scrie în limbaj natural ce ai mâncat sau băut (ex: <em>„la prânz am mâncat o ciorbă de pui și 2 felii de pâine”</em>). AI-ul va estima automat caloriile și macronutrienții și îi va salva în jurnalul de astăzi!
          </p>

          {/* Prompt suggestions pills */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[
              "2 felii de pizza la prânz",
              "Omletă din 3 ouă cu telemea",
              "200g piept de pui cu 150g orez",
              "Ce calorii mai am pentru azi?",
              "Adaugă lapte de ovăz și 6 ouă pe listă",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="secondary"
                style={{ fontSize: "0.8rem", padding: "0.25rem 0.65rem", borderRadius: "1rem" }}
                disabled={chatLoading}
                onClick={() => handleSendChatMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat messages container */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              maxHeight: "26rem",
              overflowY: "auto",
              padding: "0.85rem",
              background: "var(--background)",
              borderRadius: "0.75rem",
              border: "1px solid var(--separator)",
            }}
          >
            {chatMessages.map((msg, index) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={index}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      padding: "0.65rem 0.9rem",
                      borderRadius: isUser
                        ? "1rem 1rem 0.2rem 1rem"
                        : "1rem 1rem 1rem 0.2rem",
                      background: isUser ? "var(--tint)" : "var(--surface)",
                      color: isUser ? "#ffffff" : "var(--text)",
                      border: isUser ? "none" : "1px solid var(--separator)",
                      fontSize: "0.9rem",
                      lineHeight: "1.4",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.text}
                  </div>

                  {msg.toolExecuted && (
                    <div
                      style={{
                        marginTop: "0.35rem",
                        fontSize: "0.78rem",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "0.4rem",
                        background: "rgba(175, 82, 222, 0.12)",
                        color: "#af52de",
                        border: "1px solid rgba(175, 82, 222, 0.25)",
                      }}
                    >
                      {msg.toolExecuted.name === "log_meal" && (
                        <span>
                          <strong>Masă adăugată:</strong>{" "}
                          {String(msg.toolExecuted.args.name || "")} —{" "}
                          {String(msg.toolExecuted.args.calories || 0)} kcal ·{" "}
                          {String(msg.toolExecuted.args.protein || 0)}g P ·{" "}
                          {String(msg.toolExecuted.args.carbs || 0)}g C ·{" "}
                          {String(msg.toolExecuted.args.fat || 0)}g F (AI Estimated)
                        </span>
                      )}
                      {msg.toolExecuted.name === "add_shopping_item" && (
                        <span>
                          <strong>Adăugat pe listă:</strong>{" "}
                          {String(msg.toolExecuted.args.name || "")}
                        </span>
                      )}
                      {msg.toolExecuted.name === "get_daily_food_summary" && (
                        <span><strong>Sumar zilnic actualizat</strong></span>
                      )}
                      {msg.toolExecuted.name === "get_recipes" && (
                        <span><strong>Rețete preluate</strong></span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {chatLoading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "0.5rem 0.8rem",
                  borderRadius: "1rem 1rem 1rem 0.2rem",
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--separator)",
                  fontSize: "0.85rem",
                  fontStyle: "italic",
                }}
              >
                Asistentul analizează și calculează macro-urile...
              </div>
            )}
          </div>

          {/* Chat input form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChatMessage();
            }}
            style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}
          >
            <input
              type="text"
              placeholder="Ex: Am mâncat 200g friptură de vită cu piure de cartofi..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? "Se trimite..." : "Trimite"}
            </button>
          </form>
        </section>
      )}

      {activeTab === "api" && (
        <section className="surface" aria-labelledby="ai-connector-title">
          <div className="section-heading">
            <div>
              <span className="badge badge-info">Integrations</span>
              <h2 id="ai-connector-title" style={{ marginTop: "0.25rem" }}>
                AI Connector (Claude Desktop &amp; Gemini)
              </h2>
            </div>
            <span
              className="badge"
              style={{ background: "rgba(52, 199, 89, 0.15)", color: "#34c759" }}
            >
              Quarantined Scope: Food Only
            </span>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(0, 122, 255, 0.08)",
              border: "1px solid rgba(0, 122, 255, 0.2)",
              fontSize: "0.85rem",
              lineHeight: "1.4",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <LockIcon size={14} />
              <strong>Strict AI Data Line Quarantine:</strong>
            </span>{" "}
            Connected AI assistants can
            log meals, read recipes, and check today&apos;s food totals. By security design,
            they have <em>zero access</em> to your body weight, steps, money, habits, or tasks.
          </div>

          {/* Newly generated plaintext token alert */}
          {generatedPlaintextToken && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                borderRadius: "0.65rem",
                background: "rgba(52, 199, 89, 0.1)",
                border: "1px solid rgba(52, 199, 89, 0.3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <strong style={{ color: "#34c759", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <CheckIcon size={14} /> New Food API Token Generated
                </strong>
                <button
                  type="button"
                  style={{ minHeight: "2rem", padding: "0.2rem 0.75rem", fontSize: "0.85rem" }}
                  onClick={() => handleCopy(generatedPlaintextToken)}
                >
                  {copied ? "Copied!" : "Copy Token"}
                </button>
              </div>
              <p style={{ fontSize: "0.85rem", margin: "0.5rem 0", color: "var(--text)" }}>
                Make sure to copy your token now. It will not be shown again!
              </p>
              <code
                style={{
                  display: "block",
                  padding: "0.5rem",
                  background: "var(--background)",
                  borderRadius: "0.4rem",
                  wordBreak: "break-all",
                  fontSize: "0.85rem",
                }}
              >
                {generatedPlaintextToken}
              </code>
            </div>
          )}

          {/* Generate token form */}
          <form
            onSubmit={handleGenerateToken}
            style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <input
              type="text"
              placeholder="Token label (e.g. Claude Desktop MacBook, Gemini CLI)"
              value={tokenNameInput}
              onChange={(e) => setTokenNameInput(e.target.value)}
              style={{ flex: 1, minWidth: "14rem" }}
            />
            <button type="submit" disabled={busy}>
              + Generate Token
            </button>
          </form>

          {/* Active tokens list */}
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Active Tokens</h3>
            {tokens.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                No active API tokens yet. Generate one above to connect Claude or Gemini.
              </p>
            ) : (
              <div className="entries">
                {tokens.map((token) => (
                  <div key={token.id} className="entry-row" style={{ alignItems: "center" }}>
                    <div>
                      <strong>{token.name}</strong>
                      <span
                        className="badge badge-info"
                        style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}
                      >
                        {token.scope}
                      </span>
                      <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                        Created {new Date(token.createdAt).toLocaleDateString()}
                        {token.lastUsedAt &&
                          ` · Last used ${new Date(token.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="danger"
                      style={{ minHeight: "2rem", padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                      onClick={() => handleRevokeToken(token.id)}
                      disabled={busy}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Integration Guide: Claude Desktop */}
          <div style={{ marginTop: "1.75rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>
              1. Claude Desktop Setup (MCP Protocol)
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              Add this block to your <code>claude_desktop_config.json</code>:
            </p>
            <div style={{ position: "relative" }}>
              <pre
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--background)",
                  fontSize: "0.8rem",
                  overflowX: "auto",
                  lineHeight: "1.4",
                }}
              >
{`{
  "mcpServers": {
    "life-tracker-food": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer ${generatedPlaintextToken || "<YOUR_FOOD_TOKEN>"}"
      }
    }
  }
}`}
              </pre>
              <button
                type="button"
                className="secondary"
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  padding: "0.2rem 0.5rem",
                  fontSize: "0.75rem",
                }}
                onClick={() =>
                  handleCopy(
                    `{\n  "mcpServers": {\n    "life-tracker-food": {\n      "url": "http://localhost:3000/api/mcp",\n      "headers": {\n        "Authorization": "Bearer ${generatedPlaintextToken || "<YOUR_FOOD_TOKEN>"}"\n      }\n    }\n  }\n}`,
                  )
                }
              >
                Copy JSON
              </button>
            </div>
          </div>

          {/* Integration Guide: Gemini */}
          <div style={{ marginTop: "1.75rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.35rem" }}>
              2. Google Gemini Setup (Function Calling / OpenAPI)
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              Gemini fetches tool declarations via <code>GET /api/ai/food</code> and invokes tools
              via <code>POST /api/ai/food</code>. Example cURL invocation:
            </p>
            <div style={{ position: "relative" }}>
              <pre
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  background: "var(--background)",
                  fontSize: "0.8rem",
                  overflowX: "auto",
                  lineHeight: "1.4",
                }}
              >
{`curl -X POST http://localhost:3000/api/ai/food \\
  -H "Authorization: Bearer ${generatedPlaintextToken || "<YOUR_FOOD_TOKEN>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "log_meal",
    "args": {
      "mealType": "lunch",
      "name": "Grilled Chicken & Rice",
      "calories": 650,
      "protein": 45,
      "carbs": 65,
      "fat": 15
    }
  }'`}
              </pre>
              <button
                type="button"
                className="secondary"
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  padding: "0.2rem 0.5rem",
                  fontSize: "0.75rem",
                }}
                onClick={() =>
                  handleCopy(
                    `curl -X POST http://localhost:3000/api/ai/food \\\n  -H "Authorization: Bearer ${generatedPlaintextToken || "<YOUR_FOOD_TOKEN>"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "name": "log_meal",\n    "args": {\n      "mealType": "lunch",\n      "name": "Grilled Chicken & Rice",\n      "calories": 650,\n      "protein": 45,\n      "carbs": 65,\n      "fat": 15\n    }\n  }'`,
                  )
                }
              >
                Copy cURL
              </button>
            </div>
          </div>
        </section>
      )}

      {statusMessage && (
        <p className="error" style={{ color: "var(--tint)", marginTop: "1rem" }}>
          {statusMessage}
        </p>
      )}

      {/* Floating Action Button for Mobile */}
      {activeTab === "daily" && (
        <button
          type="button"
          className="mobile-fab-btn"
          onClick={() => setIsMealModalOpen(true)}
          aria-label="Log meal"
        >
          <PlusIcon size={24} />
        </button>
      )}

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        title="Log a Meal"
      >
        <form onSubmit={handleLogMeal} style={{ display: "grid", gap: "0.85rem" }}>
          <label>
            Meal Type
            <select
              value={mealType}
              onChange={(e) =>
                setMealType(e.target.value as "breakfast" | "lunch" | "dinner" | "snack")
              }
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </label>

          <label>
            Meal Name / Description
            <input
              type="text"
              autoFocus
              placeholder="e.g. 200g Chicken breast & 150g Rice"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              required
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label>
              Calories (kcal)
              <input
                type="number"
                placeholder="0"
                value={mealCalories}
                onChange={(e) => setMealCalories(e.target.value)}
                className="number-tabular"
              />
            </label>
            <label>
              Protein (g)
              <input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={mealProtein}
                onChange={(e) => setMealProtein(e.target.value)}
                className="number-tabular"
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <label>
              Carbs (g)
              <input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={mealCarbs}
                onChange={(e) => setMealCarbs(e.target.value)}
                className="number-tabular"
              />
            </label>
            <label>
              Fat (g)
              <input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={mealFat}
                onChange={(e) => setMealFat(e.target.value)}
                className="number-tabular"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsMealModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !mealName.trim()}
              style={{ flex: 2 }}
            >
              + Save Meal
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
