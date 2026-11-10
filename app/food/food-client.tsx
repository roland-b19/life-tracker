"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { addDays, dayLabel, formatDMY } from "@/lib/format-date";
import { Navigation } from "../components/navigation";
import { DatePicker } from "../components/date-picker";
import { Segmented } from "../components/segmented";
import { isClaudeEnabled } from "@/lib/features";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DropIcon,
  LockIcon,
  FootstepsIcon,
  ScaleIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Modal, useAfterClose } from "../components/modal";
import { useToast } from "../components/toast";
import { WeightPanel } from "./weight-panel";
import { MetricPanel } from "./metric-panel";
import { AnimatedNumber } from "../components/animated-number";
import { AutoHeight, useListMotion, useMore } from "../components/list-motion";
import {
  addShoppingItemAction,
  addWaterAction,
  clearBoughtItemsAction,
  deleteMealAction,
  deleteShoppingItemAction,
  getDaySummaryAction,
  logMealAction,
  addShoppingCategoryAction,
  deleteShoppingCategoryAction,
  renameShoppingCategoryAction,
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
}

interface ShoppingItemData {
  id: string;
  name: string;
  amount: string;
  unit: string;
  category: string;
  isBought: boolean;
}

const UNITS = ["pcs", "g", "kg", "ml", "l", "pack", "bottle", "can", "jar", "box", "bag", "bunch"];

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
  weightAnalytics,
  initialShoppingList,
  shoppingCategories: initialCategories,
  pastFoods: initialPastFoods,
}: FoodClientProps) {
  // Writes always go to today; a past day is a read-only view loaded on demand.
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [pastSummary, setPastSummary] = useState<FoodClientProps["initialSummary"] | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const day = selectedDate < todayDate && pastSummary ? pastSummary : summary;
  const isPast = day.date < todayDate;
  const dayRequest = useRef(0);
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  // Undo runs from a toast seconds later, so it reads the list as it is then.
  const latestShop = useRef(shoppingList);
  useEffect(() => {
    latestShop.current = shoppingList;
  });
  const [activeTab, setActiveTab] = useState<"daily" | "water" | "weight" | "steps" | "shopping" | "chat">("daily");
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<ShoppingItemData | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  // from: null adds a new category, a name edits that one.
  const [catEdit, setCatEdit] = useState<{ from: string | null }>({ from: null }); // outlives the close, so the dialog keeps its content while it fades
  const [catOpen, setCatOpen] = useState(false);
  // A renamed category keeps its row key, so its row re-enters like an edited Wishlist item.
  const catKeys = useRef(new Map<string, string>());
  const catKey = (cat: string) => {
    if (!catKeys.current.has(cat)) catKeys.current.set(cat, `cat:${cat}`);
    return catKeys.current.get(cat)!;
  };
  const [catName, setCatName] = useState("");
  const [catError, setCatError] = useState("");
  // The open meal or shopping form's error; only one form is open at a time.
  const [formError, setFormError] = useState("");
  // The kind outlives the open state, so the form keeps its title while it fades out.
  const [metricEdit, setMetricEdit] = useState<"water" | "steps">("water");
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricInput, setMetricInput] = useState("");
  const [metricGoalInput, setMetricGoalInput] = useState("");
  const [goals, setGoals] = useState(targets);
  // The server takes all six goals at once, so every write starts from the latest ones.
  const latestGoals = useRef(targets);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<NutritionGoal, string>>({ calories: "", proteinGrams: "", carbsGrams: "", fatGrams: "" });
  const [pastFoods, setPastFoods] = useState(initialPastFoods);
  const [isPastOpen, setIsPastOpen] = useState(false);

  const { showToast } = useToast();
  const { rowRef, enter, leave, move } = useListMotion();
  const shownWeight = weightAnalytics.sevenDayAverage ?? weightAnalytics.latestWeight;
  const { later, runAfterClose } = useAfterClose();
  // A Shopping group keeps its category's stable key, so a renamed category's group stays in place.
  const groupKey = (cat: string) => `group:${catKey(cat)}`;
  /** What to animate for item `id` in `category`: the row, or its whole group when no item outside `moving` is in it. */
  const shopKey = (id: string, category: string, moving = new Set([id])) =>
    latestShop.current.some((i) => !moving.has(i.id) && i.category === category) ? id : groupKey(category);

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
        later(() => {
          enter(meal.id);
          applyMeal(meal, 1);
        });
        rememberFoods([meal]);
        setMealName("");
        setMealCalories("");
        setMealProtein("");
        setMealCarbs("");
        setMealFat("");
        setIsMealModalOpen(false);
        // No Undo: a new meal is one tap from Delete.
        showToast({ message: `Added "${meal.name}" (${meal.calories} kcal)`, type: "success" });
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
      // The food leaves the sheet as the meal joins the day behind it.
      leave(`past:${food.name}`, () => {
        enter(meal.id);
        applyMeal(meal, 1);
      });
      showToast({ message: `Added "${meal.name}" (${meal.calories} kcal)`, type: "success" });
    } catch {
      setStatusMessage("Failed to add meal");
    } finally {
      setBusy(false);
    }
  }

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  function handleDeleteMeal(meal: MealData) {
    const deleted = deleteMealAction(meal.id).then(
      () => true,
      () => false,
    );
    // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
    const gone = new Promise<void>((done) =>
      leave(meal.id, () => {
        applyMeal(meal, -1);
        done();
      }),
    );
    const putBack = (back: MealData) => {
      enter(back.id);
      applyMeal(back, 1);
    };
    showToast({
      message: `Removed "${meal.name}"`,
      actionLabel: "Undo",
      onAction: async () => {
        await gone;
        if (!(await deleted)) return; // the failure path below puts it back
        const res = await logMealAction({
          date: meal.date,
          name: meal.name,
          calories: meal.calories,
          protein: parseFloat(meal.protein),
          carbs: parseFloat(meal.carbs),
          fat: parseFloat(meal.fat),
        }).catch(() => null);
        if (res?.success && res.meal) putBack(res.meal as MealData);
        else showToast({ message: "Failed to restore meal", type: "warning" });
      },
    });
    void Promise.all([deleted, gone]).then(([ok]) => {
      if (ok) return;
      putBack(meal);
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
      actionLabel: "Undo",
      onAction: async () => {
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
      metric === "water" ? addWaterAction(todayDate, v - summary.metrics.waterMl) : updateStepsAction(todayDate, v);
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
      actionLabel: "Undo",
      onAction: async () => {
        if (amountChanged) setMetric(key, previous);
        if (goalChanged) putGoals({ [key]: previousGoal });
        let failed = false;
        if (amountChanged) {
          const back =
            metric === "water"
              ? await addWaterAction(todayDate, previous - value).catch(() => null)
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
      actionLabel: "Undo",
      onAction: async () => {
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
    runAfterClose(); // reopened before the last close finished
    setFormError("");
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
        later(() => setShoppingList((prev) => prev.map((i) => (i.id === item.id ? item : i))));
      } else {
        later(() => {
          enter(shopKey(item.id, item.category));
          setShoppingList((prev) => [...prev, item]);
        });
      }
      // No Undo on a new item (it is one tap from Delete); adding to an item already listed is an edit, so it has one.
      if (!before) showToast({ message: `Added "${item.name}"`, type: "success" });
      else
        showToast({
          message: `"${item.name}" is now ${Number(item.amount)} ${item.unit}`,
          type: "success",
          actionLabel: "Undo",
          onAction: async () => {
            runAfterClose();
            setShoppingList((prev) => prev.map((i) => (i.id === before.id ? before : i)));
            const back = await updateShoppingItemAction({ ...toShopInput(before), itemId: before.id }).catch(() => null);
            if (!back?.item) {
              setShoppingList((prev) => prev.map((i) => (i.id === before.id ? item : i)));
              return showToast({ message: "Failed to undo the edit", type: "warning" });
            }
            if (before.isBought) await toggleShoppingItemAction(before.id, true).catch(() => null);
          },
        });
      return true;
    } catch {
      setFormError("Failed to add item");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Writes an edited item into the list; a new category moves the row to another group.
  function replaceShop(to: ShoppingItemData) {
    const write = () => setShoppingList((prev) => prev.map((i) => (i.id === to.id ? { ...to, isBought: i.isBought } : i)));
    const from = latestShop.current.find((i) => i.id === to.id);
    if (!from || from.category === to.category) write();
    else void moveItems([from], to.category, write);
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
      later(() => replaceShop(item));
      setIsShopModalOpen(false);
      showToast({
        message: `Saved "${item.name}"`,
        type: "success",
        actionLabel: "Undo",
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onAction: async () => {
          runAfterClose(); // the edit first, if the form is still closing
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

  function openCategoryForm(from: string | null) {
    runAfterClose(); // reopened before the last close finished
    setCatError("");
    setCatEdit({ from });
    setCatOpen(true);
    setCatName(from ?? "");
  }

  async function handleCategorySubmit(e: React.FormEvent) {
    e.preventDefault();
    const from = catEdit.from;
    const to = catName.trim().toLowerCase();
    if (!to) return;
    if (to === from) return setCatOpen(false);
    if (to === "other") return setCatError('Please pick a name other than "other".');
    setCatError("");
    setBusy(true);
    try {
      if (from === null) {
        if (!(await addShoppingCategoryAction({ name: to })).success) return setCatError(`"${to}" already exists.`);
        later(() => {
          void enter(catKey(to));
          setCategories((prev) => [...prev, to]);
        });
        showToast({ message: `Added "${to}"`, type: "success" });
      } else {
        if (!(await renameShoppingCategoryAction({ from, to })).success) throw new Error("Category not found");
        later(() => {
          const items = latestShop.current.filter((i) => i.category === from);
          // A name already in the list merges the groups; a new one relabels the group in place (it keeps its key).
          if (latestShop.current.some((i) => i.category === to)) void moveItems(items, to);
          else setShoppingList((prev) => prev.map((i) => (i.category === from ? { ...i, category: to } : i)));
          if (categories.includes(to)) return leave(catKey(from), () => setCategories((prev) => prev.filter((c) => c !== from)));
          catKeys.current.set(to, catKey(from));
          catKeys.current.delete(from);
          move(catKey(to), () => setCategories((prev) => prev.map((c) => (c === from ? to : c))));
        });
        showToast({ message: `Renamed "${from}" to "${to}"`, type: "success" });
      }
      setCatOpen(false);
    } catch {
      setCatError("Failed to save category");
    } finally {
      setBusy(false);
    }
  }

  // Like a row delete: the row leaves and the toast shows at once, its items move to Other alongside, and a
  // failed delete puts both back. No Undo: the server merges its items into Other, so a restore could not tell them apart.
  function handleDeleteCategory(name: string) {
    const at = categories.indexOf(name);
    const items = latestShop.current.filter((i) => i.category === name);
    const deleted = deleteShoppingCategoryAction({ name }).then((r) => r.success, () => false);
    const gone = new Promise<void>((done) =>
      leave(catKey(name), () => {
        setCategories((prev) => prev.filter((c) => c !== name));
        done();
      }),
    );
    const moved = moveItems(items, "other");
    showToast({ message: `Removed "${name}"; its items are in Other` });
    void Promise.all([deleted, gone, moved]).then(([ok]) => {
      if (ok) return;
      void enter(catKey(name));
      setCategories((prev) => (prev.includes(name) ? prev : [...prev.slice(0, at), name, ...prev.slice(at)]));
      void moveItems(items.map((i) => ({ ...i, category: "other" })), name);
      setStatusMessage("Failed to remove category");
    });
  }

  /**
   * Moves items of one category to another on screen: they leave (with their group when it empties), then come in
   * at the new place (as a new group when there is none). `write` makes the change; by default it sets the category.
   */
  function moveItems(items: ShoppingItemData[], to: string, write?: () => void) {
    if (!items.length) return Promise.resolve();
    const ids = new Set(items.map((i) => i.id));
    const keys = (cat: string) => [...new Set(items.map((i) => shopKey(i.id, cat, ids)))];
    return Promise.all(keys(items[0].category).map((key) => new Promise<void>((done) => leave(key, done)))).then(() => {
      keys(to).forEach((key) => void enter(key));
      if (write) write();
      else setShoppingList((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, category: to } : i)));
    });
  }

  // No toast: ticking again is its own undo (as on Tasks); a refused save unticks it again.
  function handleToggleShopping(itemId: string, currentState: boolean) {
    const setBought = (isBought: boolean) =>
      setShoppingList((prev) => prev.map((item) => (item.id === itemId ? { ...item, isBought } : item)));
    setBought(!currentState);
    toggleShoppingItemAction(itemId, !currentState).catch(() => {
      setBought(currentState);
      setStatusMessage("Failed to update item");
    });
  }

  function handleDeleteShoppingItem(item: ShoppingItemData) {
    // The row leaves at once; the server delete runs alongside, so the tap never waits on the network.
    const deleted = deleteShoppingItemAction(item.id).then(
      () => true,
      () => false,
    );
    // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
    const gone = new Promise<void>((done) =>
      leave(shopKey(item.id, item.category), () => {
        setShoppingList((prev) => prev.filter((i) => i.id !== item.id));
        done();
      }),
    );
    const putBack = (back: ShoppingItemData) => {
      enter(shopKey(back.id, back.category));
      setShoppingList((prev) => [...prev, back]);
    };
    showToast({
      message: `Removed "${item.name}"`,
      actionLabel: "Undo",
      onAction: async () => {
        await gone;
        if (!(await deleted)) return; // the failure path below puts it back
        const res = await addShoppingItemAction(toShopInput(item)).catch(() => null);
        if (!res?.item) return setStatusMessage("Failed to restore item");
        const restored = res.item as ShoppingItemData;
        const bought = item.isBought && (await toggleShoppingItemAction(restored.id, true).then(() => true, () => false));
        putBack({ ...restored, isBought: bought });
        if (item.isBought && !bought) setStatusMessage("Failed to mark item as bought");
      },
    });
    void Promise.all([deleted, gone]).then(([ok]) => {
      if (ok) return;
      putBack(item);
      setStatusMessage("Failed to remove item");
    });
  }

  // Like a delete: the rows leave and the toast shows at once; a failed clear puts them back.
  function handleClearBought() {
    const cleared = shoppingList.filter((i) => i.isBought);
    if (!cleared.length) return;
    const ids = new Set(cleared.map((c) => c.id));
    // A group left with no items leaves as a whole.
    const keyOf = new Map(cleared.map((c) => [c.id, shopKey(c.id, c.category, ids)]));
    const keys = [...new Set(keyOf.values())];
    const done = clearBoughtItemsAction().then(() => true, () => false);
    const drop = () =>
      Promise.all(
        keys.map(
          (key) => new Promise<void>((res) => leave(key, () => {
            setShoppingList((prev) => prev.filter((i) => keyOf.get(i.id) !== key));
            res();
          })),
        ),
      );
    const gone = drop();
    const putBack = () => {
      keys.forEach((key) => enter(key));
      setShoppingList((prev) => [...prev.filter((i) => !ids.has(i.id)), ...cleared]);
    };
    showToast({
      message: `Cleared ${cleared.length} bought item${cleared.length === 1 ? "" : "s"}`,
      actionLabel: "Undo",
      onAction: async () => {
        await gone;
        putBack();
        if (!(await done)) return; // the clear never happened
        const back = await restoreShoppingItemsAction({ itemIds: [...ids] }).catch(() => null);
        if (!back?.success) {
          void drop();
          setStatusMessage("Failed to restore items");
        }
      },
    });
    void Promise.all([done, gone]).then(([ok]) => {
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
      if (meals.length) rememberFoods(meals);
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
  const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);
  // Walking order, unknown categories after the user's own, "other" last.
  const shopCategories = [...new Set([...categories, ...shoppingList.map((i) => i.category).filter((c) => c !== "other"), "other"])].filter(
    (c) => shoppingList.some((i) => i.category === c),
  );
  const categoryOptions = [...new Set([...categories, shopCategory, "other"])];
  const loggedNames = new Set(summary.meals.map((m) => m.name.toLowerCase()));
  const notLoggedFoods = pastFoods.filter((f) => !loggedNames.has(f.name.toLowerCase()));
  const [shownMeals, moreMeals] = useMore(day.meals);
  const [shownShopping, moreShopping] = useMore(shopCategories.flatMap((c) => shoppingList.filter((i) => i.category === c)));
  const [shownCategories, moreCategories] = useMore(categories);
  const [shownPastFoods, morePastFoods] = useMore(notLoggedFoods);

  return (
    <main>
      <Navigation userName={userName} />

      <div className="toolbar">
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
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "water" && <MetricPanel kind="water" onToday={(v) => setMetric("waterMl", v)} />}
      {activeTab === "weight" && <WeightPanel />}
      {activeTab === "steps" && <MetricPanel kind="steps" onToday={(v) => setMetric("steps", v)} />}

      {activeTab === "daily" && (
        <>
        <div className="toolbar dash day-toolbar">
          <div className="month-selector" role="group" aria-label="Day">
            <button
              type="button"
              className="month-nav-btn"
              onClick={() => goToDay(addDays(selectedDate, -1))}
              aria-label="Previous day"
            >
              <ChevronLeftIcon size={17} />
            </button>
            <DatePicker
              mode="day"
              value={selectedDate}
              today={todayDate}
              max={todayDate}
              label={selectedDate === todayDate ? "Today" : dayLabel(selectedDate)}
              onChange={goToDay}
            />
            <button
              type="button"
              className="month-nav-btn"
              onClick={() => goToDay(addDays(selectedDate, 1))}
              disabled={selectedDate >= todayDate}
              aria-label="Next day"
            >
              <ChevronRightIcon size={17} />
            </button>
          </div>
        </div>
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <section className="surface" aria-labelledby="macros-title">
              <div className="section-head">
                <h2 id="macros-title" className="section-title">
                  Nutrition
                </h2>
                {!isPast && (
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={openGoals}
                  aria-label="Edit nutrition goals"
                  title="Edit"
                >
                  <PencilIcon size={17} />
                </button>
                )}
              </div>
              <div className="macro-grid">
                {macros.map((m) => (
                  <div key={m.label} className="macro-card">
                    <span className="macro-title">{m.label}</span>
                    <span className="macro-numbers">
                      <AnimatedNumber value={m.value} format={oneDecimal} />
                      <span className="macro-target">
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

            <section className="surface" aria-labelledby="meals-title">
              <div className="section-head">
                <div>
                  <h2 id="meals-title" className="section-title">
                    Meals <span className="muted number-tabular">{day.meals.length}</span>
                  </h2>
                  <p className="card-sub muted number-tabular">{formatDMY(day.date)}</p>
                </div>
                {!isPast && (
                  <span className="head-actions below">
                    <button type="button" className="btn-sm tint" onClick={() => setIsPastOpen(true)}>
                      Past foods
                    </button>
                    <button type="button" className="btn-sm tint" onClick={() => (runAfterClose(), setFormError(""), setIsMealModalOpen(true))}>
                      <PlusIcon size={14} />
                      Add meal
                    </button>
                  </span>
                )}
              </div>

              {isPast && (
                <p className="readonly-note">
                  <LockIcon size={13} /> Past days are read-only
                </p>
              )}

              <AutoHeight wash className="entries">
                {day.meals.length === 0 ? (
                  <p key="empty" ref={rowRef("empty")} className="empty-note">
                    {isPast ? "No meals were logged this day." : "No meals logged today."}
                  </p>
                ) : (
                  // Keyed by the day so the rows replay their entrance when it changes.
                  <Fragment key={day.date}>
                  {shownMeals.map((meal) => (
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
                      {!isPast && (
                        <button
                          type="button"
                          className="delete-icon-btn"
                          onClick={() => handleDeleteMeal(meal)}
                          aria-label={`Delete meal ${meal.name}`}
                          title="Delete"
                        >
                          <TrashIcon size={17} />
                        </button>
                      )}
                    </div>
                  ))}
                  {moreMeals}
                  </Fragment>
                )}
              </AutoHeight>
            </section>
          </div>

          <div className="dashboard-aside">
            <section className="surface" aria-labelledby="water-title">
              <div className="section-head">
                <h2 id="water-title" className="section-title icon-title">
                  <DropIcon size={18} /> Water
                </h2>
                {!isPast && (
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={() => openMetricEdit("water")}
                  aria-label="Edit water and goal"
                  title="Edit"
                >
                  <PencilIcon size={17} />
                </button>
                )}
              </div>
              <p className="metric-big number-tabular">
                <AnimatedNumber value={day.metrics.waterMl} />
                <span className="macro-target"> / {goals.waterMl} ml</span>
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${waterPct}%` }} />
              </div>
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
            </section>

            <section className="surface" aria-labelledby="weight-trend-title">
              <div className="section-head">
                <h2 id="weight-trend-title" className="section-title icon-title">
                  <ScaleIcon size={18} /> Weight
                </h2>
              </div>
              <p className="metric-big number-tabular">
                {shownWeight === null ? "—" : (
                  <AnimatedNumber value={shownWeight} format={(n) => String(Math.round(n * 100) / 100)} />
                )}
                <span className="macro-target"> kg{weightAnalytics.sevenDayAverage ? ", 7-day average" : ""}</span>
              </p>
              {weightAnalytics.sinceLastWeek !== null && (
                <p className="card-sub muted number-tabular">{signedKg(weightAnalytics.sinceLastWeek)} since last week</p>
              )}
            </section>

            <section className="surface" aria-labelledby="steps-title">
              <div className="section-head">
                <h2 id="steps-title" className="section-title icon-title">
                  <FootstepsIcon size={18} /> Steps
                </h2>
                {!isPast && (
                <button
                  type="button"
                  className="delete-icon-btn edit"
                  onClick={() => openMetricEdit("steps")}
                  aria-label="Edit steps and goal"
                  title="Edit"
                >
                  <PencilIcon size={17} />
                </button>
                )}
              </div>
              <p className="metric-big number-tabular">
                <AnimatedNumber value={day.metrics.steps} />
                <span className="macro-target"> / {goals.steps}</span>
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${stepsPct}%` }} />
              </div>
            </section>
          </div>
        </div>
        </>
      )}

      {activeTab === "shopping" && (
        <div className="dashboard-grid">
        <section className="surface" aria-labelledby="shopping-title">
          <div className="section-head">
            <h2 id="shopping-title" className="section-title">
              Shopping list <span className="muted number-tabular">{shoppingList.length}</span>
            </h2>
            <span className="head-actions below">
              <button
                type="button"
                className="btn-sm tint"
                disabled={shoppingList.every((i) => !i.isBought)}
                onClick={handleClearBought}
              >
                Clear bought
              </button>
              <button type="button" className="btn-sm tint" onClick={() => openShopForm(null)}>
                <PlusIcon size={14} />
                Add item
              </button>
            </span>
          </div>

          <AutoHeight className="shopping-groups">
          {shoppingList.length === 0 && (
            <p key="empty" ref={rowRef("empty")} className="empty-note">
              Your shopping list is empty.
            </p>
          )}
          {shopCategories.filter((c) => shownShopping.some((i) => i.category === c)).map((cat) => (
            <div key={catKey(cat)} ref={rowRef(groupKey(cat))} className="shopping-group">
              <h3 className="group-label">{cat}</h3>
              {shownShopping
                .filter((item) => item.category === cat)
                .map((item) => (
                  <div key={item.id} ref={rowRef(item.id)} className="shopping-row">
                    <div className={`shopping-item-name ${item.isBought ? "bought" : ""}`}>
                      <button
                        type="button"
                        className={`todo-checkbox-btn ${item.isBought ? "checked" : ""}`}
                        onClick={() => handleToggleShopping(item.id, item.isBought)}
                        aria-label={`Mark ${item.name} as ${item.isBought ? "not bought" : "bought"}`}
                      >
                        {item.isBought && <CheckIcon size={12} strokeWidth={3} />}
                      </button>
                      <span>
                        {item.name} · {Number(item.amount)} {item.unit}
                      </span>
                    </div>
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
          {moreShopping}
          </AutoHeight>
        </section>

        <section className="surface" aria-labelledby="categories-title">
          <div className="section-head">
            <h2 id="categories-title" className="section-title">
              Categories <span className="muted number-tabular">{categories.length}</span>
            </h2>
            <button type="button" className="btn-sm tint" onClick={() => openCategoryForm(null)}>
              <PlusIcon size={14} />
              Add category
            </button>
          </div>
          <AutoHeight wash className="entries">
          {categories.length === 0 && (
            <p key="cat-empty" ref={rowRef("cat:empty")} className="empty-note">No categories yet.</p>
          )}
          {shownCategories.map((cat) => (
            <div key={catKey(cat)} ref={rowRef(catKey(cat))} className="entry-row">
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
                <button
                  type="button"
                  className="delete-icon-btn"
                  onClick={() => handleDeleteCategory(cat)}
                  aria-label={`Delete category ${cat}`}
                  title="Delete"
                >
                  <TrashIcon size={17} />
                </button>
              </div>
            </div>
          ))}
          {moreCategories}
          </AutoHeight>
        </section>
        </div>
      )}

      {isClaudeEnabled() && activeTab === "chat" && (
        <section className="surface" aria-labelledby="chat-title">
          <div className="section-head">
            <h2 id="chat-title" className="section-title">
              Food assistant
            </h2>
          </div>

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
        </section>
      )}

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        onExited={runAfterClose}
        title="New meal"
      >
        <form onSubmit={handleLogMeal}>
          <div className="form-stack">
          <label>
            Name
            <input
              type="text"
              disabled={busy}
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
                inputMode="numeric"
                disabled={busy}
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
                inputMode="decimal"
                disabled={busy}
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
                inputMode="decimal"
                disabled={busy}
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
                inputMode="decimal"
                disabled={busy}
                value={mealFat}
                onChange={(e) => setMealFat(e.target.value)}
                className="number-tabular"
              />
            </label>
          </div>

          {formError && <p className="error" role="alert">{formError}</p>}
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsMealModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !mealName.trim()}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isShopModalOpen}
        onClose={() => setIsShopModalOpen(false)}
        onExited={runAfterClose}
        title={editingShop ? "Edit shopping item" : "New shopping item"}
      >
        <form onSubmit={handleShopSubmit}>
          <div className="form-stack">
            <label>
              Name
              <input
                type="text"
                disabled={busy}
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
                  inputMode="decimal"
                  disabled={busy}
                value={shopAmount}
                  onChange={(e) => setShopAmount(e.target.value)}
                />
              </label>
              <label>
                Unit
                <select disabled={busy} value={shopUnit} onChange={(e) => setShopUnit(e.target.value)}>
                  {/* An older item with a typed-in unit keeps it as an option. */}
                  {(UNITS.includes(shopUnit) ? UNITS : [shopUnit, ...UNITS]).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Category
              <select disabled={busy} value={shopCategory} onChange={(e) => setShopCategory(e.target.value)}>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {formError && <p className="error" role="alert">{formError}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setIsShopModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !shopName.trim()}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isPastOpen} onClose={() => setIsPastOpen(false)} title="Past foods">
        <div className="form-stack">
          <AutoHeight wash className="entries">
            {notLoggedFoods.length === 0 ? (
              <p key="empty" ref={rowRef("past:empty")} className="empty-note">Everything you logged before is already in today.</p>
            ) : (
              shownPastFoods.map((f) => (
                <div key={f.name} ref={rowRef(`past:${f.name}`)} className="entry-row">
                  <div>
                    <strong>{f.name}</strong>
                    <p className="card-sub muted number-tabular">
                      {f.calories} kcal · {Number(f.protein)}g P · {Number(f.carbs)}g C · {Number(f.fat)}g F
                    </p>
                  </div>
                  <button
                    type="button"
                    className="delete-icon-btn edit"
                    disabled={busy}
                    onClick={() => handleLogPastFood(f)}
                    aria-label={`Log ${f.name}, ${f.calories} kcal`}
                    title="Log"
                  >
                    <PlusIcon size={17} />
                  </button>
                </div>
              ))
            )}
            {morePastFoods}
          </AutoHeight>
        </div>
      </Modal>

      <Modal
        isOpen={catOpen}
        onClose={() => setCatOpen(false)}
        onExited={runAfterClose}
        title={catEdit.from ? "Edit category" : "New category"}
      >
        <form onSubmit={handleCategorySubmit}>
          <div className="form-stack">
            <label>
              Name
              <input
                type="text"
                maxLength={50}
                disabled={busy}
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
              />
            </label>
            {catEdit.from && (
              <p className="muted move-hint">Its items move along. An existing name merges the two.</p>
            )}
            {catError && <p className="error" role="alert">{catError}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setCatOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !catName.trim()}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={metricOpen}
        onClose={() => setMetricOpen(false)}
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
                disabled={busy}
                value={metricInput}
                onChange={(e) => setMetricInput(e.target.value)}
              />
            </label>
            <label>
              {metricEdit === "water" ? "Daily goal (ml)" : "Daily goal (steps)"}
              <input
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
            </label>
            {formError && <p className="error" role="alert">{formError}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setMetricOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || metricInput === "" || metricGoalInput === ""}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={goalsOpen} onClose={() => setGoalsOpen(false)} title="Edit goals">
        <form onSubmit={handleGoalsSubmit}>
          <div className="form-stack">
            {NUTRITION_GOALS.map((g) => (
              <label key={g.key}>
                {g.label}
                <input
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
              </label>
            ))}
            {formError && <p className="error" role="alert">{formError}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setGoalsOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || Object.values(goalInputs).some((v) => v === "")}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
