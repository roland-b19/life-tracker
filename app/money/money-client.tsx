"use client";

import { useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import { TrashIcon, PlusIcon, LockIcon, TagIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import {
  createCategoryAction,
  deleteExpenseAction,
  getExpensesAction,
  getMonthlySummaryAction,
  logExpenseAction,
} from "@/app/actions/money";
import { ExpenseItem, MonthlyMoneySummary } from "@/lib/money";
import { ExpenseSpace } from "@/lib/validations/money";

interface CategoryData {
  id: string;
  name: string;
  space: string;
  icon: string | null;
}

interface MoneyClientProps {
  userName: string;
  initialYear: number;
  initialMonth: number;
  personalCategories: CategoryData[];
  businessCategories: CategoryData[];
  initialMostUsedCategory: string;
  initialPersonalSummary: MonthlyMoneySummary;
  initialBusinessSummary: MonthlyMoneySummary;
  initialPersonalExpenses: ExpenseItem[];
  initialBusinessExpenses: ExpenseItem[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  personalCategories,
  businessCategories,
  initialMostUsedCategory,
  initialPersonalSummary,
  initialBusinessSummary,
  initialPersonalExpenses,
  initialBusinessExpenses,
}: MoneyClientProps) {
  const [space, setSpace] = useState<ExpenseSpace>("personal");
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  // Modals state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [showNewCatModal, setShowNewCatModal] = useState(false);

  const { showToast } = useToast();

  // Categories per space
  const [categoriesMap, setCategoriesMap] = useState<Record<ExpenseSpace, CategoryData[]>>({
    personal: personalCategories,
    business: businessCategories,
  });

  // Summaries per space
  const [summaries, setSummaries] = useState<Record<ExpenseSpace, MonthlyMoneySummary>>({
    personal: initialPersonalSummary,
    business: initialBusinessSummary,
  });

  // Expense lists per space
  const [expensesMap, setExpensesMap] = useState<Record<ExpenseSpace, ExpenseItem[]>>({
    personal: initialPersonalExpenses,
    business: initialBusinessExpenses,
  });

  // Quick form state
  const currentCategories = categoriesMap[space];
  const [amountInput, setAmountInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    initialMostUsedCategory || (currentCategories[0]?.name ?? "Food & Groceries"),
  );
  const [dateInput, setDateInput] = useState(getTodayString());
  const [notesInput, setNotesInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New category modal state
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");

  const [isPending, startTransition] = useTransition();

  const currentSummary = summaries[space];
  const currentExpenses = expensesMap[space];

  const refreshMonthData = (targetYear: number, targetMonth: number) => {
    startTransition(async () => {
      try {
        const monthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
        const [sumRes, expRes] = await Promise.all([
          getMonthlySummaryAction(space, targetYear, targetMonth),
          getExpensesAction(space, monthStr),
        ]);

        if (sumRes.success && sumRes.summary) {
          setSummaries((prev) => ({ ...prev, [space]: sumRes.summary }));
        }
        if (expRes.success && expRes.expenses) {
          setExpensesMap((prev) => ({ ...prev, [space]: expRes.expenses }));
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handlePrevMonth = () => {
    let nextY = year;
    let nextM = month - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setYear(nextY);
    setMonth(nextM);
    refreshMonthData(nextY, nextM);
  };

  const handleNextMonth = () => {
    let nextY = year;
    let nextM = month + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setYear(nextY);
    setMonth(nextM);
    refreshMonthData(nextY, nextM);
  };

  const handleSpaceChange = (newSpace: ExpenseSpace) => {
    setSpace(newSpace);
    const cats = categoriesMap[newSpace];
    if (cats.length > 0 && !cats.some((c) => c.name === selectedCategory)) {
      setSelectedCategory(cats[0].name);
    }
  };

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid positive amount.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await logExpenseAction({
          space,
          amount: parsedAmount,
          currency: "RON",
          category: selectedCategory,
          date: dateInput,
          notes: notesInput.trim() || undefined,
        });

        if (res.success && res.expense) {
          setAmountInput("");
          setNotesInput("");
          setDateInput(getTodayString());
          setIsExpenseModalOpen(false);
          showToast({
            message: `Logged ${parsedAmount.toFixed(2)} RON (${selectedCategory})`,
            type: "success",
          });
          refreshMonthData(year, month);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleDeleteExpense = async (id: string) => {
    const target = currentExpenses.find((e) => e.id === id);
    if (!target) return;

    // Optimistic removal
    setExpensesMap((prev) => ({
      ...prev,
      [space]: prev[space].filter((e) => e.id !== id),
    }));

    startTransition(async () => {
      try {
        const res = await deleteExpenseAction(id);
        if (res.success) {
          showToast({
            message: `Deleted ${target.amount.toFixed(2)} RON (${target.category})`,
            actionLabel: "Undo",
            onAction: async () => {
              await logExpenseAction({
                space,
                amount: target.amount,
                currency: "RON",
                category: target.category,
                date: target.date,
                notes: target.notes || undefined,
              });
              refreshMonthData(year, month);
            },
          });
          refreshMonthData(year, month);
        }
      } catch (err: unknown) {
        // Revert
        setExpensesMap((prev) => ({
          ...prev,
          [space]: [...prev[space], target].sort((a, b) => b.date.localeCompare(a.date)),
        }));
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    startTransition(async () => {
      try {
        const res = await createCategoryAction({
          name: newCatName.trim(),
          space,
          icon: newCatIcon.trim() || null,
        });

        if (res.success && res.category) {
          const newCat: CategoryData = {
            id: res.category.id,
            name: res.category.name,
            space: res.category.space,
            icon: res.category.icon,
          };
          setCategoriesMap((prev) => ({
            ...prev,
            [space]: [...prev[space], newCat],
          }));
          setSelectedCategory(newCat.name);
          setNewCatName("");
          setShowNewCatModal(false);
          showToast({
            message: `Category "${newCat.name}" created`,
            type: "success",
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  return (
    <main>
      <Navigation userName={userName} />

      {/* Top Action Bar */}
      <div className="action-bar-header">
        <div className="space-switcher" role="tablist" aria-label="Money Space Switcher" style={{ margin: 0 }}>
          <button
            type="button"
            role="tab"
            aria-selected={space === "personal"}
            className={`space-tab ${space === "personal" ? "active" : ""}`}
            onClick={() => handleSpaceChange("personal")}
          >
            Personal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={space === "business"}
            className={`space-tab ${space === "business" ? "active" : ""}`}
            onClick={() => handleSpaceChange("business")}
          >
            Business
          </button>
        </div>

        <button
          type="button"
          className="btn-open-modal"
          onClick={() => {
            setErrorMsg(null);
            setIsExpenseModalOpen(true);
          }}
          aria-label="Open log expense dialog"
        >
          <PlusIcon size={16} />
          <span>Log Expense</span>
        </button>
      </div>

      {errorMsg && (
        <div className="error" style={{ marginBottom: "1rem" }} role="alert">
          {errorMsg}
        </div>
      )}

      {/* Main Responsive Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Monthly Overview & Breakdown */}
        <div className="dashboard-main">
          {/* Monthly Overview Hero Card */}
          <section className="money-hero-card" aria-label="Monthly Overview">
            <div className="month-selector">
              <button
                type="button"
                className="month-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                disabled={isPending}
              >
                ‹
              </button>
              <span className="month-label">
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <button
                type="button"
                className="month-nav-btn"
                onClick={handleNextMonth}
                aria-label="Next Month"
                disabled={isPending}
              >
                ›
              </button>
            </div>

            <div className="total-spent-display">
              <span className="total-spent-amount number-tabular">
                {currentSummary.totalSpent.toLocaleString("ro-RO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="total-spent-currency">RON</span>
            </div>
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--secondary)",
                marginBottom: "1.25rem",
              }}
            >
              {currentSummary.expenseCount}{" "}
              {currentSummary.expenseCount === 1 ? "expense" : "expenses"} recorded in {space}
            </div>

            {/* Category Breakdown Progress Bars */}
            {currentSummary.categories.length > 0 ? (
              <div className="category-breakdown-list">
                {currentSummary.categories.map((cat) => (
                  <div key={cat.category} className="breakdown-row">
                    <div className="breakdown-header">
                      <span className="breakdown-cat-name">
                        {cat.category}{" "}
                        <span style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>
                          ({cat.percentage}%)
                        </span>
                      </span>
                      <span className="breakdown-cat-val number-tabular">
                        {cat.total.toLocaleString("ro-RO", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        RON
                      </span>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(100, cat.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--secondary)", fontSize: "0.9rem", margin: 0 }}>
                No expenses recorded for this month.
              </p>
            )}
          </section>

          {/* Expense History List */}
          <section className="quick-expense-card" aria-label="Expense History">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
                {space === "personal" ? "Personal" : "Business"} Transactions
              </h2>
              <span className="badge badge-info">
                {currentExpenses.length} entries
              </span>
            </div>

            {isPending && currentExpenses.length === 0 && (
              <div style={{ display: "grid", gap: "0.5rem", padding: "0.5rem 0" }}>
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            )}

            {currentExpenses.length > 0 ? (
              <div>
                {currentExpenses.map((exp) => (
                  <div key={exp.id} className="expense-row">
                    <div className="expense-info">
                      <span className="expense-cat-title">{exp.category}</span>
                      <span className="expense-meta">
                        {exp.date} {exp.notes ? `• ${exp.notes}` : ""}
                      </span>
                    </div>
                    <div className="expense-amount-actions">
                      <span className="expense-value-text number-tabular">
                        {exp.amount.toLocaleString("ro-RO", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        RON
                      </span>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteExpense(exp.id)}
                        aria-label={`Delete ${exp.category} expense of ${exp.amount} RON`}
                        title="Delete expense"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !isPending && (
                <p
                  style={{
                    color: "var(--secondary)",
                    fontSize: "0.9rem",
                    margin: "0.5rem 0 0",
                    textAlign: "center",
                    padding: "2rem 0",
                  }}
                >
                  No expenses recorded for this month in {space}. Tap <strong>Log Expense</strong> to add one.
                </p>
              )
            )}
          </section>
        </div>

        {/* Right Column: Categories & Privacy Note */}
        <div className="dashboard-aside">
          {/* Quick Categories Overview */}
          <section className="surface" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "0.95rem", textTransform: "uppercase", color: "var(--secondary)", letterSpacing: "0.05em", margin: 0 }}>
                {space === "personal" ? "Personal" : "Business"} Categories
              </h3>
              <button
                type="button"
                className="category-chip"
                onClick={() => setShowNewCatModal(true)}
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", borderStyle: "dashed" }}
              >
                <PlusIcon size={12} />
                <span>New</span>
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {currentCategories.map((c) => (
                <span
                  key={c.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.35rem 0.65rem",
                    borderRadius: "0.6rem",
                    background: "var(--surface-secondary)",
                    border: "1px solid var(--separator)",
                    fontSize: "0.825rem",
                  }}
                >
                  {c.icon ? c.icon : <TagIcon size={12} />}
                  <span>{c.name}</span>
                </span>
              ))}
            </div>
          </section>

          {/* Privacy Notice */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "0.95rem",
              background: "var(--surface-secondary)",
              border: "1px solid var(--separator)",
              textAlign: "center",
              fontSize: "0.8125rem",
              color: "var(--secondary)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--text)", fontWeight: 600 }}>
              <LockIcon size={14} /> Strict Financial Privacy
            </span>
            <p style={{ margin: "0.35rem 0 0", lineHeight: 1.5 }}>
              All expenses, incomes, and budgets are strictly quarantined from AI providers and MCP servers.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Log Expense with Blurred Backdrop */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={`Log ${space === "personal" ? "Personal" : "Business"} Expense`}
      >
        <form onSubmit={handleLogExpense}>
          <div className="amount-input-container">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="amount-input-hero number-tabular"
              aria-label="Expense Amount in RON"
            />
            <span className="amount-currency-tag">RON</span>
          </div>

          {/* Category Chips Scroll */}
          <div className="category-chips-scroll" role="radiogroup" aria-label="Select Category">
            {currentCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selectedCategory === c.name}
                className={`category-chip ${selectedCategory === c.name ? "active" : ""}`}
                onClick={() => setSelectedCategory(c.name)}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  {c.icon ? c.icon : <TagIcon size={14} />}
                </span>
                <span>{c.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="category-chip"
              onClick={() => {
                setIsExpenseModalOpen(false);
                setShowNewCatModal(true);
              }}
              style={{ borderStyle: "dashed" }}
            >
              <PlusIcon size={14} />
              <span>New Category</span>
            </button>
          </div>

          {/* Date & Note input row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <label>
              Date
              <input
                type="date"
                required
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                aria-label="Expense Date"
              />
            </label>
            <label>
              Note (optional)
              <input
                type="text"
                placeholder="e.g. Weekly grocery run"
                maxLength={255}
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                aria-label="Expense Note"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsExpenseModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !amountInput}
              style={{ flex: 2 }}
            >
              {isPending ? "Logging..." : `+ Log ${amountInput ? `${amountInput} RON` : "Expense"}`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: New Custom Category */}
      <Modal
        isOpen={showNewCatModal}
        onClose={() => setShowNewCatModal(false)}
        title="Add Custom Category"
      >
        <form onSubmit={handleCreateCategory}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "4.5rem 1fr",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <label>
              Tag
              <input
                type="text"
                maxLength={4}
                value={newCatIcon}
                onChange={(e) => setNewCatIcon(e.target.value)}
                placeholder="Tag"
                style={{ textAlign: "center", fontSize: "0.95rem" }}
                aria-label="Category Tag Icon"
              />
            </label>
            <label>
              Category Name
              <input
                type="text"
                required
                autoFocus
                maxLength={50}
                placeholder="e.g. Subscriptions"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                aria-label="Category Name"
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowNewCatModal(false)}
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending || !newCatName.trim()}>
              Save Category
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
