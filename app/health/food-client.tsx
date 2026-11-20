"use client";

import { useRef, useState } from "react";
import { appTime } from "@/lib/format-date";
import { formatNumber } from "@/lib/number-format";
import { visible } from "@/lib/validations/common";
import { MAX_STEPS, MAX_WATER_ML, mealHasValue } from "@/lib/validations/food";
import { AddButton, BigNumber, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FieldPair, FormModal, Page, ProgressBar, SmallButton, Toolbar } from "../components/blocks";
import { AnimatedNumber } from "../components/animated-number";
import { Segmented } from "../components/segmented";
import { isClaudeEnabled } from "@/lib/features";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { useDeviceState } from "../components/device-state";
import { WeightCard, type WeightEntry } from "./weight-card";
import { ShoppingTab, type ShoppingItemData } from "./shopping-tab";
import { DeleteButton, EditButton, ListBox, useMoreDialog } from "../components/lists";
import { formatAmount } from "./amount";
import {
  setWaterAction,
  deleteMealAction,
  restoreMealAction,
  logMealAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/actions/food";
import { sendFoodChatMessageAction } from "@/actions/food-chat";

interface MealData {
  id: string;
  date: string;
  name: string;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  isEstimated?: boolean;
  createdAt?: Date | string;
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
  /** The last 365 days of weigh-ins (the database keeps all of them). */
  initialWeights: WeightEntry[];
  /** Water and steps of the last 7 days (today included), for the 7-day average. */
  weekMetrics: { date: string; waterMl: number; steps: number }[];
  initialShoppingList: ShoppingItemData[];
  /** The user's store sections in walking order, without the built-in "other". */
  shoppingCategories: string[];
  /** The user's units in order, without the built-in "pcs". */
  shoppingUnits: string[];
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
// The most one day's total can hold: the same limits as setWaterAction and updateStepsAction.
const METRIC_MAX = { water: MAX_WATER_ML, steps: MAX_STEPS };
const METRIC_GOAL = { water: { min: 500, max: 15000 }, steps: { min: 1000, max: MAX_STEPS } };
const METRIC_KEY = { water: "waterMl", steps: "steps" } as const;
type Metric = keyof typeof METRIC_KEY;
/** What the water or steps dialog changed: only these are sent, and its Undo sends back only these. */
type MetricChange = { amount?: number; goal?: number };

// The open tab is kept on this device (D-041); a stored tab the page does not have shows Today.
const TAB_KEY = "lt-health-tab";
const FIRST_TAB: string = "daily";

/** A meal's own name for its buttons: the manual form names every meal "Meal", so the time and calories tell them apart. */
function mealLabel(meal: MealData) {
  const name = visible(meal.name) ? meal.name : "Meal";
  const time = meal.createdAt ? ` of ${appTime(new Date(meal.createdAt))}` : "";
  return `${name}${time}, ${formatNumber(meal.calories)} kcal`;
}

export function FoodClient({
  userName,
  todayDate,
  targets,
  initialSummary,
  initialWeights,
  weekMetrics,
  initialShoppingList,
  shoppingCategories: initialCategories,
  shoppingUnits: initialUnits,
}: FoodClientProps) {
  // The day and its data come from the server: a refresh (after a write, on focus, at midnight) brings the new ones.
  const [summary, setSummary] = useServerState(initialSummary);
  const [goals, setGoals] = useServerState(targets);
  const [storedTab, setActiveTab] = useDeviceState(TAB_KEY, FIRST_TAB);
  const activeTab = storedTab === "shopping" || (storedTab === "chat" && isClaudeEnabled()) ? storedTab : "daily";
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  // The open meal or shopping form's error; only one form is open at a time.
  const [errorMsg, setErrorMsg] = useState("");
  const [metricEdit, setMetricEdit] = useState<Metric>("water");
  const [metricOpen, setMetricOpen] = useState(false);
  const [metricInput, setMetricInput] = useState("");
  const [metricGoalInput, setMetricGoalInput] = useState("");
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<NutritionGoal, string>>({ calories: "", proteinGrams: "", carbsGrams: "", fatGrams: "" });
  const { showToast } = useToast();
  // A tap that writes acts once per tap burst (D-043): one water write at a time, one delete per meal. Forms get the
  // same from FormModal.
  const once = useOnce();
  // The button last tapped, set before its own handler runs.
  const tappedButton = useRef<Element | null>(null);
  const noteTap = (e: React.MouseEvent) => (tappedButton.current = (e.target as Element).closest("button"));

  // In-app Food AI Chat state
  const [chatMessages, setChatMessages] = useState<
    Array<{
      role: "user" | "assistant";
      text: string;
      meals?: MealData[];
    }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Meal input state: machine numbers ("12.5") from the number fields.
  const [mealCalories, setMealCalories] = useState("");
  const [mealProtein, setMealProtein] = useState("");
  const [mealCarbs, setMealCarbs] = useState("");
  const [mealFat, setMealFat] = useState("");
  const entered = {
    calories: Number(mealCalories) || 0,
    protein: Number(mealProtein) || 0,
    carbs: Number(mealCarbs) || 0,
    fat: Number(mealFat) || 0,
  };

  const setStatusMessage = (message: string) => {
    if (message) showToast({ message, type: "warning" });
  };

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const mealKeys = (meals: MealData[]) => meals.map((m) => `meals:${m.id}`);

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

  /** Undo of a log: the meals leave the day at once; one the server refuses to delete comes back. `removed` gets the ids that went. */
  const undoLogged = (logged: MealData[], removed?: (ids: Set<string>) => void) =>
    undoWith(showToast, async () => {
      logged.forEach((m) => applyMeal(m, -1));
      const results = await Promise.all(logged.map((m) => deleteMealAction(m.id).then((r) => r.success, () => false)));
      logged.filter((_, i) => !results[i]).forEach((m) => applyMeal(m, 1));
      removed?.(new Set(logged.filter((_, i) => results[i]).map((m) => m.id)));
      return results.every(Boolean);
    });

  /** Delete from the list: the meal leaves the day at once; Undo puts the same meal back under its old id and time. */
  function handleDeleteMeal(meal: MealData) {
    applyMeal(meal, -1);
    const saved = deleteMealAction(meal.id).catch(() => null);
    void saved.then((res) => {
      if (res?.success) return;
      applyMeal(meal, 1);
      showToast({ message: res?.error ?? "Failed to remove meal", type: "warning" });
    });
    showToast({
      message: `Removed "${meal.name}"`,
      type: "success",
      touches: mealKeys([meal]),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)?.success) return true; // the delete never happened
          const back = await restoreMealAction({
            id: meal.id,
            date: meal.date,
            name: meal.name,
            calories: meal.calories,
            protein: parseFloat(meal.protein),
            carbs: parseFloat(meal.carbs),
            fat: parseFloat(meal.fat),
            isEstimated: meal.isEstimated ?? false,
            createdAt: meal.createdAt ? new Date(meal.createdAt).toISOString() : undefined,
          }).catch(() => null);
          if (back?.success) applyMeal(meal, 1);
          return back;
        },
        "Failed to restore meal",
      ),
    });
    return saved;
  }

  async function handleLogMeal(e: React.FormEvent) {
    e.preventDefault();
    if (!mealHasValue(entered)) return;
    // Same limits as logMealSchema, said with the field's name.
    if (entered.calories > 10000) return setErrorMsg("Calories must be 10.000 or less.");
    if (Math.max(entered.protein, entered.carbs, entered.fat) > 1000) return setErrorMsg("Protein, carbs and fat must each be 1.000 g or less.");

    setErrorMsg("");
    // The id is made here, so a repeat of the same save after a lost answer adds nothing (D-040).
    const saved = logMealAction({ id: crypto.randomUUID(), date: todayDate, ...entered }).catch(() => null);
    const res = await saved;
    if (!res?.success) return setErrorMsg(res?.error ?? "Failed to add meal");
    if (!res.meal) return setErrorMsg("Failed to add meal");
    const meal = res.meal as MealData;
    applyMeal(meal, 1);
    setMealCalories("");
    setMealProtein("");
    setMealCarbs("");
    setMealFat("");
    setIsMealModalOpen(false);
    showToast({
      message: `Added meal (${formatNumber(meal.calories)} kcal)`,
      type: "success",
      touches: mealKeys([meal]),
      saved,
      onUndo: undoLogged([meal]),
    });
  }

  const setMetric = (key: "waterMl" | "steps", value: number) =>
    setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));
  const putGoals = (patch: Partial<Goals>) => setGoals((prev) => ({ ...prev, ...patch }));
  // The rows a water or steps change touches: the day's amount and the goal's column of the one targets row.
  const metricKeys = (metric: Metric, change: MetricChange) => [
    ...(change.amount === undefined ? [] : [`daily_metrics:${todayDate}:${METRIC_KEY[metric]}`]),
    ...(change.goal === undefined ? [] : [`nutrition_targets:${METRIC_KEY[metric]}`]),
  ];
  // Sends only what changed; the server writes both or neither.
  const writeMetric = (metric: Metric, change: MetricChange) => {
    const goal = change.goal === undefined ? {} : { goal: change.goal };
    return (
      metric === "water"
        ? setWaterAction({ date: todayDate, ...(change.amount === undefined ? {} : { waterMl: change.amount }), ...goal })
        : updateStepsAction({ date: todayDate, ...(change.amount === undefined ? {} : { steps: change.amount }), ...goal })
    ).catch(() => null);
  };
  // Puts on the screen what the server saved.
  const showSaved = (metric: Metric, res: Awaited<ReturnType<typeof writeMetric>>) => {
    if (!res?.success) return;
    const key = METRIC_KEY[metric];
    if (res.metrics) setMetric(key, res.metrics[key]);
    if (res.targets) putGoals({ [key]: res.targets[key] });
  };
  // What the screen shows for a change: the amount and goal it sets.
  const showChange = (metric: Metric, change: MetricChange) => {
    const key = METRIC_KEY[metric];
    if (change.amount !== undefined) setMetric(key, change.amount);
    if (change.goal !== undefined) putGoals({ [key]: change.goal });
  };

  // A tap sets the day's new total at once and shows its toast; a refused save puts the old total back. The total, not
  // the amount added, is sent, so a repeat of the same request changes nothing.
  function addWater(tap: number) {
    const previous = summary.metrics.waterMl;
    const total = Math.min(previous + tap, MAX_WATER_ML);
    if (total === previous) {
      showToast({ message: `Water is already at the ${formatNumber(MAX_WATER_ML)} ml limit`, type: "warning" });
      return;
    }
    setMetric("waterMl", total);
    const saved = writeMetric("water", { amount: total });
    void saved.then((res) => {
      if (res?.success) return;
      setSummary((prev) => (prev.metrics.waterMl === total ? { ...prev, metrics: { ...prev.metrics, waterMl: previous } } : prev));
      showToast({ message: res?.error ?? "Failed to add water", type: "warning" });
    });
    showToast({
      message: `Added ${formatNumber(total - previous)} ml`,
      type: "success",
      touches: metricKeys("water", { amount: total }),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          if (!(await saved)?.success) return true; // the add never happened
          setMetric("waterMl", previous);
          const back = await writeMetric("water", { amount: previous });
          if (back?.success) showSaved("water", back);
          else setMetric("waterMl", total);
          return back;
        },
        "Failed to undo the edit",
      ),
    });
    return saved;
  }

  function openMetricEdit(metric: Metric) {
    setErrorMsg("");
    setMetricInput(String(summary.metrics[METRIC_KEY[metric]]));
    setMetricGoalInput(String(goals[METRIC_KEY[metric]]));
    setMetricEdit(metric);
    setMetricOpen(true);
  }

  async function handleMetricSubmit(e: React.FormEvent) {
    e.preventDefault();
    const metric = metricEdit;
    const key = METRIC_KEY[metric];
    const value = Number(metricInput);
    const goal = Number(metricGoalInput);
    const range = METRIC_GOAL[metric];
    if (!Number.isInteger(value) || value < 0) return setErrorMsg("Please enter a whole number.");
    if (value > METRIC_MAX[metric]) return setErrorMsg(`The total must be ${formatNumber(METRIC_MAX[metric])} or less.`);
    if (!Number.isInteger(goal) || goal < range.min || goal > range.max)
      return setErrorMsg(`The goal must be between ${formatNumber(range.min)} and ${formatNumber(range.max)}.`);
    const before = { amount: summary.metrics[key], goal: goals[key] };
    const change: MetricChange = {
      ...(value === before.amount ? {} : { amount: value }),
      ...(goal === before.goal ? {} : { goal }),
    };
    if (change.amount === undefined && change.goal === undefined) return setMetricOpen(false);
    const undo: MetricChange = {
      ...(change.amount === undefined ? {} : { amount: before.amount }),
      ...(change.goal === undefined ? {} : { goal: before.goal }),
    };
    setErrorMsg("");
    const saved = writeMetric(metric, change);
    const res = await saved;
    if (!res?.success) return setErrorMsg(res?.error ?? `Failed to save ${metric}`);
    showSaved(metric, res);
    setMetricOpen(false);
    const name = metric === "water" ? "Water" : "Steps";
    const unit = metric === "water" ? " ml" : "";
    const amount = `${formatNumber(value)}${unit}`;
    const target = `${formatNumber(goal)}${unit}`;
    showToast({
      message:
        change.goal === undefined ? `${name} set to ${amount}` : change.amount === undefined ? `${name} goal set to ${target}` : `${name} set to ${amount}, goal ${target}`,
      type: "success",
      touches: metricKeys(metric, change),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          showChange(metric, undo);
          const back = await writeMetric(metric, undo);
          if (back?.success) showSaved(metric, back);
          else showChange(metric, change);
          return back;
        },
        "Failed to undo the edit",
      ),
    });
  }

  function openGoals() {
    setErrorMsg("");
    setGoalInputs(Object.fromEntries(NUTRITION_GOALS.map((g) => [g.key, String(goals[g.key])])) as Record<NutritionGoal, string>);
    setGoalsOpen(true);
  }

  async function handleGoalsSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = Object.fromEntries(NUTRITION_GOALS.map((g) => [g.key, Number(goalInputs[g.key])])) as Record<NutritionGoal, number>;
    const bad = NUTRITION_GOALS.find((g) => !Number.isInteger(next[g.key]) || next[g.key] < g.min || next[g.key] > g.max);
    if (bad) return setErrorMsg(`${bad.label.split(" ")[0]} must be between ${formatNumber(bad.min)} and ${formatNumber(bad.max)}.`);
    // Only the goals this edit changed are sent, so an older tab never writes back goals it did not touch (D-040).
    const changed = NUTRITION_GOALS.filter((g) => next[g.key] !== goals[g.key]).map((g) => g.key);
    if (changed.length === 0) return setGoalsOpen(false);
    const patch: Partial<Goals> = Object.fromEntries(changed.map((key) => [key, next[key]]));
    const previous: Partial<Goals> = Object.fromEntries(changed.map((key) => [key, goals[key]]));
    setErrorMsg("");
    const saved = updateTargetsAction(patch).catch(() => null);
    const res = await saved;
    if (!res?.success) return setErrorMsg(res?.error ?? "Failed to save goals");
    putGoals(patch);
    setGoalsOpen(false);
    showToast({
      message: "Saved nutrition goals",
      type: "success",
      touches: changed.map((key) => `nutrition_targets:${key}`),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          putGoals(previous);
          const back = await updateTargetsAction(previous).catch(() => null);
          if (!back?.success) putGoals(patch);
          return back;
        },
        "Failed to undo the edit",
      ),
    });
  }

  async function handleSendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg = { role: "user" as const, text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    // Take the message back so it can be sent again.
    const takeBack = (message: string) => {
      setChatMessages((prev) => prev.filter((m) => m !== userMsg));
      setChatInput(text);
      setStatusMessage(message);
    };

    try {
      // The server reads only the last 10 turns and rejects more than 20.
      const history = chatMessages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const res = await sendFoodChatMessageAction({
        message: text,
        history,
        date: todayDate,
        time: appTime(),
      });
      if (!res.success) return takeBack(res.error);
      const meals = res.meals.filter((m) => m !== null) as MealData[];
      setChatMessages((prev) => [...prev, { role: "assistant", text: res.reply, meals }]);
      if (res.freshSummary) setSummary(res.freshSummary);
      if (meals.length) {
        showToast({
          message: `Logged ${meals.length} meal${meals.length === 1 ? "" : "s"}`,
          type: "success",
          touches: mealKeys(meals),
          onUndo: undoLogged(meals, (removed) =>
            setChatMessages((prev) => prev.map((m) => (m.meals ? { ...m, meals: m.meals.filter((x) => !removed.has(x.id)) } : m))),
          ),
        });
      }
    } catch {
      takeBack("Failed to send message");
    } finally {
      setChatLoading(false);
    }
  }

  // A meal is its name over two lines of numbers: the calories and protein, then the carbs and fat (D-029).
  const mealRow = (meal: MealData) => (
    <div key={meal.id} className="entry-row" onClickCapture={noteTap}>
      <span className="entry-main entry-stack">
        <span>{visible(meal.name) ? meal.name : "Meal"}</span>
        <span className="muted number-tabular">
          {formatNumber(meal.calories)} kcal · P {formatAmount(meal.protein, 1)}
        </span>
        <span className="muted number-tabular">
          C {formatAmount(meal.carbs, 1)} · F {formatAmount(meal.fat, 1)}
        </span>
      </span>
      <DeleteButton label={`Delete ${mealLabel(meal)}`} onClick={() => once(`meal:${meal.id}`, () => handleDeleteMeal(meal), tappedButton.current)} />
    </div>
  );
  const [shownMeals, moreMeals, mealsDialog] = useMoreDialog(summary.meals, "Today's meals", mealRow);

  const macros = [
    { label: "Calories", value: summary.totals.calories, target: goals.calories, unit: " kcal" },
    { label: "Protein", value: summary.totals.protein, target: goals.proteinGrams, unit: "g" },
    { label: "Carbs", value: summary.totals.carbs, target: goals.carbsGrams, unit: "g" },
    { label: "Fat", value: summary.totals.fat, target: goals.fatGrams, unit: "g" },
  ];
  // A zero goal (carbs and fat allow it) counts as met once anything is eaten.
  const pct = (value: number, target: number) => (target > 0 ? Math.min(100, Math.round((value / target) * 100)) : value > 0 ? 100 : 0);
  const waterPct = pct(summary.metrics.waterMl, goals.waterMl);
  const stepsPct = pct(summary.metrics.steps, goals.steps);
  // Mean of the logged days of the last 7; today comes from the live total, so a tap shows at once.
  const weekAverage = (key: "waterMl" | "steps") => {
    const logged = [...weekMetrics.filter((m) => m.date !== todayDate).map((m) => m[key]), summary.metrics[key]].filter((v) => v > 0);
    return logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null;
  };
  const average = (key: "waterMl" | "steps", unit: string) => {
    const v = weekAverage(key);
    return `7-day average · ${v === null ? "—" : `${formatNumber(v)}${unit}`}`;
  };
  const waterTap = (ml: number) => (e: React.MouseEvent) => once("water", () => addWater(ml), e.currentTarget);

  return (
    <Page userName={userName}>
      <Toolbar>
        <Segmented
          label="Health sections"
          value={activeTab}
          options={[
            { value: "daily", label: "Today" },
            { value: "shopping", label: "Shopping", short: "Shop" },
            ...(isClaudeEnabled() ? [{ value: "chat", label: "Assistant", short: "AI" }] : []),
          ]}
          onChange={setActiveTab}
        />
      </Toolbar>

      {activeTab === "daily" && (
        <Dashboard>
          <DashboardMain>
            <Card
              id="macros-title"
              title="Nutrition"
              below
              actions={
                <>
                  <SmallButton onClick={openGoals}>Edit goals</SmallButton>
                  <AddButton onClick={() => (setErrorMsg(""), setIsMealModalOpen(true))}>Add meal</AddButton>
                </>
              }
            >
              <div className="macro-grid">
                {macros.map((m) => (
                  <div key={m.label} className="macro-card">
                    <span className="macro-title">{m.label}</span>
                    <span className="macro-numbers">
                      <AnimatedNumber value={m.value} from={m.value} format={(n) => formatNumber(n)} />
                      <span className="macro-target">
                        / {formatNumber(m.target)}
                        {m.unit}
                      </span>
                    </span>
                    <ProgressBar percent={pct(m.value, m.target)} over={m.value > m.target} />
                  </div>
                ))}
              </div>
            </Card>

            <Card id="meals-title" title="Meals" count={summary.meals.length}>
              <ListBox wash className="entries">
                {summary.meals.length === 0 && <EmptyNote>No meals logged today.</EmptyNote>}
                {shownMeals.map(mealRow)}
                {moreMeals}
              </ListBox>
              {mealsDialog}
            </Card>

            <WeightCard today={todayDate} initial={initialWeights} />
          </DashboardMain>

          <DashboardAside>
            <Card
              id="water-title"
              title="Water"
              end={<EditButton label="Edit water and goal" onClick={() => openMetricEdit("water")} />}
            >
              <BigNumber value={formatNumber(summary.metrics.waterMl)} of={`/ ${formatNumber(goals.waterMl)} ml`} />
              <ProgressBar percent={waterPct} />
              <p className="muted metric-avg number-tabular">{average("waterMl", " ml")}</p>
              <div className="tap-buttons">
                <button type="button" className="secondary tap-btn" onClick={waterTap(250)}>
                  +250 ml
                </button>
                <button type="button" className="secondary tap-btn" onClick={waterTap(500)}>
                  +500 ml
                </button>
              </div>
            </Card>

            <Card
              id="steps-title"
              title="Steps"
              end={<EditButton label="Edit steps and goal" onClick={() => openMetricEdit("steps")} />}
            >
              <BigNumber value={formatNumber(summary.metrics.steps)} of={`/ ${formatNumber(goals.steps)}`} />
              <ProgressBar percent={stepsPct} />
              <p className="muted metric-avg number-tabular">{average("steps", "")}</p>
            </Card>
          </DashboardAside>
        </Dashboard>
      )}

      <ShoppingTab active={activeTab === "shopping"} initialItems={initialShoppingList} initialCategories={initialCategories} initialUnits={initialUnits} />

      {isClaudeEnabled() && activeTab === "chat" && (
        <Card id="chat-title" title="Food assistant">
          <div className="chat-log" aria-live="polite">
            {chatMessages.map((msg, index) => (
              <div key={index} className={`chat-msg ${msg.role}`}>
                <div className="chat-bubble">{msg.text}</div>
                {msg.meals?.map((m) => (
                  <div key={m.id} className="chat-tool number-tabular">
                    <strong>Added:</strong> {m.name} · {formatNumber(m.calories)} kcal · {formatAmount(m.protein, 1)}g P ·{" "}
                    {formatAmount(m.carbs, 1)}g C · {formatAmount(m.fat, 1)}g F
                  </div>
                ))}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg assistant">
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
        error={errorMsg}
        canSubmit={mealHasValue(entered)}
      >
        <FieldPair>
          <Field
            label="Calories (kcal)"
            type="number"
            inputMode="numeric"
            value={mealCalories}
            onChange={(e) => setMealCalories(e.target.value)}
            className="number-tabular"
          />
          <Field
            label="Protein (g)"
            type="number"
            inputMode="decimal"
            value={mealProtein}
            onChange={(e) => setMealProtein(e.target.value)}
            className="number-tabular"
          />
        </FieldPair>
        <FieldPair>
          <Field
            label="Carbs (g)"
            type="number"
            inputMode="decimal"
            value={mealCarbs}
            onChange={(e) => setMealCarbs(e.target.value)}
            className="number-tabular"
          />
          <Field
            label="Fat (g)"
            type="number"
            inputMode="decimal"
            value={mealFat}
            onChange={(e) => setMealFat(e.target.value)}
            className="number-tabular"
          />
        </FieldPair>
      </FormModal>

      <FormModal
        isOpen={metricOpen}
        onClose={() => setMetricOpen(false)}
        title={metricEdit === "water" ? "Edit water" : "Edit steps"}
        onSubmit={handleMetricSubmit}
        error={errorMsg}
        canSubmit={metricInput !== "" && metricGoalInput !== ""}
      >
        <Field
          label={metricEdit === "water" ? "Water today (ml)" : "Steps today"}
          type="number"
          inputMode="numeric"
          required
          value={metricInput}
          onChange={(e) => setMetricInput(e.target.value)}
          className="number-tabular"
        />
        <Field
          label={metricEdit === "water" ? "Daily goal (ml)" : "Daily goal (steps)"}
          type="number"
          inputMode="numeric"
          required
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
        error={errorMsg}
        canSubmit={!Object.values(goalInputs).some((v) => v === "")}
      >
        {NUTRITION_GOALS.map((g) => (
          <Field
            key={g.key}
            label={g.label}
            type="number"
            inputMode="numeric"
            required
            value={goalInputs[g.key]}
            onChange={(e) => setGoalInputs((prev) => ({ ...prev, [g.key]: e.target.value }))}
            className="number-tabular"
          />
        ))}
      </FormModal>
    </Page>
  );
}
