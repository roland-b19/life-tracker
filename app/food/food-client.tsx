"use client";

import { useEffect, useRef, useState } from "react";
import { compareShopping } from "@/lib/check-order";
import { dayLabel, formatDMY, toISODate } from "@/lib/format-date";
import { AddButton, Badge, BigNumber, Card, Checkbox, Dashboard, DashboardAside, DashboardMain, DayStepper, EmptyNote, Field, FieldPair, FormModal, Page, ProgressBar, ReadonlyNote, SelectField, TintButton, Toolbar } from "../components/blocks";
import { AnimatedNumber } from "../components/animated-number";
import { Segmented } from "../components/segmented";
import { isClaudeEnabled } from "@/lib/features";
import { DropIcon, FootstepsIcon, ScaleIcon, PlusIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { WeightPanel, type WeightEntry } from "./weight-panel";
import { MetricPanel, withDay, type Entry } from "./metric-panel";
import { DeleteButton, EditButton, IconButton, ListBox, RowActions, useMore } from "../components/lists";
import { CategoriesCard, CategoryField, GroupedList, useFolded, type CategoriesApi } from "../components/categories-card";
import {
  addShoppingCategoryAction,
  addShoppingItemAction,
  addWaterAction,
  setWaterAction,
  clearBoughtItemsAction,
  deleteMealAction,
  forgetPastFoodAction,
  restorePastFoodAction,
  deleteShoppingCategoryAction,
  deleteShoppingItemAction,
  getDaySummaryAction,
  logMealAction,
  restoreMealAction,
  renameShoppingCategoryAction,
  reorderShoppingCategoriesAction,
  revertShoppingCategoryAction,
  restoreShoppingItemsAction,
  toggleShoppingItemAction,
  updateShoppingItemAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/app/actions/food";
import { sendFoodChatMessageAction } from "@/app/actions/food-chat";
import { signedKg, type WeightStats } from "@/lib/weight-stats";

interface MealData {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  isEstimated?: boolean;
  forgotten?: boolean;
  createdAt?: Date | string;
}

/** Health's shopping categories live in their own table; the shared Categories card saves through these. */
const shoppingCategories: CategoriesApi = {
  id: "shopping",
  add: (name) => addShoppingCategoryAction({ name }),
  rename: (from, to) => renameShoppingCategoryAction({ from, to }),
  remove: (name) => deleteShoppingCategoryAction({ name }),
  revert: (input) => revertShoppingCategoryAction(input),
  reorder: (names) => reorderShoppingCategoriesAction({ names }),
};

interface ShoppingItemData {
  id: string;
  name: string;
  amount: string;
  unit: string;
  category: string;
  isBought: boolean;
  /** When the box last changed; null if it never did. */
  checkedAt: Date | string | null;
}

const UNITS = ["pcs", "g", "kg", "ml", "l", "pack", "bottle", "can", "jar", "box", "bag", "bunch"];

/** A food logged before, offered again in the "Past foods" sheet. */
/** A meal's numbers on two lines: energy and protein, then carbs and fat. */
function MealMacros({ m }: { m: { calories: number; protein: string | number; carbs: string | number; fat: string | number } }) {
  return (
    <p className="card-sub muted number-tabular">
      {m.calories} kcal · {Math.round(Number(m.protein))}g P
      <br />
      {Math.round(Number(m.carbs))}g C · {Math.round(Number(m.fat))}g F
    </p>
  );
}

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
  weightAnalytics: WeightStats;
  initialShoppingList: ShoppingItemData[];
  /** The user's store sections in walking order, without the built-in "other". */
  shoppingCategories: string[];
  pastFoods: PastFood[];
}

type Goals = FoodClientProps["targets"];
// Same ranges as updateNutritionTargetsSchema.
const NUTRITION_GOALS = [
  { key: "calories", label: "Calories (kcal)", min: 500, max: 10000 },
  { key: "proteinGrams", label: "Protein (g)", min: 20, max: 500 },
  { key: "carbsGrams", label: "Carbs (g)", min: 0, max: 1000 },
  { key: "fatGrams", label: "Fat (g)", min: 0, max: 400 },
] as const;
type NutritionGoal = (typeof NUTRITION_GOALS)[number]["key"];
const METRIC_GOAL = { water: { min: 500, max: 15000 }, steps: { min: 1000, max: 100000 } };

export function FoodClient({
  userName,
  todayDate,
  targets,
  initialSummary,
  weightAnalytics: initialWeight,
  initialShoppingList,
  shoppingCategories: initialCategories,
  pastFoods: initialPastFoods,
}: FoodClientProps) {
  // Writes always go to today. The page knows its day only from when it loaded, so resuming it after midnight reloads it.
  useEffect(() => {
    const onShow = () => {
      if (!document.hidden && toISODate() !== todayDate) location.reload();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [todayDate]);
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [pastSummary, setPastSummary] = useState<FoodClientProps["initialSummary"] | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const day = selectedDate < todayDate && pastSummary ? pastSummary : summary;
  const isPast = day.date < todayDate;
  const dayRequest = useRef(0);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const [activeTab, setActiveTab] = useState<"daily" | "water" | "weight" | "steps" | "shopping" | "chat">("daily");
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShoppingItemData | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  // The open meal or shopping form's error; only one form is open at a time.
  const [formError, setFormError] = useState("");
  const [metricEdit, setMetricEdit] = useState<"water" | "steps">("water");
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricInput, setMetricInput] = useState("");
  const [metricGoalInput, setMetricGoalInput] = useState("");
  const [goals, setGoals] = useState(targets);
  // The server takes all six goals at once, so every write starts from the latest ones.
  const latestGoals = useRef(targets);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<NutritionGoal, string>>({ calories: "", proteinGrams: "", carbsGrams: "", fatGrams: "" });
  const [weightAnalytics, setWeightAnalytics] = useState(initialWeight);
  // Each health tab's list, kept for this visit so reopening a tab is instant (it goes with the page, so never to another user).
  const [waterList, setWaterList] = useState<Entry[] | null>(null);
  const [stepsList, setStepsList] = useState<Entry[] | null>(null);
  const [weightList, setWeightList] = useState<WeightEntry[] | null>(null);
  // Today's water and steps can change on the other tabs while their tab is closed: a tab opens with today's value.
  function openTab(tab: typeof activeTab) {
    setWaterList((l) => l && withDay(l, todayDate, summary.metrics.waterMl));
    setStepsList((l) => l && withDay(l, todayDate, summary.metrics.steps));
    setActiveTab(tab);
  }
  const [pastFoods, setPastFoods] = useState(initialPastFoods);
  const [isPastOpen, setIsPastOpen] = useState(false);

  const { showToast } = useToast();
  const shownWeight = weightAnalytics.sevenDayAverage ?? weightAnalytics.latestWeight;

  // In-app Food AI Chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      role: "user" | "model";
      text: string;
      meals?: MealData[];
    }>
  >([]);
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

  // Only past days load; the latest request wins, a failed one steps back to the day on screen.
  async function goToDay(date: string) {
    const shown = day.date;
    setSelectedDate(date);
    const request = ++dayRequest.current;
    if (date >= todayDate) return;
    try {
      const loaded = await getDaySummaryAction(date);
      if (request === dayRequest.current) setPastSummary(loaded);
    } catch {
      if (request !== dayRequest.current) return;
      setSelectedDate(shown);
      setStatusMessage("Failed to load that day");
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  // sign 1 adds the meal to the day, -1 removes it; either is a no-op when the day already is that way.
  function applyMeal(meal: MealData, sign: 1 | -1) {
    setSummary((prev) => {
      if (prev.meals.some((m) => m.id === meal.id) === (sign === 1)) return prev;
      return {
        ...prev,
        meals: sign === 1 ? [...prev.meals, meal].sort((a, b) => +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0)) : prev.meals.filter((m) => m.id !== meal.id),
        totals: {
          calories: Math.max(0, prev.totals.calories + sign * meal.calories),
          protein: Math.max(0, round1(prev.totals.protein + sign * parseFloat(meal.protein))),
          carbs: Math.max(0, round1(prev.totals.carbs + sign * parseFloat(meal.carbs))),
          fat: Math.max(0, round1(prev.totals.fat + sign * parseFloat(meal.fat))),
        },
      };
    });
  }

  /** Undo of a log: the meals leave the day at once; one the server refuses to delete comes back. Returns the ids removed. */
  async function undoLogged(logged: MealData[]) {
    logged.forEach((m) => applyMeal(m, -1));
    const results = await Promise.all(logged.map((m) => deleteMealAction(m.id).then(() => true, () => false)));
    const failed = logged.filter((_, i) => !results[i]);
    if (failed.length) {
      failed.forEach((m) => applyMeal(m, 1));
      showToast({ message: "Failed to undo", type: "warning" });
    }
    return new Set(logged.filter((_, i) => results[i]).map((m) => m.id));
  }

  async function handleLogMeal(e: React.FormEvent) {
    e.preventDefault();
    if (!mealName.trim()) return;

    setBusy(true);
    setFormError("");
    try {
      const res = await logMealAction({
        date: todayDate,
        name: mealName.trim(),
        calories: parseInt(mealCalories, 10) || 0,
        protein: parseFloat(mealProtein) || 0,
        carbs: parseFloat(mealCarbs) || 0,
        fat: parseFloat(mealFat) || 0,
      });

      if (res.success && res.meal) {
        const meal = res.meal as MealData;
        applyMeal(meal, 1);
        rememberFoods([meal]);
        setMealName("");
        setMealCalories("");
        setMealProtein("");
        setMealCarbs("");
        setMealFat("");
        setIsMealModalOpen(false);
        showToast({
          message: `Added "${meal.name}" (${meal.calories} kcal)`,
          type: "success",
          onUndo: () => void undoLogged([meal]),
        });
      } else setFormError("Failed to add meal");
    } catch {
      setFormError("Failed to add meal");
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

  /** Takes a food off the list (its days keep it); Undo puts back exactly the meals it hid, in the same place. */
  function handleForgetPastFood(food: PastFood) {
    const index = pastFoods.findIndex((f) => f.name === food.name);
    setPastFoods((prev) => prev.filter((f) => f.name !== food.name));
    const hidden = forgetPastFoodAction({ name: food.name }).then(
      (r) => r.ids,
      () => null,
    );
    const putBack = () =>
      setPastFoods((prev) => (prev.some((f) => f.name.toLowerCase() === food.name.toLowerCase()) ? prev : [...prev.slice(0, index), food, ...prev.slice(index)]));
    showToast({
      message: `Removed "${food.name}"`,
      onUndo: async () => {
        const ids = await hidden;
        if (!ids) return; // the failure path below puts it back
        putBack();
        const restored = await restorePastFoodAction({ ids }).then(
          () => true,
          () => false,
        );
        if (restored) return;
        setPastFoods((prev) => prev.filter((f) => f.name !== food.name));
        showToast({ message: "Failed to restore past food", type: "warning" });
      },
    });
    void hidden.then((ids) => {
      if (ids) return;
      putBack();
      showToast({ message: "Failed to remove past food", type: "warning" });
    });
  }

  async function handleLogPastFood(food: PastFood) {
    setBusy(true);
    try {
      const res = await logMealAction({
        date: todayDate,
        name: food.name,
        calories: food.calories,
        protein: parseFloat(food.protein) || 0,
        carbs: parseFloat(food.carbs) || 0,
        fat: parseFloat(food.fat) || 0,
        isEstimated: food.isEstimated,
      });
      const meal = res.meal as MealData;
      applyMeal(meal, 1);
      showToast({
        message: `Added "${meal.name}" (${meal.calories} kcal)`,
        type: "success",
        onUndo: () => void undoLogged([meal]),
      });
    } catch {
      setStatusMessage("Failed to add meal");
    } finally {
      setBusy(false);
    }
  }

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function handleDeleteMeal(meal: MealData) {
    applyMeal(meal, -1);
    const deleted = deleteMealAction(meal.id).then(
      () => true,
      () => false,
    );
    showToast({
      message: `Removed "${meal.name}"`,
      onUndo: async () => {
        if (!(await deleted)) return; // the failure path below puts it back
        const res = await restoreMealAction({
          id: meal.id,
          createdAt: meal.createdAt,
          forgotten: meal.forgotten,
          date: meal.date,
          name: meal.name,
          calories: meal.calories,
          protein: parseFloat(meal.protein),
          carbs: parseFloat(meal.carbs),
          fat: parseFloat(meal.fat),
          isEstimated: meal.isEstimated,
        }).catch(() => null);
        if (res?.success) applyMeal(meal, 1);
        else showToast({ message: "Failed to restore meal", type: "warning" });
      },
    });
    void deleted.then((ok) => {
      if (ok) return;
      applyMeal(meal, 1);
      showToast({ message: "Failed to remove meal", type: "warning" });
    });
  }

  const setMetric = (key: "waterMl" | "steps", value: number) =>
    setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));

  // A tap adds at once and shows its toast; a refused save takes the amount back off.
  function addWater(delta: number) {
    const bump = (d: number) => setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, waterMl: prev.metrics.waterMl + d } }));
    bump(delta);
    let undone = false;
    const saved = addWaterAction(todayDate, delta).then((res) => res.success === true, () => false);
    showToast({
      message: `Added ${delta} ml`,
      type: "success",
      onUndo: async () => {
        undone = true;
        bump(-delta);
        if (!(await saved)) return; // the add never happened
        const back = await addWaterAction(todayDate, -delta).then((res) => res.success === true, () => false);
        if (!back) {
          bump(delta);
          showToast({ message: "Failed to undo the edit", type: "warning" });
        }
      },
    });
    void saved.then((ok) => {
      if (ok || undone) return;
      bump(-delta);
      showToast({ message: "Failed to add water", type: "warning" });
    });
  }

  const putGoals = (patch: Partial<Goals>) => {
    latestGoals.current = { ...latestGoals.current, ...patch };
    setGoals(latestGoals.current);
  };
  const writeGoals = (patch: Partial<Goals>) =>
    updateTargetsAction({ ...latestGoals.current, ...patch }).then((res) => res.success === true, () => false);

  // Saves the edited total and goal; false keeps the form open with its error.
  async function saveMetric(metric: "water" | "steps", value: number, goal: number) {
    const key = metric === "water" ? "waterMl" : "steps";
    const previous = summary.metrics[key];
    const previousGoal = latestGoals.current[key];
    const amountChanged = value !== previous;
    const goalChanged = goal !== previousGoal;
    if (!amountChanged && !goalChanged) return true;
    const write = (v: number) =>
      metric === "water" ? setWaterAction(todayDate, v) : updateStepsAction(todayDate, v);
    let saved = previous;
    if (amountChanged) {
      const res = await write(value).catch(() => null);
      if (!res?.success || !res.metrics) return false;
      saved = res.metrics[key];
      setMetric(key, saved);
    }
    // A retry after a refused goal finds the amount already saved and writes only the goal.
    if (goalChanged) {
      if (!(await writeGoals({ [key]: goal }))) return false;
      putGoals({ [key]: goal });
    }
    const name = metric === "water" ? "Water" : "Steps";
    const unit = metric === "water" ? " ml" : "";
    showToast({
      message: !goalChanged
        ? `${name} set to ${value}${unit}`
        : amountChanged
          ? `${name} set to ${value}${unit}, goal ${goal}${unit}`
          : `${name} goal set to ${goal}${unit}`,
      type: "success",
      onUndo: async () => {
        if (amountChanged) setMetric(key, previous);
        if (goalChanged) putGoals({ [key]: previousGoal });
        let failed = false;
        if (amountChanged) {
          const back =
            metric === "water"
              ? await setWaterAction(todayDate, previous).catch(() => null)
              : await updateStepsAction(todayDate, previous).catch(() => null);
          if (back?.success && back.metrics) setMetric(key, back.metrics[key]);
          else {
            setMetric(key, saved);
            failed = true;
          }
        }
        if (goalChanged && !(await writeGoals({ [key]: previousGoal }))) {
          putGoals({ [key]: goal });
          failed = true;
        }
        if (failed) showToast({ message: "Failed to undo the edit", type: "warning" });
      },
    });
    return true;
  }

  function openMetricEdit(metric: "water" | "steps") {
    setFormError("");
    setMetricInput(String(metric === "water" ? summary.metrics.waterMl : summary.metrics.steps));
    setMetricGoalInput(String(metric === "water" ? goals.waterMl : goals.steps));
    setMetricEdit(metric);
    setMetricOpen(true);
  }

  async function handleMetricSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseInt(metricInput, 10);
    const goal = parseInt(metricGoalInput, 10);
    const range = METRIC_GOAL[metricEdit];
    if (busy) return;
    if (!Number.isInteger(value) || value < 0) return setFormError("Please enter a whole number.");
    if (!Number.isInteger(goal) || goal < range.min || goal > range.max)
      return setFormError(`The goal must be between ${range.min} and ${range.max}.`);
    setBusy(true);
    setFormError("");
    const ok = await saveMetric(metricEdit, value, goal);
    setBusy(false);
    if (ok) setMetricOpen(false);
    else setFormError(`Failed to save ${metricEdit}`);
  }

  function openGoals() {
    setFormError("");
    setGoalInputs(Object.fromEntries(NUTRITION_GOALS.map((g) => [g.key, String(goals[g.key])])) as Record<NutritionGoal, string>);
    setGoalsOpen(true);
  }

  async function handleGoalsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next = Object.fromEntries(NUTRITION_GOALS.map((g) => [g.key, Number(goalInputs[g.key])])) as Record<NutritionGoal, number>;
    const bad = NUTRITION_GOALS.find((g) => !Number.isInteger(next[g.key]) || next[g.key] < g.min || next[g.key] > g.max);
    if (bad) return setFormError(`${bad.label.split(" ")[0]} must be between ${bad.min} and ${bad.max}.`);
    const previous = Object.fromEntries(NUTRITION_GOALS.map((g) => [g.key, goals[g.key]])) as Record<NutritionGoal, number>;
    setBusy(true);
    setFormError("");
    const ok = await writeGoals(next);
    setBusy(false);
    if (!ok) return setFormError("Failed to save goals");
    putGoals(next);
    setGoalsOpen(false);
    showToast({
      message: "Saved nutrition goals",
      type: "success",
      onUndo: async () => {
        putGoals(previous);
        if (await writeGoals(previous)) return;
        putGoals(next);
        showToast({ message: "Failed to undo the edit", type: "warning" });
      },
    });
  }

  const toShopInput = (i: ShoppingItemData) => ({
    name: i.name,
    amount: Number(i.amount),
    unit: i.unit,
    category: i.category,
  });

  function openShopForm(item: ShoppingItemData | null) {
    setFormError("");
    setEditingShop(item);
    setShopName(item?.name ?? "");
    setShopAmount(item ? String(Number(item.amount)) : "1");
    setShopUnit(item?.unit ?? "pcs");
    setShopCategory(item?.category ?? "other");
    setIsShopModalOpen(true);
  }

  const upsertShop = (item: ShoppingItemData) =>
    setShoppingList((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item]));
  const dropShop = (id: string) => setShoppingList((prev) => prev.filter((i) => i.id !== id));

  /** Adds an item; the server adds the amount to the same item when it is already on the list. */
  async function addShopping(input: { name: string; amount: number; unit: string; category: string }) {
    setBusy(true);
    try {
      const res = await addShoppingItemAction(input);
      const item = res.item as ShoppingItemData;
      const before = shoppingList.find((i) => i.id === item.id);
      upsertShop(item);
      showToast(
        !before
          ? {
              message: `Added "${item.name}"`,
              type: "success",
              onUndo: async () => {
                dropShop(item.id);
                if (await deleteShoppingItemAction(item.id).then(() => true, () => false)) return;
                upsertShop(item);
                showToast({ message: "Failed to undo", type: "warning" });
              },
            }
          : {
              message: `"${item.name}" is now ${Number(item.amount)} ${item.unit}`,
              type: "success",
              onUndo: async () => {
                upsertShop(before);
                const back = await updateShoppingItemAction({
                  ...toShopInput(before),
                  itemId: before.id,
                  isBought: before.isBought,
                  checkedAt: before.checkedAt,
                }).catch(() => null);
                if (!back?.item) {
                  upsertShop(item);
                  return showToast({ message: "Failed to undo the edit", type: "warning" });
                }
              },
            },
      );
      return true;
    } catch {
      setFormError("Failed to add item");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Writes an edited item into the list; the bought state stays as it is on screen.
  const replaceShop = (to: ShoppingItemData) =>
    setShoppingList((prev) => prev.map((i) => (i.id === to.id ? { ...to, isBought: i.isBought, checkedAt: i.checkedAt } : i)));

  async function handleShopSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      name: shopName.trim(),
      amount: parseFloat(shopAmount) || 1,
      unit: shopUnit.trim() || "pcs",
      category: shopCategory.trim().toLowerCase() || "other",
    };
    if (!input.name) return;
    setFormError("");

    if (!editingShop) {
      if (await addShopping(input)) setIsShopModalOpen(false);
      return;
    }
    const before = editingShop;
    setBusy(true);
    try {
      const res = await updateShoppingItemAction({ ...input, itemId: before.id });
      const item = res.item as ShoppingItemData;
      replaceShop(item);
      setIsShopModalOpen(false);
      showToast({
        message: `Saved "${item.name}"`,
        type: "success",
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onUndo: async () => {
          replaceShop(before);
          const back = await updateShoppingItemAction({ ...toShopInput(before), itemId: before.id }).catch(() => null);
          if (!back?.item) {
            replaceShop(item);
            showToast({ message: "Failed to undo the edit", type: "warning" });
          }
        },
      });
    } catch {
      setFormError("Failed to save item");
    } finally {
      setBusy(false);
    }
  }

  /** The shared Categories card re-files the items: a rename or delete moves them, Undo moves `only` back. */
  const refile = (from: string, to: string, only?: string[]) =>
    setShoppingList((prev) => prev.map((i) => (i.category === from && (!only || only.includes(i.id)) ? { ...i, category: to } : i)));

  function handleToggleShopping(item: ShoppingItemData) {
    const next = !item.isBought;
    const setBought = (isBought: boolean) =>
      setShoppingList((prev) => prev.map((i) => (i.id === item.id ? { ...i, isBought, checkedAt: new Date() } : i)));
    setBought(next);
    const saved = toggleShoppingItemAction(item.id, next).then(
      () => true,
      () => false,
    );
    showToast({
      message: next ? `Bought "${item.name}"` : `"${item.name}" is back on the list`,
      type: "success",
      onUndo: async () => {
        setBought(!next);
        if (!(await saved)) return; // the failure path below put it back
        if (await toggleShoppingItemAction(item.id, !next).then(() => true, () => false)) return;
        setBought(next);
        showToast({ message: "Failed to undo the edit", type: "warning" });
      },
    });
    void saved.then((ok) => {
      if (ok) return;
      setBought(!next);
      setStatusMessage("Failed to update item");
    });
  }

  function handleDeleteShoppingItem(item: ShoppingItemData) {
    // The row leaves at once; the server delete runs alongside, so the tap never waits on the network.
    dropShop(item.id);
    const deleted = deleteShoppingItemAction(item.id).then(
      () => true,
      () => false,
    );
    showToast({
      message: `Removed "${item.name}"`,
      onUndo: async () => {
        if (!(await deleted)) return; // the failure path below puts it back
        const back = await restoreShoppingItemsAction({ itemIds: [item.id] }).catch(() => null);
        if (!back?.success) return setStatusMessage("Failed to restore item");
        upsertShop(item);
      },
    });
    void deleted.then((ok) => {
      if (ok) return;
      upsertShop(item);
      setStatusMessage("Failed to remove item");
    });
  }

  // Like a delete: the rows leave and the toast shows at once; a failed clear puts them back.
  function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    if (!cleared.length) return;
    const ids = new Set(cleared.map((c) => c.id));
    const done = clearBoughtItemsAction().then(
      () => true,
      () => false,
    );
    const drop = () => setShoppingList((prev) => prev.filter((i) => !ids.has(i.id)));
    const putBack = () => setShoppingList((prev) => [...prev.filter((i) => !ids.has(i.id)), ...cleared]);
    drop();
    showToast({
      message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
      onUndo: async () => {
        putBack();
        if (!(await done)) return; // the clear never happened
        const back = await restoreShoppingItemsAction({ itemIds: [...ids] }).catch(() => null);
        if (!back?.success) {
          drop();
          setStatusMessage("Failed to restore items");
        }
      },
    });
    void done.then((ok) => {
      if (ok) return;
      putBack();
      setStatusMessage("Failed to clear bought items");
    });
  }

  async function handleSendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg = { role: "user" as const, text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      // The server reads only the last 10 turns and rejects more than 20.
      const history = chatMessages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const res = await sendFoodChatMessageAction({
        message: text,
        history,
        date: todayDate,
        time: new Date().toTimeString().slice(0, 5),
      });
      const meals = res.meals as MealData[];
      setChatMessages((prev) => [...prev, { role: "model", text: res.reply, meals }]);
      if (res.freshSummary) setSummary(res.freshSummary);
      if (meals.length) {
        rememberFoods(meals);
        showToast({
          message: `Logged ${meals.length} meal${meals.length === 1 ? "" : "s"}`,
          type: "success",
          onUndo: async () => {
            const removed = await undoLogged(meals);
            setChatMessages((prev) => prev.map((m) => (m.meals ? { ...m, meals: m.meals.filter((x) => !removed.has(x.id)) } : m)));
          },
        });
      }
    } catch {
      // Take the message back so it can be sent again.
      setChatMessages((prev) => prev.filter((m) => m !== userMsg));
      setChatInput(text);
      setStatusMessage("Failed to send message");
    } finally {
      setChatLoading(false);
    }
  }

  const macros = [
    { label: "Calories", value: day.totals.calories, target: goals.calories, unit: " kcal" },
    { label: "Protein", value: day.totals.protein, target: goals.proteinGrams, unit: "g" },
    { label: "Carbs", value: day.totals.carbs, target: goals.carbsGrams, unit: "g" },
    { label: "Fat", value: day.totals.fat, target: goals.fatGrams, unit: "g" },
  ];
  // A zero goal (carbs and fat allow it) counts as met once anything is eaten.
  const pct = (value: number, target: number) => (target > 0 ? Math.min(100, Math.round((value / target) * 100)) : value > 0 ? 100 : 0);
  const waterPct = pct(day.metrics.waterMl, goals.waterMl);
  const stepsPct = pct(day.metrics.steps, goals.steps);
  // Walking order, unknown categories after the user's own, "other" last.
  const shopCategories = [...new Set([...categories, ...shoppingList.map((i) => i.category).filter((c) => c !== "other"), "other"])].filter(
    (c) => shoppingList.some((i) => i.category === c),
  );
  const [shownMeals, moreMeals] = useMore(day.meals);
  const [isShopFolded, toggleShop] = useFolded("shopping");
  const allShopping = shopCategories.flatMap((c) => shoppingList.filter((i) => i.category === c).sort(compareShopping));

  return (
    <Page userName={userName}>
      <Toolbar>
        <Segmented
          label="Health sections"
          value={activeTab}
          options={[
            { value: "daily", label: "Today" },
            { value: "water", label: "Water" },
            { value: "weight", label: "Weight" },
            { value: "steps", label: "Steps" },
            { value: "shopping", label: "Shopping", short: "Shop" },
            ...(isClaudeEnabled() ? [{ value: "chat" as const, label: "Assistant", short: "AI" }] : []),
          ]}
          onChange={openTab}
        />
      </Toolbar>

      {activeTab === "water" && <MetricPanel kind="water" onToday={(v) => setMetric("waterMl", v)} list={waterList} setList={setWaterList} />}
      {activeTab === "weight" && <WeightPanel onStats={setWeightAnalytics} list={weightList} setList={setWeightList} />}
      {activeTab === "steps" && <MetricPanel kind="steps" onToday={(v) => setMetric("steps", v)} list={stepsList} setList={setStepsList} />}

      {activeTab === "daily" && (
        <>
          <Toolbar dash className="day-toolbar">
            <DayStepper
              value={selectedDate}
              today={todayDate}
              max={todayDate}
              label={selectedDate === todayDate ? "Today" : dayLabel(selectedDate)}
              onChange={goToDay}
            />
          </Toolbar>
          <Dashboard>
            <DashboardMain>
              <Card
                id="macros-title"
                title="Nutrition"
                end={!isPast && <EditButton label="Edit nutrition goals" onClick={openGoals} />}
              >
                <div className="macro-grid">
                  {macros.map((m) => (
                    <div key={m.label} className="macro-card">
                      <span className="macro-title">{m.label}</span>
                      <span className="macro-numbers">
                        <AnimatedNumber value={m.value} from={m.value} />
                        <span className="macro-target">
                          / {m.target}
                          {m.unit}
                        </span>
                      </span>
                      <ProgressBar percent={pct(m.value, m.target)} over={m.value > m.target} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card
                id="meals-title"
                title="Meals"
                count={day.meals.length}
                sub={formatDMY(day.date)}
                below
                actions={
                  !isPast && (
                    <>
                      <TintButton onClick={() => setIsPastOpen(true)}>Past foods</TintButton>
                      <AddButton onClick={() => (setFormError(""), setIsMealModalOpen(true))}>Add meal</AddButton>
                    </>
                  )
                }
              >
                {isPast && <ReadonlyNote>Past days are read-only</ReadonlyNote>}

                <ListBox wash className="entries">
                  {day.meals.length === 0 ? (
                    <EmptyNote>{isPast ? "No meals were logged this day." : "No meals logged today."}</EmptyNote>
                  ) : (
                    <>
                      {shownMeals.map((meal) => (
                        <div key={meal.id} className="entry-row">
                          <div>
                            <div className="entry-main">
                              <strong>{meal.name}</strong>
                              {meal.isEstimated && <Badge kind="carried">AI estimate</Badge>}
                            </div>
                            <MealMacros m={meal} />
                          </div>
                          {!isPast && <DeleteButton label={`Delete meal ${meal.name}`} onClick={() => handleDeleteMeal(meal)} />}
                        </div>
                      ))}
                      {moreMeals}
                    </>
                  )}
                </ListBox>
              </Card>
            </DashboardMain>

            <DashboardAside>
              <Card
                id="water-title"
                title="Water"
                icon={<DropIcon size={18} />}
                end={!isPast && <EditButton label="Edit water and goal" onClick={() => openMetricEdit("water")} />}
              >
                <BigNumber value={Math.round(day.metrics.waterMl)} of={`/ ${goals.waterMl} ml`} />
                <ProgressBar percent={waterPct} />
                {!isPast && (
                  <div className="tap-buttons">
                    <button type="button" className="secondary tap-btn" onClick={() => addWater(250)}>
                      +250 ml
                    </button>
                    <button type="button" className="secondary tap-btn" onClick={() => addWater(500)}>
                      +500 ml
                    </button>
                  </div>
                )}
              </Card>

              <Card id="weight-trend-title" title="Weight" icon={<ScaleIcon size={18} />}>
                <BigNumber
                  value={shownWeight === null ? "—" : Math.round(shownWeight * 100) / 100}
                  of={`kg${weightAnalytics.sevenDayAverage ? ", 7-day average" : ""}`}
                />
                {weightAnalytics.sinceLastWeek !== null && (
                  <p className="card-sub muted number-tabular">{signedKg(weightAnalytics.sinceLastWeek)} since last week</p>
                )}
              </Card>

              <Card
                id="steps-title"
                title="Steps"
                icon={<FootstepsIcon size={18} />}
                end={!isPast && <EditButton label="Edit steps and goal" onClick={() => openMetricEdit("steps")} />}
              >
                <BigNumber value={Math.round(day.metrics.steps)} of={`/ ${goals.steps}`} />
                <ProgressBar percent={stepsPct} />
              </Card>
            </DashboardAside>
          </Dashboard>
        </>
      )}

      {activeTab === "shopping" && (
        <Dashboard>
          <Card
            id="shopping-title"
            title="Shopping list"
            count={shoppingList.length}
            below
            actions={
              <>
                <TintButton disabled={shoppingList.every((i) => !i.isBought)} onClick={handleClearBought}>
                  Clear bought
                </TintButton>
                <AddButton onClick={() => openShopForm(null)}>Add item</AddButton>
              </>
            }
          >
            <ListBox className="shopping-groups">
              {shoppingList.length === 0 && <EmptyNote>Your shopping list is empty.</EmptyNote>}
              <GroupedList
                items={allShopping}
                wrap="shopping-group"
                isFolded={isShopFolded}
                onToggle={toggleShop}
                row={(item) => (
                  <div className="shopping-row">
                    <div className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                      <Checkbox
                        checked={item.isBought}
                        onChange={() => handleToggleShopping(item)}
                        label={`Mark ${item.name} as ${item.isBought ? "not bought" : "bought"}`}
                      />
                      <span>
                        {item.name} · {Number(item.amount)} {item.unit}
                      </span>
                    </div>
                    <RowActions onEdit={() => openShopForm(item)} onDelete={() => handleDeleteShoppingItem(item)} editLabel={`Edit ${item.name}`} deleteLabel={`Delete ${item.name}`} />
                  </div>
                )}
              />
            </ListBox>
          </Card>

          <CategoriesCard api={shoppingCategories} categories={categories} onChange={setCategories} onRefile={refile} />
        </Dashboard>
      )}

      {isClaudeEnabled() && activeTab === "chat" && (
        <Card id="chat-title" title="Food assistant">
          <div className="chat-log" aria-live="polite">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`chat-msg ${msg.role === "user" ? "user" : "model"}`}>
                <div className="chat-bubble">{msg.text}</div>
                {msg.meals?.map((m) => (
                  <div key={m.id} className="chat-tool number-tabular">
                    <strong>Added:</strong> {m.name} · {m.calories} kcal · {Number(m.protein)}g P ·{" "}
                    {Number(m.carbs)}g C · {Number(m.fat)}g F
                  </div>
                ))}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg model">
                <div className="chat-bubble typing">Calculating macros...</div>
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
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </form>
        </Card>
      )}

      <FormModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        title="New meal"
        onSubmit={handleLogMeal}
        error={formError}
        busy={busy}
        canSubmit={!!mealName.trim()}
      >
        <Field label="Name" type="text" disabled={busy} value={mealName} onChange={(e) => setMealName(e.target.value)} required />
        <FieldPair>
          <Field
            label="Calories (kcal)"
            type="number"
            inputMode="numeric"
            disabled={busy}
            value={mealCalories}
            onChange={(e) => setMealCalories(e.target.value)}
            className="number-tabular"
          />
          <Field
            label="Protein (g)"
            type="number"
            step="0.1"
            inputMode="decimal"
            disabled={busy}
            value={mealProtein}
            onChange={(e) => setMealProtein(e.target.value)}
            className="number-tabular"
          />
        </FieldPair>
        <FieldPair>
          <Field
            label="Carbs (g)"
            type="number"
            step="0.1"
            inputMode="decimal"
            disabled={busy}
            value={mealCarbs}
            onChange={(e) => setMealCarbs(e.target.value)}
            className="number-tabular"
          />
          <Field
            label="Fat (g)"
            type="number"
            step="0.1"
            inputMode="decimal"
            disabled={busy}
            value={mealFat}
            onChange={(e) => setMealFat(e.target.value)}
            className="number-tabular"
          />
        </FieldPair>
      </FormModal>

      <FormModal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        title={editingShop ? "Edit shopping item" : "New shopping item"}
        onSubmit={handleShopSubmit}
        error={formError}
        busy={busy}
        canSubmit={!!shopName.trim()}
      >
        <Field label="Name" type="text" disabled={busy} value={shopName} onChange={(e) => setShopName(e.target.value)} required />
        <FieldPair>
          <Field
            label="Amount"
            type="number"
            step="0.5"
            min="0.5"
            inputMode="decimal"
            disabled={busy}
            value={shopAmount}
            onChange={(e) => setShopAmount(e.target.value)}
          />
          <SelectField
            label="Unit"
            disabled={busy}
            value={shopUnit}
            onChange={(e) => setShopUnit(e.target.value)}
            // An older item with a typed-in unit keeps it as an option.
            options={(UNITS.includes(shopUnit) ? UNITS : [shopUnit, ...UNITS]).map((u) => ({ value: u, label: u }))}
          />
        </FieldPair>
        <CategoryField categories={categories} value={shopCategory} onChange={setShopCategory} disabled={busy} />
      </FormModal>

      <Modal isOpen={isPastOpen} onClose={() => setIsPastOpen(false)} title="Past foods">
        <div className="past-foods">
          <ListBox wash className="entries">
            {pastFoods.length === 0 ? (
              <EmptyNote>Nothing logged yet.</EmptyNote>
            ) : (
              pastFoods.map((f) => (
                <div key={f.name} className="entry-row">
                  <div>
                    <strong>{f.name}</strong>
                    <MealMacros m={f} />
                  </div>
                  <div className="row-actions">
                    <IconButton
                      edit
                      icon={<PlusIcon size={17} />}
                      disabled={busy}
                      onClick={() => handleLogPastFood(f)}
                      label={`Log ${f.name}, ${f.calories} kcal`}
                      title="Log"
                    />
                    <DeleteButton label={`Delete past food ${f.name}`} onClick={() => handleForgetPastFood(f)} />
                  </div>
                </div>
              ))
            )}
          </ListBox>
        </div>
      </Modal>

      <FormModal
        isOpen={metricOpen}
        onClose={() => setMetricOpen(false)}
        title={metricEdit === "water" ? "Edit water" : "Edit steps"}
        onSubmit={handleMetricSubmit}
        error={formError}
        busy={busy}
        canSubmit={metricInput !== "" && metricGoalInput !== ""}
      >
        <Field
          label={metricEdit === "water" ? "Water today (ml)" : "Steps today"}
          type="number"
          inputMode="numeric"
          min="0"
          max={metricEdit === "water" ? 20000 : 200000}
          step="1"
          required
          disabled={busy}
          value={metricInput}
          onChange={(e) => setMetricInput(e.target.value)}
        />
        <Field
          label={metricEdit === "water" ? "Daily goal (ml)" : "Daily goal (steps)"}
          type="number"
          inputMode="numeric"
          min={METRIC_GOAL[metricEdit].min}
          max={METRIC_GOAL[metricEdit].max}
          step="1"
          required
          disabled={busy}
          value={metricGoalInput}
          onChange={(e) => setMetricGoalInput(e.target.value)}
          className="number-tabular"
        />
      </FormModal>

      <FormModal
        isOpen={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        title="Edit goals"
        onSubmit={handleGoalsSubmit}
        error={formError}
        busy={busy}
        canSubmit={!Object.values(goalInputs).some((v) => v === "")}
      >
        {NUTRITION_GOALS.map((g) => (
          <Field
            key={g.key}
            label={g.label}
            type="number"
            inputMode="numeric"
            min={g.min}
            max={g.max}
            step="1"
            required
            disabled={busy}
            value={goalInputs[g.key]}
            onChange={(e) => setGoalInputs((prev) => ({ ...prev, [g.key]: e.target.value }))}
            className="number-tabular"
          />
        ))}
      </FormModal>
    </Page>
  );
}
