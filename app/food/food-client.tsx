"use client";

import { useEffect, useRef, useState } from "react";
import { toISODate } from "@/lib/format-date";
import { visible } from "@/lib/validations/common";
import { MAX_STEPS, MAX_WATER_ML } from "@/lib/validations/food";
import { AddButton, BigNumber, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FieldPair, FormModal, Page, ProgressBar, TintButton, Toolbar } from "../components/blocks";
import { AnimatedNumber } from "../components/animated-number";
import { Segmented } from "../components/segmented";
import { isClaudeEnabled } from "@/lib/features";
import { DropIcon, FootstepsIcon } from "../components/icons";
import { useToast } from "../components/toast";
import { WeightCard, type WeightEntry } from "./weight-card";
import { ShoppingTab, type ShoppingItemData } from "./shopping-tab";
import { DeleteButton, EditButton, ListBox } from "../components/lists";
import {
  addWaterAction,
  setWaterAction,
  deleteMealAction,
  restoreMealAction,
  logMealAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/app/actions/food";
import { sendFoodChatMessageAction } from "@/app/actions/food-chat";

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
  // Writes always go to today. The page knows its day only from when it loaded, so resuming it after midnight reloads it.
  useEffect(() => {
    const onShow = () => {
      if (!document.hidden && toISODate() !== todayDate) location.reload();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [todayDate]);
  const [summary, setSummary] = useState(initialSummary);
  const day = summary;
  const [activeTab, setActiveTab] = useState<"daily" | "shopping" | "chat">("daily");
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
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
  const { showToast } = useToast();

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
  const [mealCalories, setMealCalories] = useState("");
  const [mealProtein, setMealProtein] = useState("");
  const [mealCarbs, setMealCarbs] = useState("");
  const [mealFat, setMealFat] = useState("");
  const mealHasValues = [mealCalories, mealProtein, mealCarbs, mealFat].some((v) => Number(v) > 0);

  const [busy, setBusy] = useState(false);
  const setStatusMessage = (message: string) => {
    if (message) showToast({ message, type: "warning" });
  };

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

  /** Delete from the list: the meal leaves the day at once; Undo puts the same meal back under its old id and time. */
  async function handleDeleteMeal(meal: MealData) {
    applyMeal(meal, -1);
    const gone = await deleteMealAction(meal.id).then((r) => r.success, () => false);
    if (!gone) {
      applyMeal(meal, 1);
      showToast({ message: "Failed to remove meal", type: "warning" });
      return;
    }
    showToast({
      message: `Removed "${meal.name}"`,
      type: "success",
      onUndo: async () => {
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
        }).then((r) => r.success, () => false);
        if (back) applyMeal(meal, 1);
        else showToast({ message: "Failed to restore meal", type: "warning" });
      },
    });
  }

  async function handleLogMeal(e: React.FormEvent) {
    e.preventDefault();
    if (!mealHasValues) return;
    const entered = {
      calories: parseInt(mealCalories, 10) || 0,
      protein: parseFloat(mealProtein) || 0,
      carbs: parseFloat(mealCarbs) || 0,
      fat: parseFloat(mealFat) || 0,
    };
    // Same limits as logMealSchema, so the server never has to refuse with a message the screen cannot show.
    if (entered.calories > 10000) return setFormError("Calories must be 10000 or less.");
    if (Math.max(entered.protein, entered.carbs, entered.fat) > 1000) return setFormError("Protein, carbs and fat must each be 1000 g or less.");

    setBusy(true);
    setFormError("");
    try {
      const res = await logMealAction({ date: todayDate, ...entered });

      if (res.success && res.meal) {
        const meal = res.meal as MealData;
        applyMeal(meal, 1);
        setMealCalories("");
        setMealProtein("");
        setMealCarbs("");
        setMealFat("");
        setIsMealModalOpen(false);
        showToast({
          message: `Added meal (${meal.calories} kcal)`,
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

  const setMetric = (key: "waterMl" | "steps", value: number) =>
    setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));

  // A tap adds at once and shows its toast; a refused save takes the amount back off.
  function addWater(tap: number) {
    // A day holds at most MAX_WATER_ML: the amount sent is the amount added, so Undo takes back exactly that.
    const delta = Math.min(tap, MAX_WATER_ML - summary.metrics.waterMl);
    if (delta <= 0) return showToast({ message: `Water is already at the ${MAX_WATER_ML} ml limit`, type: "warning" });
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
        // Water undoes by the difference, so a tap made since the edit stays; steps have no add, so they go back to the exact value.
        const diff = previous - saved;
        const shift = (d: number) => setSummary((prev) => ({ ...prev, metrics: { ...prev.metrics, waterMl: prev.metrics.waterMl + d } }));
        if (amountChanged) {
          if (metric === "water") shift(diff);
          else setMetric(key, previous);
        }
        if (goalChanged) putGoals({ [key]: previousGoal });
        let failed = false;
        if (amountChanged) {
          const back =
            metric === "water"
              ? await addWaterAction(todayDate, diff).catch(() => null)
              : await updateStepsAction(todayDate, previous).catch(() => null);
          if (back?.success && back.metrics) setMetric(key, back.metrics[key]);
          else {
            if (metric === "water") shift(-diff);
            else setMetric(key, saved);
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
    if (value > METRIC_MAX[metricEdit]) return setFormError(`The total must be ${METRIC_MAX[metricEdit]} or less.`);
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
  // Mean of the logged days of the last 7; today comes from the live total, so a tap shows at once.
  const weekAverage = (key: "waterMl" | "steps") => {
    const logged = [...weekMetrics.filter((m) => m.date !== todayDate).map((m) => m[key]), day.metrics[key]].filter((v) => v > 0);
    return logged.length ? Math.round(logged.reduce((a, b) => a + b, 0) / logged.length) : null;
  };
  const average = (key: "waterMl" | "steps", unit: string) => {
    const v = weekAverage(key);
    return `7-day average · ${v === null ? "—" : `${v}${unit}`}`;
  };

  return (
    <Page userName={userName}>
      <Toolbar>
        <Segmented
          label="Health sections"
          value={activeTab}
          options={[
            { value: "daily", label: "Today" },
            { value: "shopping", label: "Shopping", short: "Shop" },
            ...(isClaudeEnabled() ? [{ value: "chat" as const, label: "Assistant", short: "AI" }] : []),
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
                  <TintButton onClick={openGoals}>Edit goals</TintButton>
                  <AddButton onClick={() => (setFormError(""), setIsMealModalOpen(true))}>Add meal</AddButton>
                </>
              }
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

            <Card id="meals-title" title="Meals" count={summary.meals.length}>
              <ListBox wash className="entries">
                {summary.meals.length === 0 && <EmptyNote>No meals logged today.</EmptyNote>}
                {summary.meals.map((meal) => (
                  <div key={meal.id} className="entry-row">
                    <span>
                      {visible(meal.name) ? meal.name : "Meal"}{" "}
                      <span className="muted number-tabular">
                        · {meal.calories} kcal · P {Number(meal.protein)} · C {Number(meal.carbs)} · F {Number(meal.fat)}
                      </span>
                    </span>
                    <DeleteButton label={`Delete ${meal.name}`} onClick={() => void handleDeleteMeal(meal)} />
                  </div>
                ))}
              </ListBox>
            </Card>

            <WeightCard today={todayDate} initial={initialWeights} />
          </DashboardMain>

          <DashboardAside>
            <Card
              id="water-title"
              title="Water"
              icon={<DropIcon size={18} />}
              end={<EditButton label="Edit water and goal" onClick={() => openMetricEdit("water")} />}
            >
              <BigNumber value={Math.round(day.metrics.waterMl)} of={`/ ${goals.waterMl} ml`} />
              <ProgressBar percent={waterPct} />
              <p className="muted metric-avg number-tabular">{average("waterMl", " ml")}</p>
              <div className="tap-buttons">
                <button type="button" className="secondary tap-btn" onClick={() => addWater(250)}>
                  +250 ml
                </button>
                <button type="button" className="secondary tap-btn" onClick={() => addWater(500)}>
                  +500 ml
                </button>
              </div>
            </Card>

            <Card
              id="steps-title"
              title="Steps"
              icon={<FootstepsIcon size={18} />}
              end={<EditButton label="Edit steps and goal" onClick={() => openMetricEdit("steps")} />}
            >
              <BigNumber value={Math.round(day.metrics.steps)} of={`/ ${goals.steps}`} />
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
        canSubmit={mealHasValues}
      >
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
          max={METRIC_MAX[metricEdit]}
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
