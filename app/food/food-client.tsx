"use client";

import { Fragment, useState } from "react";
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
import { AutoHeight, useListMotion } from "../components/list-motion";
import {
  addShoppingItemAction,
  addWaterAction,
  clearBoughtItemsAction,
  deleteMealAction,
  deleteShoppingItemAction,
  logMealAction,
  addShoppingCategoryAction,
  deleteShoppingCategoryAction,
  renameShoppingCategoryAction,
  restoreShoppingItemsAction,
  toggleShoppingItemAction,
  updateShoppingItemAction,
  updateStepsAction,
} from "@/app/actions/food";
import { sendFoodChatMessageAction } from "@/app/actions/food-chat";
import { WeightAnalytics } from "@/lib/food";

interface MealData {
  id: string;
  date: string;
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

/** Something added to the list before; one tap adds it again. */
interface ShoppingHistoryItem {
  name: string;
  amount: string;
  unit: string;
  category: string;
}

/** A food logged before, offered again in the "Past foods" sheet. */
interface PastFood {
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  isEstimated: boolean;
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
  /** The user's store sections in walking order, without the built-in "other". */
  shoppingCategories: string[];
  shoppingHistory: ShoppingHistoryItem[];
  pastFoods: PastFood[];
}

export function FoodClient({
  userName,
  todayDate,
  targets,
  initialSummary,
  weightAnalytics,
  initialShoppingList,
  shoppingCategories: initialCategories,
  shoppingHistory,
  pastFoods: initialPastFoods,
}: FoodClientProps) {
  const [selectedDate] = useState(todayDate);
  const [summary, setSummary] = useState(initialSummary);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const [activeTab, setActiveTab] = useState<"daily" | "weight" | "shopping" | "chat">("daily");
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [history, setHistory] = useState(shoppingHistory);
  const [editingShop, setEditingShop] = useState<ShoppingItemData | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  // from: null adds a new category, a name edits that one.
  const [catEdit, setCatEdit] = useState<{ from: string | null } | null>(null);
  const [catName, setCatName] = useState("");
  const [metricEdit, setMetricEdit] = useState<"water" | "steps" | null>(null);
  const [metricInput, setMetricInput] = useState("");
  const [pastFoods, setPastFoods] = useState(initialPastFoods);
  const [isPastOpen, setIsPastOpen] = useState(false);

  const { showToast } = useToast();
  const { rowRef, enter, leave } = useListMotion();

  // In-app Food AI Chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      role: "user" | "model";
      text: string;
      meals?: MealData[];
    }>
  >([
    {
      role: "model",
      text: "Salut! Sunt asistentul tău de nutriție. Spune-mi ce ai mâncat sau băut (de exemplu: „la prânz am avut o ciorbă de pui și 2 felii de pâine”), iar eu voi calcula caloriile și macro-urile și le voi înregistra direct în aplicație. Mă poți întreba și cât mai ai din ținta zilei.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Meal input state
  const [mealName, setMealName] = useState("");
  const [mealCalories, setMealCalories] = useState("");
  const [mealProtein, setMealProtein] = useState("");
  const [mealCarbs, setMealCarbs] = useState("");
  const [mealFat, setMealFat] = useState("");

  // Shopping input state
  const [shopName, setShopName] = useState("");
  const [shopAmount, setShopAmount] = useState("1");
  const [shopUnit, setShopUnit] = useState("pcs");
  const [shopCategory, setShopCategory] = useState("other");

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
        name: mealName.trim(),
        calories: parseInt(mealCalories, 10) || 0,
        protein: parseFloat(mealProtein) || 0,
        carbs: parseFloat(mealCarbs) || 0,
        fat: parseFloat(mealFat) || 0,
      });

      if (res.success && res.meal) {
        const meal = res.meal as MealData;
        enter(meal.id);
        applyMeal(meal, 1);
        rememberFoods([meal]);
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
            leave(meal.id, () => applyMeal(meal, -1));
          },
        });
      }
    } catch {
      setStatusMessage("Failed to log meal.");
    } finally {
      setBusy(false);
    }
  }

  /** Remembers newly logged names so the "Past foods" sheet offers them next time. */
  function rememberFoods(logged: MealData[]) {
    setPastFoods((prev) => {
      const names = new Set(logged.map((m) => m.name.toLowerCase()));
      const fresh = logged.map(({ name, calories, protein, carbs, fat, isEstimated }) => ({
        name, calories, protein, carbs, fat, isEstimated: Boolean(isEstimated),
      }));
      return [...fresh, ...prev.filter((f) => !names.has(f.name.toLowerCase()))];
    });
  }

  async function handleLogPastFood(food: PastFood) {
    setBusy(true);
    try {
      const res = await logMealAction({
        date: selectedDate,
        name: food.name,
        calories: food.calories,
        protein: parseFloat(food.protein) || 0,
        carbs: parseFloat(food.carbs) || 0,
        fat: parseFloat(food.fat) || 0,
        isEstimated: food.isEstimated,
      });
      const meal = res.meal as MealData;
      enter(meal.id);
      applyMeal(meal, 1);
      showToast({
        message: `Logged "${meal.name}" (${meal.calories} kcal)`,
        type: "success",
        actionLabel: "Undo",
        onAction: async () => {
          await deleteMealAction(meal.id);
          leave(meal.id, () => applyMeal(meal, -1));
        },
      });
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
            name: deleted.name,
            calories: deleted.calories,
            protein: parseFloat(deleted.protein),
            carbs: parseFloat(deleted.carbs),
            fat: parseFloat(deleted.fat),
          });
          if (res.success && res.meal) {
            enter(res.meal.id);
            applyMeal(res.meal as MealData, 1);
          }
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

  const sameItem = (a: { name: string; unit: string }, b: { name: string; unit: string }) =>
    a.name.toLowerCase() === b.name.toLowerCase() && a.unit.toLowerCase() === b.unit.toLowerCase();

  const toShopInput = (i: ShoppingItemData | ShoppingHistoryItem) => ({
    name: i.name,
    amount: Number(i.amount),
    unit: i.unit,
    category: i.category,
  });

  function openShopForm(item: ShoppingItemData | null) {
    setEditingShop(item);
    setShopName(item?.name ?? "");
    setShopAmount(item ? String(Number(item.amount)) : "1");
    setShopUnit(item?.unit ?? "pcs");
    setShopCategory(item?.category ?? "other");
    setIsShopModalOpen(true);
  }

  /** Adds an item; the server adds the amount to the same item when it is already on the list. */
  async function addShopping(input: { name: string; amount: number; unit: string; category: string }) {
    setBusy(true);
    try {
      const res = await addShoppingItemAction(input);
      const item = res.item as ShoppingItemData;
      const before = shoppingList.find((i) => i.id === item.id);
      if (before) {
        setShoppingList((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      } else {
        enter(item.id);
        setShoppingList((prev) => [...prev, item]);
      }
      setHistory((prev) => [
        { name: item.name, amount: item.amount, unit: item.unit, category: item.category },
        ...prev.filter((h) => h.name.toLowerCase() !== item.name.toLowerCase()),
      ]);
      showToast({
        message: before ? `"${item.name}" is now ${Number(item.amount)} ${item.unit}` : `Added "${item.name}"`,
        type: "success",
        actionLabel: "Undo",
        onAction: async () => {
          if (!before) {
            await deleteShoppingItemAction(item.id);
            leave(item.id, () => setShoppingList((prev) => prev.filter((i) => i.id !== item.id)));
            return;
          }
          await updateShoppingItemAction({ ...toShopInput(before), itemId: before.id });
          if (before.isBought) await toggleShoppingItemAction(before.id, true);
          setShoppingList((prev) => prev.map((i) => (i.id === before.id ? before : i)));
        },
      });
      return true;
    } catch {
      setStatusMessage("Could not add shopping item.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleShopSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      name: shopName.trim(),
      amount: parseFloat(shopAmount) || 1,
      unit: shopUnit.trim() || "pcs",
      category: shopCategory.trim().toLowerCase() || "other",
    };
    if (!input.name) return;

    if (!editingShop) {
      if (await addShopping(input)) setIsShopModalOpen(false);
      return;
    }
    // Saving an edit has no Undo: the item can simply be edited again.
    setBusy(true);
    try {
      const res = await updateShoppingItemAction({ ...input, itemId: editingShop.id });
      const item = res.item as ShoppingItemData;
      setShoppingList((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      setIsShopModalOpen(false);
      showToast({ message: `Saved "${item.name}"`, type: "success" });
    } catch {
      setStatusMessage("Could not save item.");
    } finally {
      setBusy(false);
    }
  }

  function openCategoryForm(from: string | null) {
    setCatEdit({ from });
    setCatName(from ?? "");
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    const from = catEdit?.from ?? null;
    const to = catName.trim().toLowerCase();
    if (!to) return;
    if (to === from) return setCatEdit(null);
    if (to === "other") return setStatusMessage("\u201cother\u201d is built in.");
    setBusy(true);
    try {
      if (from === null) {
        if (!(await addShoppingCategoryAction({ name: to })).success) return setStatusMessage(`\u201c${to}\u201d already exists.`);
        setCategories((prev) => [...prev, to]);
        showToast({ message: `Added \u201c${to}\u201d`, type: "success" });
      } else {
        if (!(await renameShoppingCategoryAction({ from, to })).success) throw new Error("Category not found");
        setCategories((prev) => (prev.includes(to) ? prev.filter((c) => c !== from) : prev.map((c) => (c === from ? to : c))));
        moveItems(from, to);
        showToast({ message: `Renamed \u201c${from}\u201d to \u201c${to}\u201d`, type: "success" });
      }
      setCatEdit(null);
    } catch {
      setStatusMessage("Could not save category.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCategory() {
    const name = catEdit?.from;
    if (!name) return;
    setBusy(true);
    try {
      if (!(await deleteShoppingCategoryAction({ name })).success) throw new Error("Category not found");
      setCategories((prev) => prev.filter((c) => c !== name));
      moveItems(name, "other");
      setCatEdit(null);
      showToast({ message: `Deleted \u201c${name}\u201d; its items are in Other`, type: "success" });
    } catch {
      setStatusMessage("Could not delete category.");
    } finally {
      setBusy(false);
    }
  }

  /** Moves the items of one category, history included, to another on screen. */
  function moveItems(from: string, to: string) {
    const move = <T extends { category: string }>(i: T) => (i.category === from ? { ...i, category: to } : i);
    setShoppingList((prev) => prev.map(move));
    setHistory((prev) => prev.map(move));
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

  function handleDeleteShoppingItem(item: ShoppingItemData) {
    // The row leaves at once; the server delete runs alongside, so the tap never waits on the network.
    const deleted = deleteShoppingItemAction(item.id).then(
      () => true,
      () => false,
    );
    // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
    const gone = new Promise<void>((done) =>
      leave(item.id, () => {
        setShoppingList((prev) => prev.filter((i) => i.id !== item.id));
        done();
      }),
    );
    const putBack = (back: ShoppingItemData) => {
      enter(back.id);
      setShoppingList((prev) => [...prev, back]);
    };
    showToast({
      message: `Deleted "${item.name}"`,
      actionLabel: "Undo",
      onAction: async () => {
        await gone;
        if (!(await deleted)) return; // the failure path below puts it back
        const res = await addShoppingItemAction(toShopInput(item)).catch(() => null);
        if (!res?.item) return setStatusMessage("Could not restore item.");
        const restored = { ...(res.item as ShoppingItemData), isBought: item.isBought };
        if (item.isBought) await toggleShoppingItemAction(restored.id, true);
        putBack(restored);
      },
    });
    void Promise.all([deleted, gone]).then(([ok]) => {
      if (ok) return;
      putBack(item);
      setStatusMessage("Could not delete item.");
    });
  }

  async function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    setBusy(true);
    try {
      await clearBoughtItemsAction();
      cleared.forEach((c) => leave(c.id, () => setShoppingList((prev) => prev.filter((i) => i.id !== c.id))));
      showToast({
        message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
        actionLabel: "Undo",
        onAction: async () => {
          await restoreShoppingItemsAction({ itemIds: cleared.map((c) => c.id) });
          cleared.forEach((i) => enter(i.id));
          setShoppingList((prev) => [...prev, ...cleared]);
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
      // The welcome message is UI text, not part of the conversation.
      const history = chatMessages.slice(1).map((m) => ({ role: m.role, text: m.text }));
      const res = await sendFoodChatMessageAction({
        message: text,
        history,
        date: selectedDate,
        time: new Date().toTimeString().slice(0, 5),
      });
      const meals = res.meals as MealData[];
      setChatMessages((prev) => [...prev, { role: "model", text: res.reply, meals }]);
      if (res.freshSummary) setSummary(res.freshSummary);
      if (meals.length) rememberFoods(meals);
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
  // Walking order, unknown categories after the user's own, "other" last.
  const shopCategories = [...new Set([...categories, ...shoppingList.map((i) => i.category).filter((c) => c !== "other"), "other"])].filter(
    (c) => shoppingList.some((i) => i.category === c),
  );
  const categoryOptions = [...new Set([...categories, shopCategory, "other"])];
  const loggedNames = new Set(summary.meals.map((m) => m.name.toLowerCase()));
  const notLoggedFoods = pastFoods.filter((f) => !loggedNames.has(f.name.toLowerCase()));
  const quickAdds = history.filter((h) => !shoppingList.some((i) => sameItem(i, h))).slice(0, 12);

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

              <AutoHeight className="entries">
                {summary.meals.length === 0 ? (
                  <p className="empty-note">No meals logged today.</p>
                ) : (
                  <Fragment key={selectedDate}>
                  {summary.meals.map((meal) => (
                    <div key={meal.id} ref={rowRef(meal.id)} className="entry-row">
                      <div>
                        <div className="entry-main">
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
                        onClick={() => leave(meal.id, () => handleDeleteMeal(meal.id))}
                        aria-label={`Delete meal ${meal.name}`}
                        title="Delete"
                      >
                        <TrashIcon size={17} />
                      </button>
                    </div>
                  ))}
                  </Fragment>
                )}
              </AutoHeight>
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
            <button type="button" className="btn-sm tint" onClick={() => openShopForm(null)}>
              <PlusIcon size={14} />
              Add item
            </button>
          </div>

          <div className="head-actions">
            <button
              type="button"
              className="secondary btn-sm"
              disabled={shoppingList.every((i) => !i.isBought)}
              onClick={handleClearBought}
            >
              Clear bought
            </button>
          </div>

          {quickAdds.length > 0 && (
            <div className="quick-add" role="group" aria-labelledby="quick-add-label">
              <h3 id="quick-add-label" className="group-label">
                Add again
              </h3>
              <div className="chat-suggestions">
                {quickAdds.map((h) => (
                  <button
                    key={h.name}
                    type="button"
                    className="secondary chat-chip"
                    disabled={busy}
                    onClick={() => addShopping(toShopInput(h))}
                    aria-label={`Add ${h.name}, ${Number(h.amount)} ${h.unit}`}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {shoppingList.length === 0 && <p className="empty-note">Your shopping list is empty.</p>}
          {shopCategories.map((cat) => (
            <div key={cat} className="shopping-group">
              <h3 className="group-label">{cat}</h3>
              {shoppingList
                .filter((item) => item.category === cat)
                .map((item) => (
                  <div key={item.id} ref={rowRef(item.id)} className="shopping-row">
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
                    <div className="row-actions">
                      <button
                        type="button"
                        className="delete-icon-btn edit"
                        onClick={() => openShopForm(item)}
                        aria-label={`Edit ${item.name}`}
                        title="Edit"
                      >
                        <PencilIcon size={17} />
                      </button>
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
                  </div>
                ))}
            </div>
          ))}
        </section>
      )}

      {activeTab === "shopping" && (
        <section className="surface" aria-labelledby="categories-title">
          <div className="section-head">
            <h2 id="categories-title" className="section-title">
              Categories
            </h2>
            <button type="button" className="btn-sm tint" onClick={() => openCategoryForm(null)}>
              <PlusIcon size={14} />
              Add category
            </button>
          </div>
          <p className="muted">Store sections in the order you walk them. Items without one go to Other.</p>
          {categories.map((cat) => (
            <div key={cat} className="shopping-row">
              <span className="category-name">{cat}</span>
              <div className="row-actions">
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={() => openCategoryForm(cat)}
                  aria-label={`Edit category ${cat}`}
                  title="Edit"
                >
                  <PencilIcon size={17} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {activeTab === "chat" && (
        <section className="surface" aria-labelledby="chat-title">
          <div className="section-head">
            <h2 id="chat-title" className="section-title">
              Food Assistant
            </h2>
            <button
              type="button"
              className="btn-sm tint"
              onClick={() => setIsPastOpen(true)}
            >
              Past foods
            </button>
          </div>

          <div className="chat-suggestions">
            {[
              "2 felii de pizza la prânz",
              "Omletă din 3 ouă cu telemea",
              "200g piept de pui cu 150g orez",
              "Ce calorii mai am pentru azi?",
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
                {msg.meals?.map((m) => (
                  <div key={m.id} className="chat-tool number-tabular">
                    <strong>Masă adăugată:</strong> {m.name} · {m.calories} kcal · {Number(m.protein)}g P ·{" "}
                    {Number(m.carbs)}g C · {Number(m.fat)}g F
                  </div>
                ))}
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

      <Modal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        title={editingShop ? "Edit item" : "New shopping item"}
      >
        <form onSubmit={handleShopSubmit}>
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
              <select value={shopCategory} onChange={(e) => setShopCategory(e.target.value)}>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsShopModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !shopName.trim()}>
              {editingShop ? "Save" : "Add item"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isPastOpen} onClose={() => setIsPastOpen(false)} title="Past foods">
        <div className="form-stack">
          <AutoHeight className="entries">
            {notLoggedFoods.length === 0 ? (
              <p className="empty-note">Everything you logged before is already in today.</p>
            ) : (
              notLoggedFoods.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  className="entry-row past-food"
                  disabled={busy}
                  onClick={() => handleLogPastFood(f)}
                  aria-label={`Log ${f.name}, ${f.calories} kcal`}
                >
                  <div>
                    <strong>{f.name}</strong>
                    <p className="card-sub muted number-tabular">
                      {f.calories} kcal · {Number(f.protein)}g P · {Number(f.carbs)}g C · {Number(f.fat)}g F
                    </p>
                  </div>
                  <PlusIcon size={16} />
                </button>
              ))
            )}
          </AutoHeight>
        </div>
      </Modal>

      <Modal
        isOpen={catEdit !== null}
        onClose={() => setCatEdit(null)}
        title={catEdit?.from ? "Edit category" : "New category"}
      >
        <form onSubmit={handleCategorySubmit}>
          <div className="form-stack">
            <label>
              Name
              <input
                type="text"
                maxLength={50}
                autoFocus
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
              />
            </label>
            {catEdit?.from && (
              <p className="muted move-hint">Its items move along. An existing name merges the two.</p>
            )}
          </div>
          <div className="form-actions">
            {catEdit?.from && (
              <button type="button" className="danger" disabled={busy} onClick={handleDeleteCategory}>
                Delete
              </button>
            )}
            <button type="button" className="secondary" onClick={() => setCatEdit(null)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !catName.trim()}>
              {catEdit?.from ? "Save" : "Add"}
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
