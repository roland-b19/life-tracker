"use client";

import { useState } from "react";
import { formatDMY } from "@/lib/format-date";
import { Navigation } from "../components/navigation";
import { Segmented } from "../components/segmented";
import {
  DropIcon,
  FootstepsIcon,
  ScaleIcon,
  LockIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { WeightPanel } from "./weight-panel";
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
  const [activeTab, setActiveTab] = useState<"daily" | "weight" | "shopping" | "chat" | "api">("daily");
  const [tokenNameInput, setTokenNameInput] = useState("");
  const [generatedPlaintextToken, setGeneratedPlaintextToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [metricEdit, setMetricEdit] = useState<"water" | "steps" | null>(null);
  const [metricInput, setMetricInput] = useState("");

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

  // Shopping input state
  const [shopName, setShopName] = useState("");
  const [shopAmount, setShopAmount] = useState("1");
  const [shopUnit, setShopUnit] = useState("pcs");
  const [shopCategory, setShopCategory] = useState<
    "meat" | "produce" | "dairy" | "bakery" | "pantry" | "other"
  >("other");

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const round1 = (n: number) => Math.round(n * 10) / 10;

  // sign 1 adds the meal to the day, -1 removes it
  function applyMeal(meal: MealData, sign: 1 | -1) {
    setSummary((prev) => ({
      ...prev,
      meals: sign === 1 ? [...prev.meals, meal] : prev.meals.filter((m) => m.id !== meal.id),
      totals: {
        calories: Math.max(0, prev.totals.calories + sign * meal.calories),
        protein: Math.max(0, round1(prev.totals.protein + sign * parseFloat(meal.protein))),
        carbs: Math.max(0, round1(prev.totals.carbs + sign * parseFloat(meal.carbs))),
        fat: Math.max(0, round1(prev.totals.fat + sign * parseFloat(meal.fat))),
      },
    }));
  }

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
        const meal = res.meal as MealData;
        applyMeal(meal, 1);
        setMealName("");
        setMealCalories("");
        setMealProtein("");
        setMealCarbs("");
        setMealFat("");
        setIsMealModalOpen(false);
        showToast({
          message: `Logged "${meal.name}" (${meal.calories} kcal)`,
          type: "success",
          actionLabel: "Undo",
          onAction: async () => {
            await deleteMealAction(meal.id);
            applyMeal(meal, -1);
          },
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

    applyMeal(deleted, -1);
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
          if (res.success && res.meal) applyMeal(res.meal as MealData, 1);
        },
      });
    } catch {
      applyMeal(deleted, 1);
      setStatusMessage("Failed to delete meal.");
    }
  }

  async function changeWater(delta: number, message: string) {
    try {
      const res = await addWaterAction(selectedDate, delta);
      if (!res.success || !res.metrics) return;
      const setWater = (waterMl: number) =>
        setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, waterMl } }));
      setWater(res.metrics.waterMl);
      showToast({
        message,
        actionLabel: "Undo",
        onAction: async () => {
          const undone = await addWaterAction(selectedDate, -delta);
          if (undone.success && undone.metrics) setWater(undone.metrics.waterMl);
        },
      });
    } catch {
      setStatusMessage("Could not update water.");
    }
  }

  async function changeSteps(next: number) {
    const previous = summary.metrics.steps;
    try {
      const res = await updateStepsAction(selectedDate, next);
      if (!res.success || !res.metrics) return;
      const setSteps = (steps: number) =>
        setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, steps } }));
      setSteps(res.metrics.steps);
      showToast({
        message: `Steps set to ${next}`,
        actionLabel: "Undo",
        onAction: async () => {
          const undone = await updateStepsAction(selectedDate, previous);
          if (undone.success && undone.metrics) setSteps(undone.metrics.steps);
        },
      });
    } catch {
      setStatusMessage("Could not update steps.");
    }
  }

  function openMetricEdit(metric: "water" | "steps") {
    setMetricInput(String(metric === "water" ? summary.metrics.waterMl : summary.metrics.steps));
    setMetricEdit(metric);
  }

  async function handleMetricSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseInt(metricInput, 10);
    if (!metricEdit || !Number.isInteger(value) || value < 0) return;
    setMetricEdit(null);
    if (metricEdit === "water") {
      await changeWater(value - summary.metrics.waterMl, `Water set to ${value} ml`);
    } else {
      await changeSteps(value);
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
        const item = res.item as ShoppingItemData;
        setShoppingList((prev) => [...prev, item]);
        setShopName("");
        setShopAmount("1");
        setIsShopModalOpen(false);
        showToast({
          message: `Added "${item.name}"`,
          type: "success",
          actionLabel: "Undo",
          onAction: async () => {
            await deleteShoppingItemAction(item.id);
            setShoppingList((prev) => prev.filter((i) => i.id !== item.id));
          },
        });
      }
    } catch {
      setStatusMessage("Could not add shopping item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleShopping(itemId: string, currentState: boolean) {
    const setBought = (isBought: boolean) =>
      setShoppingList((prev) => prev.map((item) => (item.id === itemId ? { ...item, isBought } : item)));
    try {
      await toggleShoppingItemAction(itemId, !currentState);
      setBought(!currentState);
      showToast({
        message: currentState ? "Marked as not bought" : "Marked as bought",
        actionLabel: "Undo",
        onAction: async () => {
          await toggleShoppingItemAction(itemId, currentState);
          setBought(currentState);
        },
      });
    } catch {
      setStatusMessage("Could not update item.");
    }
  }

  async function handleDeleteShoppingItem(item: ShoppingItemData) {
    try {
      await deleteShoppingItemAction(item.id);
      setShoppingList((prev) => prev.filter((i) => i.id !== item.id));
      showToast({
        message: `Deleted "${item.name}"`,
        actionLabel: "Undo",
        onAction: async () => {
          const res = await addShoppingItemAction({
            name: item.name,
            amount: parseFloat(item.amount),
            unit: item.unit,
            category: item.category,
          });
          if (res.success && res.item) {
            const restored = { ...(res.item as ShoppingItemData), isBought: item.isBought };
            if (item.isBought) await toggleShoppingItemAction(restored.id, true);
            setShoppingList((prev) => [...prev, restored]);
          }
        },
      });
    } catch {
      setStatusMessage("Could not delete item.");
    }
  }

  async function handleGenerateShoppingList() {
    setBusy(true);
    try {
      const res = await generateShoppingListAction();
      if (res.success && res.items) {
        const added = res.items as ShoppingItemData[];
        setShoppingList((prev) => [...prev, ...added]);
        showToast({
          message: `Added ${added.length} item${added.length === 1 ? "" : "s"} from recipes`,
          actionLabel: added.length ? "Undo" : undefined,
          onAction: async () => {
            await Promise.all(added.map((i) => deleteShoppingItemAction(i.id)));
            setShoppingList((prev) => prev.filter((i) => !added.some((a) => a.id === i.id)));
          },
        });
      }
    } catch {
      setStatusMessage("Failed to generate shopping list.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    setBusy(true);
    try {
      await clearBoughtItemsAction();
      setShoppingList((prev) => prev.filter((item) => !item.isBought));
      showToast({
        message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
        actionLabel: "Undo",
        onAction: async () => {
          const restored: ShoppingItemData[] = [];
          for (const item of cleared) {
            const res = await addShoppingItemAction({
              name: item.name,
              amount: parseFloat(item.amount),
              unit: item.unit,
              category: item.category,
            });
            if (res.success && res.item) {
              await toggleShoppingItemAction((res.item as ShoppingItemData).id, true);
              restored.push({ ...(res.item as ShoppingItemData), isBought: true });
            }
          }
          setShoppingList((prev) => [...prev, ...restored]);
        },
      });
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

      <div className="toolbar">
        <Segmented
          label="Health sections"
          value={activeTab}
          options={[
            { value: "daily", label: "Today" },
            { value: "weight", label: "Weight" },
            { value: "shopping", label: "Shopping" },
            { value: "chat", label: "Assistant" },
            { value: "api", label: "API" },
          ]}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "weight" && <WeightPanel />}

      {activeTab === "daily" && (
        <>
          {/* Daily Macros Target & Progress */}
          <section className="surface" aria-labelledby="macros-title">
            <div className="section-head">
              <h2 id="macros-title" className="section-title">
                Nutrition Summary
              </h2>
              <span className="muted number-tabular">{formatDMY(selectedDate)}</span>
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
                <div className="progress-track" style={{ width: "12rem", maxWidth: "100%", marginTop: "0.4rem" }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${waterPct}%`, background: "var(--tint)" }}
                  />
                </div>
              </div>
              <div className="tap-buttons">
                <button type="button" className="secondary tap-btn" onClick={() => changeWater(250, "Added 250 ml")}>
                  +250 ml
                </button>
                <button type="button" className="secondary tap-btn" onClick={() => changeWater(500, "Added 500 ml")}>
                  +500 ml
                </button>
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={() => openMetricEdit("water")}
                  aria-label="Edit water amount"
                  title="Edit"
                >
                  <PencilIcon size={17} />
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
                <div className="section-head" style={{ margin: "0.4rem 0 0" }}>
                  <strong className="number-tabular" style={{ fontSize: "1.1rem" }}>
                    {summary.metrics.steps} steps
                  </strong>
                  <button
                    type="button"
                    className="delete-icon-btn edit"
                    onClick={() => openMetricEdit("steps")}
                    aria-label="Edit steps"
                    title="Edit"
                  >
                    <PencilIcon size={17} />
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
                            ? "rgba(143, 212, 163, 0.15)"
                            : "rgba(235, 198, 115, 0.15)",
                        color:
                          weightAnalytics.trend === "gaining" ? "var(--success)" : "var(--warning)",
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
                    : "Log weigh-ins in the Weight tab for rolling trends"}
                </span>
              </div>
            </div>
          </section>

          {/* Daily Dashboard Grid: Meals & Fast Entry */}
          <div className="dashboard-main" style={{ marginTop: "1.25rem" }}>
            {/* Today's Meals Log */}
            <div className="dashboard-main">
              <section className="surface" aria-labelledby="meals-history-title">
                <div className="section-head">
                  <h2 id="meals-history-title" className="section-title">
                    Today&apos;s Meals
                  </h2>
                  <button type="button" className="btn-sm tint" onClick={() => setIsMealModalOpen(true)}>
                    <PlusIcon size={14} />
                    Add meal
                  </button>
                </div>

                <div className="entries" style={{ marginTop: "1rem" }}>
                  {summary.meals.length === 0 && (
                    <p className="empty-note">No meals logged today.</p>
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
                                background: "rgba(134, 180, 234, 0.15)",
                                color: "var(--tint)",
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
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {activeTab === "shopping" && (
        /* Shopping List View */
        <section className="surface" aria-labelledby="shopping-title">
          <div className="section-head">
            <h2 id="shopping-title" className="section-title">Shopping List</h2>
            <button type="button" className="btn-sm tint" onClick={() => setIsShopModalOpen(true)}>
              <PlusIcon size={14} />
              Add item
            </button>
          </div>

          <div className="head-actions" style={{ marginBottom: "0.75rem" }}>
            <button type="button" className="secondary btn-sm" onClick={handleGenerateShoppingList}>
              From recipes
            </button>
            <button
              type="button"
              className="secondary btn-sm"
              disabled={shoppingList.every((i) => !i.isBought)}
              onClick={handleClearBought}
            >
              Clear bought
            </button>
          </div>

          {/* Items by Category */}
          <div style={{ marginTop: "1.25rem" }}>
            {shoppingList.length === 0 && (
              <p className="empty-note">Your shopping list is empty.</p>
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
                          className="delete-icon-btn"
                          onClick={() => handleDeleteShoppingItem(item)}
                          aria-label={`Delete ${item.name}`}
                          title="Delete"
                        >
                          <TrashIcon size={17} />
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
          <div className="section-head">
            <h2 id="chat-title" className="section-title">
              Food AI Assistant
            </h2>
          </div>

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
                      color: isUser ? "var(--on-tint)" : "var(--text)",
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
                        background: "rgba(134, 180, 234, 0.12)",
                        color: "var(--tint)",
                        border: "1px solid rgba(134, 180, 234, 0.25)",
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
          <div className="section-head">
            <h2 id="ai-connector-title" className="section-title">
              AI Connector
            </h2>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(134, 180, 234, 0.08)",
              border: "1px solid rgba(134, 180, 234, 0.2)",
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
                background: "rgba(143, 212, 163, 0.1)",
                border: "1px solid rgba(143, 212, 163, 0.3)",
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
                <strong style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
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
                        Created {formatDMY(new Date(token.createdAt).toISOString())}
                        {token.lastUsedAt &&
                          ` · Last used ${formatDMY(new Date(token.lastUsedAt).toISOString())}`}
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

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        title="New meal"
      >
        <form onSubmit={handleLogMeal}>
          <div className="form-stack">
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

          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsMealModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !mealName.trim()}>
              Add meal
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isShopModalOpen} onClose={() => setIsShopModalOpen(false)} title="New shopping item">
        <form onSubmit={handleAddShoppingItem}>
          <div className="form-stack">
            <label>
              Item name
              <input
                type="text"
                placeholder="e.g. Eggs"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <label>
                Amount
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
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
            </div>
            <label>
              Category
              <select
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
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsShopModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !shopName.trim()}>
              Add item
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={metricEdit !== null}
        onClose={() => setMetricEdit(null)}
        title={metricEdit === "water" ? "Edit water" : "Edit steps"}
      >
        <form onSubmit={handleMetricSubmit}>
          <div className="form-stack">
            <label>
              {metricEdit === "water" ? "Water today (ml)" : "Steps today"}
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max={metricEdit === "water" ? 20000 : 200000}
                step="1"
                required
                value={metricInput}
                onChange={(e) => setMetricInput(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setMetricEdit(null)}>
              Cancel
            </button>
            <button type="submit" disabled={metricInput === ""}>
              Save
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
