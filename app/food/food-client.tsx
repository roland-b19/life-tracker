"use client";

import { useState } from "react";
import { formatDMY } from "@/lib/format-date";
import { Navigation } from "../components/navigation";
import { Segmented } from "../components/segmented";
import {
  DropIcon,
  FootstepsIcon,
  ScaleIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { WeightPanel } from "./weight-panel";
import { AnimatedNumber } from "../components/animated-number";
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
}

export function FoodClient({
  userName,
  todayDate,
  targets,
  initialSummary,
  weightAnalytics,
  initialShoppingList,
}: FoodClientProps) {
  const [selectedDate] = useState(todayDate);
  const [summary, setSummary] = useState(initialSummary);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const [activeTab, setActiveTab] = useState<"daily" | "weight" | "shopping" | "chat">("daily");
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
  const setStatusMessage = (message: string) => {
    if (message) showToast({ message, type: "warning" });
  };

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

  const macros = [
    { label: "Calories", value: summary.totals.calories, target: targets.calories, unit: " kcal" },
    { label: "Protein", value: summary.totals.protein, target: targets.proteinGrams, unit: "g" },
    { label: "Carbs", value: summary.totals.carbs, target: targets.carbsGrams, unit: "g" },
    { label: "Fat", value: summary.totals.fat, target: targets.fatGrams, unit: "g" },
  ];
  const pct = (value: number, target: number) => Math.min(100, Math.round((value / target) * 100));
  const waterPct = pct(summary.metrics.waterMl, targets.waterMl);
  const stepsPct = pct(summary.metrics.steps, targets.steps);
  const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

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
          ]}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "weight" && <WeightPanel />}

      {activeTab === "daily" && (
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <section className="surface" aria-labelledby="meals-title">
              <div className="section-head">
                <div>
                  <h2 id="meals-title" className="section-title">
                    Meals
                  </h2>
                  <p className="card-sub muted number-tabular">{formatDMY(selectedDate)}</p>
                </div>
                <button type="button" className="btn-sm tint" onClick={() => setIsMealModalOpen(true)}>
                  <PlusIcon size={14} />
                  Add meal
                </button>
              </div>

              {summary.meals.length === 0 ? (
                <p className="empty-note">No meals logged today.</p>
              ) : (
                <div className="entries">
                  {summary.meals.map((meal) => (
                    <div key={meal.id} className="entry-row">
                      <div>
                        <div className="entry-main">
                          <span className="badge badge-info">{meal.mealType}</span>
                          <strong>{meal.name}</strong>
                          {meal.isEstimated && <span className="badge badge-carried">AI estimate</span>}
                        </div>
                        <p className="card-sub muted number-tabular">
                          {meal.calories} kcal · {meal.protein}g P · {meal.carbs}g C · {meal.fat}g F
                        </p>
                      </div>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteMeal(meal.id)}
                        aria-label={`Delete meal ${meal.name}`}
                        title="Delete"
                      >
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="dashboard-aside">
            <section className="surface" aria-labelledby="macros-title">
              <div className="section-head">
                <h2 id="macros-title" className="section-title">
                  Nutrition
                </h2>
              </div>
              <div className="macro-grid">
                {macros.map((m) => (
                  <div key={m.label} className="macro-card">
                    <span className="macro-title">{m.label}</span>
                    <span className="macro-numbers">
                      <AnimatedNumber value={m.value} format={oneDecimal} />
                      <span className="macro-target">
                        {" "}
                        / {m.target}
                        {m.unit}
                      </span>
                    </span>
                    <div className="progress-track">
                      <div
                        className={`progress-fill ${m.value > m.target ? "over" : ""}`}
                        style={{ width: `${pct(m.value, m.target)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface" aria-labelledby="water-title">
              <div className="section-head">
                <h2 id="water-title" className="section-title icon-title">
                  <DropIcon size={18} /> Water
                </h2>
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
              <p className="metric-big number-tabular">
                <AnimatedNumber value={summary.metrics.waterMl} />
                <span className="macro-target"> / {targets.waterMl} ml</span>
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${waterPct}%` }} />
              </div>
              <div className="tap-buttons">
                <button type="button" className="secondary tap-btn" onClick={() => changeWater(250, "Added 250 ml")}>
                  +250 ml
                </button>
                <button type="button" className="secondary tap-btn" onClick={() => changeWater(500, "Added 500 ml")}>
                  +500 ml
                </button>
              </div>
            </section>

            <section className="surface" aria-labelledby="steps-title">
              <div className="section-head">
                <h2 id="steps-title" className="section-title icon-title">
                  <FootstepsIcon size={18} /> Steps
                </h2>
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
              <p className="metric-big number-tabular">
                <AnimatedNumber value={summary.metrics.steps} />
                <span className="macro-target"> / {targets.steps}</span>
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${stepsPct}%` }} />
              </div>
            </section>

            <section className="surface" aria-labelledby="weight-trend-title">
              <div className="section-head">
                <h2 id="weight-trend-title" className="section-title icon-title">
                  <ScaleIcon size={18} /> Weight
                </h2>
                {weightAnalytics.weeklyRateOfChange !== null && (
                  <span className={`badge ${weightAnalytics.trend === "gaining" ? "badge-success" : "badge-warning"}`}>
                    {weightAnalytics.weeklyRateOfChange > 0 ? "+" : ""}
                    {weightAnalytics.weeklyRateOfChange} kg/week
                  </span>
                )}
              </div>
              <p className="metric-big number-tabular">
                {weightAnalytics.sevenDayAverage ?? weightAnalytics.latestWeight ?? "—"}
                <span className="macro-target"> kg{weightAnalytics.sevenDayAverage ? ", 7-day average" : ""}</span>
              </p>
              <p className="card-sub muted">
                {weightAnalytics.previousWeekAverage
                  ? `Previous week: ${weightAnalytics.previousWeekAverage} kg`
                  : "Log weigh-ins in the Weight tab to see a trend."}
              </p>
            </section>
          </div>
        </div>
      )}

      {activeTab === "shopping" && (
        <section className="surface" aria-labelledby="shopping-title">
          <div className="section-head">
            <h2 id="shopping-title" className="section-title">
              Shopping List
            </h2>
            <button type="button" className="btn-sm tint" onClick={() => setIsShopModalOpen(true)}>
              <PlusIcon size={14} />
              Add item
            </button>
          </div>

          <div className="head-actions">
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

          {shoppingList.length === 0 && <p className="empty-note">Your shopping list is empty.</p>}
          {["meat", "produce", "dairy", "bakery", "pantry", "other"].map((cat) => {
            const catItems = shoppingList.filter((item) => item.category === cat);
            if (catItems.length === 0) return null;
            return (
              <div key={cat} className="shopping-group">
                <h3 className="group-label">{cat}</h3>
                {catItems.map((item) => (
                  <div key={item.id} className="shopping-row">
                    <label className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                      <input
                        type="checkbox"
                        checked={item.isBought}
                        onChange={() => handleToggleShopping(item.id, item.isBought)}
                      />
                      <span>
                        {item.name} · {Number(item.amount)} {item.unit}
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
            );
          })}
        </section>
      )}

      {activeTab === "chat" && (
        <section className="surface" aria-labelledby="chat-title">
          <div className="section-head">
            <h2 id="chat-title" className="section-title">
              Food Assistant
            </h2>
          </div>

          <div className="chat-suggestions">
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
                className="secondary chat-chip"
                disabled={chatLoading}
                onClick={() => handleSendChatMessage(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="chat-log" aria-live="polite">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`chat-msg ${msg.role === "user" ? "user" : "model"}`}>
                <div className="chat-bubble">{msg.text}</div>
                {msg.toolExecuted && (
                  <div className="chat-tool">
                    {msg.toolExecuted.name === "log_meal" && (
                      <span>
                        <strong>Masă adăugată:</strong> {String(msg.toolExecuted.args.name || "")} ·{" "}
                        {String(msg.toolExecuted.args.calories || 0)} kcal ·{" "}
                        {String(msg.toolExecuted.args.protein || 0)}g P ·{" "}
                        {String(msg.toolExecuted.args.carbs || 0)}g C · {String(msg.toolExecuted.args.fat || 0)}g F
                      </span>
                    )}
                    {msg.toolExecuted.name === "add_shopping_item" && (
                      <span>
                        <strong>Adăugat pe listă:</strong> {String(msg.toolExecuted.args.name || "")}
                      </span>
                    )}
                    {msg.toolExecuted.name === "get_daily_food_summary" && <strong>Sumar zilnic actualizat</strong>}
                    {msg.toolExecuted.name === "get_recipes" && <strong>Rețete preluate</strong>}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg model">
                <div className="chat-bubble typing">Asistentul calculează macro-urile…</div>
              </div>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChatMessage();
            }}
          >
            <input
              type="text"
              aria-label="Message"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? "Se trimite…" : "Trimite"}
            </button>
          </form>
        </section>
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
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              required
            />
          </label>

          <div className="form-pair">
            <label>
              Calories (kcal)
              <input
                type="number"
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
                value={mealProtein}
                onChange={(e) => setMealProtein(e.target.value)}
                className="number-tabular"
              />
            </label>
          </div>

          <div className="form-pair">
            <label>
              Carbs (g)
              <input
                type="number"
                step="0.1"
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
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
              />
            </label>
            <div className="form-pair">
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
