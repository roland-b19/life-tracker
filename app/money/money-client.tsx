"use client";

import { Fragment, useRef, useState } from "react";
import { Navigation } from "../components/navigation";
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { BarChart, DonutChart } from "../components/charts";
import { DatePicker } from "../components/date-picker";
import { AnimatedNumber } from "../components/animated-number";
import { AutoHeight, useListMotion } from "../components/list-motion";
import { Segmented } from "../components/segmented";
import { useToast } from "../components/toast";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteExpenseAction,
  getExpensesAction,
  getMonthlySummaryAction,
  logExpenseAction,
  updateCategoryAction,
  updateExpenseAction,
} from "@/app/actions/money";
import { ExpenseItem, MonthlyMoneySummary } from "@/lib/money";
import { formatDMY } from "@/lib/format-date";

interface CategoryData {
  id: string;
  name: string;
  space: string;
  icon: string | null;
  userId: string | null; // null = shared default, read-only
}

interface MoneyClientProps {
  userName: string;
  initialYear: number;
  initialMonth: number;
  categories: CategoryData[];
  initialMostUsedCategory: string;
  initialSummary: MonthlyMoneySummary;
  initialExpenses: ExpenseItem[];
}

const SPACE = "personal" as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type View = "expenses" | "categories";
type Metric = "amount" | "count";
// Seven slices stay legible; the rest fold into "Other".
const MAX_SLICES = 7;

function getTodayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function MoneyClient({
  userName,
  initialYear,
  initialMonth,
  categories: initialCategories,
  initialMostUsedCategory,
  initialSummary,
  initialExpenses,
}: MoneyClientProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const { showToast } = useToast();
  const { rowRef, enter, leave } = useListMotion();

  const [categories, setCategories] = useState(initialCategories);
  const [summary, setSummary] = useState(initialSummary);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>("expenses");
  const [metric, setMetric] = useState<Metric>("amount");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(0);

  // Expense form (create or edit)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    initialMostUsedCategory || (initialCategories[0]?.name ?? "Food & Groceries"),
  );
  const [dateInput, setDateInput] = useState(getTodayString());

  // Category form (create or edit)
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryData | null>(null);
  const [catName, setCatName] = useState("");

  const refreshMonthData = async (targetYear = year, targetMonth = month) => {
    const id = ++requestId.current;
    try {
      const monthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
      const [sumRes, expRes] = await Promise.all([
        getMonthlySummaryAction(SPACE, targetYear, targetMonth),
        getExpensesAction(SPACE, monthStr),
      ]);
      // One swap for both, ignoring answers that arrive after a newer request.
      if (id === requestId.current && sumRes.success && expRes.success) {
        setSummary(sumRes.summary);
        setExpenses(expRes.expenses);
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelectedDay(null);
    void refreshMonthData(d.getFullYear(), d.getMonth() + 1);
  };

  const openExpenseForm = (exp?: ExpenseItem) => {
    setErrorMsg(null);
    setEditingExpense(exp ?? null);
    setAmountInput(exp ? String(exp.amount) : "");
    setDateInput(exp?.date.slice(0, 10) ?? getTodayString());
    if (exp) setSelectedCategory(exp.category);
    setIsExpenseModalOpen(true);
  };

  const closeExpenseForm = () => {
    setIsExpenseModalOpen(false);
    setAmountInput("");
  };

  const expenseInput = (e: ExpenseItem) => ({
    space: SPACE,
    amount: e.amount,
    currency: "RON" as const,
    category: e.category,
    date: e.date.slice(0, 10),
    notes: e.notes || undefined,
  });

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid positive amount.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      if (editingExpense) {
        const before = editingExpense;
        const res = await updateExpenseAction({
          id: before.id,
          amount: parsedAmount,
          category: selectedCategory,
          date: dateInput,
        });
        if (res.success) {
          showToast({
            message: `Saved ${parsedAmount.toFixed(2)} RON (${selectedCategory})`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await updateExpenseAction({
                id: before.id,
                amount: before.amount,
                category: before.category,
                date: before.date.slice(0, 10),
              });
              await refreshMonthData();
            },
          });
        }
      } else {
        const res = await logExpenseAction({
          space: SPACE,
          amount: parsedAmount,
          currency: "RON",
          category: selectedCategory,
          date: dateInput,
        });
        if (res.success && res.expense) {
          const createdId = res.expense.id;
          showToast({
            message: `Logged ${parsedAmount.toFixed(2)} RON (${selectedCategory})`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await deleteExpenseAction(createdId);
              await refreshMonthData();
            },
          });
        }
      }
      closeExpenseForm();
      await refreshMonthData();
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  // The server call runs while the row fades, so nothing waits on the network; the toast comes as the row closes.
  const handleDeleteExpense = (target: ExpenseItem) => {
    const deleted = deleteExpenseAction(target.id).then(
      (res) => res.success,
      () => false,
    );
    leave(target.id, async () => {
      setExpenses((prev) => prev.filter((e) => e.id !== target.id));
      if (!(await deleted)) {
        showToast({ message: "Failed to delete expense", type: "warning" });
        await refreshMonthData();
        return;
      }
      void refreshMonthData();
      showToast({
        message: `Deleted ${target.amount.toFixed(2)} RON (${target.category})`,
        actionLabel: "Undo",
        onAction: async () => {
          const back = await logExpenseAction(expenseInput(target)).catch(() => null);
          if (!back?.expense) {
            showToast({ message: "Failed to restore expense", type: "warning" });
            return;
          }
          enter(back.expense.id);
          await refreshMonthData();
        },
      });
    });
  };

  const openCatForm = (cat?: CategoryData) => {
    setErrorMsg(null);
    setEditingCat(cat ?? null);
    setCatName(cat?.name ?? "");
    setIsCatModalOpen(true);
  };

  const closeCatForm = () => {
    setIsCatModalOpen(false);
    setCatName("");
  };

  const toCategoryData = (c: CategoryData): CategoryData => ({
    id: c.id,
    name: c.name,
    space: c.space,
    icon: c.icon,
    userId: c.userId,
  });

  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = catName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      if (editingCat) {
        const before = editingCat;
        const res = await updateCategoryAction({ id: before.id, name });
        if (res.success && res.previousName) {
          const previousName = res.previousName;
          setCategories((prev) => prev.map((c) => (c.id === before.id ? { ...c, name } : c)));
          if (selectedCategory === previousName) setSelectedCategory(name);
          showToast({
            message: `Renamed to "${name}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await updateCategoryAction({ id: before.id, name: previousName });
              setCategories((prev) => prev.map((c) => (c.id === before.id ? { ...c, name: previousName } : c)));
              await refreshMonthData();
            },
          });
          await refreshMonthData();
        }
      } else {
        const res = await createCategoryAction({ name, space: SPACE });
        if (res.success && res.category) {
          const created = toCategoryData(res.category as CategoryData);
          enter(created.id);
          setCategories((prev) => [...prev, created]);
          setSelectedCategory(created.name);
          showToast({
            message: `Category "${created.name}" created`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await deleteCategoryAction(created.id);
              leave(created.id, () => setCategories((prev) => prev.filter((c) => c.id !== created.id)));
            },
          });
        }
      }
      closeCatForm();
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (target: CategoryData) => {
    setCategories((prev) => prev.filter((c) => c.id !== target.id));
    try {
      const res = await deleteCategoryAction(target.id);
      if (res.success) {
        showToast({
          message: `Deleted category "${target.name}"`,
          actionLabel: "Undo",
          onAction: async () => {
            const back = await createCategoryAction({ name: target.name, space: SPACE });
            if (back.success && back.category) {
              const restored = toCategoryData(back.category as CategoryData);
              enter(restored.id);
              setCategories((prev) => [...prev, restored]);
            }
          },
        });
      }
    } catch (err: unknown) {
      setCategories((prev) => [...prev, target]);
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Spending per day of the shown month; the list the page loaded is already limited to this month.
  const todayIso = getTodayString();
  const isCurrentMonth = todayIso.startsWith(`${year}-${String(month).padStart(2, "0")}`);
  const daysInMonth = new Date(year, month, 0).getDate();
  const perDay = Array.from({ length: daysInMonth }, (_, i) => {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    const items = expenses.filter((e) => e.date.slice(0, 10) === iso);
    return { day: i + 1, iso, count: items.length, total: items.reduce((n, e) => n + Number(e.amount), 0) };
  });
  const value = (d: (typeof perDay)[number]) => (metric === "amount" ? d.total : d.count);
  const maxValue = Math.max(...perDay.map(value), 1);
  const biggest = Math.max(...perDay.map((d) => d.total), 0);
  const activeDays = perDay.filter((d) => d.total > 0).length;
  // The current month is averaged over the days so far, not the whole month.
  const elapsed = isCurrentMonth ? Number(todayIso.slice(8, 10)) : daysInMonth;
  const dailyAvg = summary.totalSpent / elapsed;

  const shownExpenses = selectedDay ? expenses.filter((e) => e.date.slice(0, 10) === selectedDay) : expenses;
  const slices = summary.categories
    .slice(0, MAX_SLICES)
    .map((c) => ({ label: c.category, value: c.total, display: fmt(c.total) }));
  const rest = summary.categories.slice(MAX_SLICES).reduce((n, c) => n + c.total, 0);
  if (rest > 0) slices.push({ label: "Other", value: rest, display: fmt(rest) });

  return (
    <main>
      <Navigation userName={userName} />

      <div className="toolbar dash">
        <div className="toolbar-group">
          <Segmented
            label="Show"
            value={view}
            options={[
              { value: "expenses", label: "Expenses" },
              { value: "categories", label: "Categories" },
            ]}
            onChange={setView}
          />
        </div>
        <div className="month-selector" role="group" aria-label="Month">
          <button type="button" className="month-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <DatePicker
            mode="month"
            value={`${year}-${String(month).padStart(2, "0")}`}
            today={todayIso.slice(0, 7)}
            max={todayIso.slice(0, 7)}
            label={`${MONTH_NAMES[month - 1]} ${year}`}
            onChange={(v) => shiftMonth((Number(v.slice(0, 4)) - year) * 12 + Number(v.slice(5, 7)) - month)}
          />
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="error" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="dashboard-main">
          {view === "expenses" ? (
            <section className="surface" aria-labelledby="expenses-title">
              <div className="section-head">
                <h2 id="expenses-title" className="section-title">
                  Expenses
                </h2>
                <button type="button" className="btn-sm tint" onClick={() => openExpenseForm()}>
                  <PlusIcon size={14} />
                  Add expense
                </button>
              </div>

              {selectedDay && (
                <button type="button" className="filter-chip" onClick={() => setSelectedDay(null)}>
                  {formatDMY(selectedDay)}
                  <CloseIcon size={12} />
                  <span className="visually-hidden">Show the whole month</span>
                </button>
              )}

              <AutoHeight>
                {shownExpenses.length > 0 ? (
                  // Keyed by the day filter so the rows replay their entrance when it changes.
                  <Fragment key={selectedDay ?? "month"}>
                  {shownExpenses.map((exp) => (
                    <div key={exp.id} ref={rowRef(exp.id)} className="expense-row">
                      <div className="expense-info">
                        <span className="expense-head">
                          <span className="expense-cat-title">{exp.category}</span>
                          <span className="expense-meta number-tabular">{formatDMY(exp.date)}</span>
                        </span>
                        <span className="expense-value-text number-tabular">{fmt(exp.amount)} RON</span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="delete-icon-btn edit"
                          onClick={() => openExpenseForm(exp)}
                          aria-label={`Edit ${exp.category} expense of ${exp.amount} RON`}
                          title="Edit"
                        >
                          <PencilIcon size={17} />
                        </button>
                        <button
                          type="button"
                          className="delete-icon-btn"
                          onClick={() => handleDeleteExpense(exp)}
                          aria-label={`Delete ${exp.category} expense of ${exp.amount} RON`}
                          title="Delete"
                        >
                          <TrashIcon size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                  </Fragment>
                ) : (
                  <p className="empty-note">{selectedDay ? "No expenses on this day." : "No expenses this month."}</p>
                )}
              </AutoHeight>
            </section>
          ) : (
            <section className="surface" aria-labelledby="categories-title">
              <div className="section-head">
                <h2 id="categories-title" className="section-title">
                  Categories
                </h2>
                <button type="button" className="btn-sm tint" onClick={() => openCatForm()}>
                  <PlusIcon size={14} />
                  Add category
                </button>
              </div>
              <div>
                {categories.map((c) => (
                  <div key={c.id} ref={rowRef(c.id)} className="expense-row">
                    <span className="expense-cat-title">{c.name}</span>
                    {c.userId && (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="delete-icon-btn edit"
                          onClick={() => openCatForm(c)}
                          aria-label={`Edit category ${c.name}`}
                          title="Edit"
                        >
                          <PencilIcon size={17} />
                        </button>
                        <button
                          type="button"
                          className="delete-icon-btn"
                          onClick={() => leave(c.id, () => handleDeleteCategory(c))}
                          aria-label={`Delete category ${c.name}`}
                          title="Delete"
                        >
                          <TrashIcon size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-labelledby="overview-title">
            <div className="section-head">
              <h2 id="overview-title" className="section-title">
                Spending by category
              </h2>
              <span className="muted number-tabular">
                {summary.expenseCount} {summary.expenseCount === 1 ? "transaction" : "transactions"}
              </span>
            </div>
            {slices.length > 0 ? (
              <DonutChart
                key={`${year}-${month}`}
                slices={slices}
                center={<AnimatedNumber value={summary.totalSpent} format={fmt} />}
                centerLabel="RON spent"
                summary={`${fmt(summary.totalSpent)} RON spent in ${MONTH_NAMES[month - 1]}: ${slices
                  .map((x) => `${x.label} ${x.display}`)
                  .join(", ")}`}
              />
            ) : (
              <p className="empty-note">No expenses this month.</p>
            )}
          </section>

          <section className="surface" aria-labelledby="perday-title">
            <div className="section-head">
              <h2 id="perday-title" className="section-title">
                Spending by day
              </h2>
            </div>
            <div className="chart-controls">
              <Segmented
                label="Bar height"
                value={metric}
                options={[
                  { value: "amount", label: "RON spent" },
                  { value: "count", label: "Expenses" },
                ]}
                onChange={setMetric}
              />
            </div>
            <div className="stat-row">
              <div className="stat-tile">
                <strong className="number-tabular">
                  <AnimatedNumber value={dailyAvg} format={fmt} />
                </strong>
                <span>Daily average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  <AnimatedNumber value={biggest} format={fmt} />
                </strong>
                <span>Biggest day</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  <AnimatedNumber value={activeDays} />
                </strong>
                <span>Active days</span>
              </div>
            </div>
            <BarChart
              key={`${year}-${month}-${metric}`}
              max={maxValue}
              data={perDay.map((d) => ({
                label: d.day % 5 === 1 ? String(d.day) : "",
                value: value(d),
                empty: d.total === 0,
                highlight: d.iso === selectedDay,
                title: `${formatDMY(d.iso)}: ${fmt(d.total)} RON, ${d.count} ${d.count === 1 ? "expense" : "expenses"}`,
              }))}
              summary={`Daily spending in ${MONTH_NAMES[month - 1]}, biggest day ${fmt(biggest)} RON. Choose a day to list its expenses.`}
              onSelect={(i) => {
                const iso = perDay[i].iso;
                setView("expenses");
                setSelectedDay((cur) => (cur === iso ? null : iso));
              }}
            />
          </section>
        </div>
      </div>

      <Modal
        isOpen={isExpenseModalOpen}
        onClose={closeExpenseForm}
        title={editingExpense ? "Edit expense" : "Log expense"}
      >
        <form onSubmit={handleSubmitExpense}>
          <div className="form-stack">
            <label>
              Amount (RON)
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="number-tabular"
              />
            </label>
            <label>
              Category
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" required max={todayIso} value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeExpenseForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !amountInput}>
              {editingExpense ? "Save" : "Add expense"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isCatModalOpen}
        onClose={closeCatForm}
        title={editingCat ? "Edit category" : "New category"}
      >
        <form onSubmit={handleSubmitCategory}>
          <div className="form-stack">
            <label>
              Name
              <input
                type="text"
                required
                maxLength={50}
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeCatForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !catName.trim()}>
              {editingCat ? "Save" : "Add category"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
