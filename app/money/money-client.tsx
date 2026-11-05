"use client";

import { useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import { TrashIcon, PlusIcon } from "../components/icons";
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
import { formatDMY } from "@/lib/format-date";

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

  // Modals state
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [showNewCatModal, setShowNewCatModal] = useState(false);

  const { showToast } = useToast();

  const [categories, setCategories] = useState(initialCategories);
  const [summary, setSummary] = useState(initialSummary);
  const [expenses, setExpenses] = useState(initialExpenses);

  // Quick form state
  const [amountInput, setAmountInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(
    initialMostUsedCategory || (categories[0]?.name ?? "Food & Groceries"),
  );
  const [dateInput, setDateInput] = useState(getTodayString());
  const [notesInput, setNotesInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New category modal state
  const [newCatName, setNewCatName] = useState("");

  const [isPending, startTransition] = useTransition();

  const refreshMonthData = (targetYear: number, targetMonth: number) => {
    startTransition(async () => {
      try {
        const monthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
        const [sumRes, expRes] = await Promise.all([
          getMonthlySummaryAction(SPACE, targetYear, targetMonth),
          getExpensesAction(SPACE, monthStr),
        ]);

        if (sumRes.success && sumRes.summary) {
          setSummary(sumRes.summary);
        }
        if (expRes.success && expRes.expenses) {
          setExpenses(expRes.expenses);
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
          space: SPACE,
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
    const target = expenses.find((e) => e.id === id);
    if (!target) return;

    // Optimistic removal
    setExpenses((prev) => prev.filter((e) => e.id !== id));

    startTransition(async () => {
      try {
        const res = await deleteExpenseAction(id);
        if (res.success) {
          showToast({
            message: `Deleted ${target.amount.toFixed(2)} RON (${target.category})`,
            actionLabel: "Undo",
            onAction: async () => {
              await logExpenseAction({
                space: SPACE,
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
        setExpenses((prev) => [...prev, target].sort((a, b) => b.date.localeCompare(a.date)));
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
          space: SPACE,
        });

        if (res.success && res.category) {
          const newCat: CategoryData = {
            id: res.category.id,
            name: res.category.name,
            space: res.category.space,
            icon: res.category.icon,
          };
          setCategories((prev) => [...prev, newCat]);
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

      <div className="toolbar toolbar-end">
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
          <span>Log expense</span>
        </button>
      </div>

      {errorMsg && (
        <div className="error" role="alert">
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
                {summary.totalSpent.toLocaleString("ro-RO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="total-spent-currency">RON</span>
            </div>

            {/* Category Breakdown Progress Bars */}
            {summary.categories.length > 0 ? (
              <div className="category-breakdown-list">
                {summary.categories.map((cat) => (
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
              <p className="empty-note">No expenses this month.</p>
            )}
          </section>

          {/* Expense History List */}
          <section className="quick-expense-card" aria-label="Expense History">
            <div className="section-head">
              <h2 className="section-title">Transactions</h2>
              <span className="muted">{expenses.length}</span>
            </div>

            {isPending && expenses.length === 0 && (
              <div style={{ display: "grid", gap: "0.5rem", padding: "0.5rem 0" }}>
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
                <div className="skeleton skeleton-row" />
              </div>
            )}

            {expenses.length > 0 ? (
              <div>
                {expenses.map((exp) => (
                  <div key={exp.id} className="expense-row">
                    <div className="expense-info">
                      <span className="expense-cat-title">{exp.category}</span>
                      <span className="expense-meta">
                        {formatDMY(exp.date)}{exp.notes ? ` • ${exp.notes}` : ""}
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
              !isPending && <p className="empty-note">No expenses this month.</p>
            )}
          </section>
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-label="Categories">
            <div className="section-head">
              <h2 className="section-title">Categories</h2>
              <button type="button" className="btn-sm" onClick={() => setShowNewCatModal(true)}>
                <PlusIcon size={14} />
                <span>New</span>
              </button>
            </div>
            <div className="tag-list">
              {categories.map((c) => (
                <span key={c.id} className="tag">
                  {c.name}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Modal: Log Expense with Blurred Backdrop */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Log expense"
      >
        <form onSubmit={handleLogExpense}>
          <div className="amount-input-container">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
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
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selectedCategory === c.name}
                className={`category-chip ${selectedCategory === c.name ? "active" : ""}`}
                onClick={() => setSelectedCategory(c.name)}
              >
                <span>{c.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="category-chip add"
              onClick={() => {
                setIsExpenseModalOpen(false);
                setShowNewCatModal(true);
              }}
            >
              <PlusIcon size={14} />
              <span>New category</span>
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
        title="New category"
      >
        <form onSubmit={handleCreateCategory}>
          <label style={{ marginBottom: "1.25rem" }}>
            Name
            <input
              type="text"
              required
              maxLength={50}
              placeholder="e.g. Subscriptions"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              aria-label="Category Name"
            />
          </label>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setShowNewCatModal(false)}
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending || !newCatName.trim()}>
              Save
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
