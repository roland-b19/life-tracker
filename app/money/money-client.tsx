"use client";

import { useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import { TrashIcon, PlusIcon, CloseIcon, LockIcon, TagIcon } from "../components/icons";
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

  // New category modal / inline state
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");

  const [isPending, startTransition] = useTransition();

  const currentSummary = summaries[space];
  const currentExpenses = expensesMap[space];

  const refreshMonthData = async (targetYear: number, targetMonth: number) => {
    setErrorMsg(null);
    const monthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

    startTransition(async () => {
      try {
        const [sumPersonal, sumBusiness, expPersonal, expBusiness] = await Promise.all([
          getMonthlySummaryAction("personal", targetYear, targetMonth),
          getMonthlySummaryAction("business", targetYear, targetMonth),
          getExpensesAction("personal", monthStr),
          getExpensesAction("business", monthStr),
        ]);

        setSummaries({
          personal: sumPersonal.summary,
          business: sumBusiness.summary,
        });

        setExpensesMap({
          personal: expPersonal.expenses,
          business: expBusiness.expenses,
        });
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
    if (!confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await deleteExpenseAction(id);
        if (res.success) {
          refreshMonthData(year, month);
        }
      } catch (err: unknown) {
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

      {/* Space Switcher */}
      <div className="space-switcher" role="tablist" aria-label="Money Space Switcher">
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

      {errorMsg && (
        <div className="error" style={{ marginBottom: "1rem" }} role="alert">
          {errorMsg}
        </div>
      )}

      {/* Main Responsive Bento Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Monthly Overview & Ledger */}
        <div className="dashboard-main">
          {/* Monthly Overview Card */}
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
              <span className="total-spent-amount">
                {currentSummary.totalSpent.toLocaleString("ro-RO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="total-spent-currency">RON</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--secondary)", marginBottom: "1.25rem" }}>
              {currentSummary.expenseCount} {currentSummary.expenseCount === 1 ? "expense" : "expenses"} recorded in {space}
            </div>

            {/* Category Breakdown Progress Bars */}
            {currentSummary.categories.length > 0 ? (
              <div className="category-breakdown-list">
                {currentSummary.categories.map((cat) => (
                  <div key={cat.category} className="breakdown-row">
                    <div className="breakdown-header">
                      <span className="breakdown-cat-name">
                        {cat.category} <span style={{ color: "var(--secondary)", fontSize: "0.8rem" }}>({cat.percentage}%)</span>
                      </span>
                      <span className="breakdown-cat-val">
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
                {space === "personal" ? "Personal" : "Business"} Transactions
              </h2>
              <span className="badge badge-info">
                {currentExpenses.length} entries
              </span>
            </div>

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
                      <span className="expense-value-text">
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
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--secondary)", fontSize: "0.9rem", margin: "0.5rem 0 0", textAlign: "center", padding: "1.5rem 0" }}>
                No expenses found for this month in {space}.
              </p>
            )}
          </section>
        </div>

        {/* Right Column: Quick Expense Logger & Custom Category Manager */}
        <div className="dashboard-aside sticky">
          {/* Quick 2-3 Tap Expense Logger */}
          <section className="quick-expense-card" aria-label="Log New Expense">
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.85rem" }}>
              + Quick Expense
            </h2>

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
                  className="amount-input-hero"
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
                  onClick={() => setShowNewCatModal(true)}
                  style={{ borderStyle: "dashed" }}
                >
                  <PlusIcon size={14} />
                  <span>New</span>
                </button>
              </div>

              {/* Date & Note input row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                <input
                  type="date"
                  required
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  aria-label="Expense Date"
                />
                <input
                  type="text"
                  placeholder="Note (optional)"
                  maxLength={255}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  aria-label="Expense Note"
                />
              </div>

              <button
                type="submit"
                disabled={isPending || !amountInput}
                style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", fontWeight: 600 }}
              >
                {isPending ? "Logging..." : `+ Log ${amountInput ? `${amountInput} RON` : "Expense"}`}
              </button>
            </form>
          </section>

          {/* New Category Modal / Inline Card */}
          {showNewCatModal && (
            <section
              className="quick-expense-card"
              style={{ border: "1.5px solid var(--tint)", marginBottom: "1.25rem" }}
              aria-label="Add Custom Category"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Add Custom Category</h3>
                <button
                  type="button"
                  className="delete-icon-btn"
                  onClick={() => setShowNewCatModal(false)}
                  aria-label="Close modal"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateCategory}>
                <div style={{ display: "grid", gridTemplateColumns: "3.5rem 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="text"
                    maxLength={4}
                    value={newCatIcon}
                    onChange={(e) => setNewCatIcon(e.target.value)}
                    placeholder="Tag"
                    style={{ textAlign: "center", fontSize: "0.9rem", padding: "0.5rem" }}
                    aria-label="Category Tag Icon"
                  />
                  <input
                    type="text"
                    required
                    maxLength={50}
                    placeholder="Category name"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    aria-label="Category Name"
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
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
            </section>
          )}

          {/* Privacy Notice */}
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "0.85rem",
              background: "var(--surface-secondary)",
              border: "1px solid var(--separator)",
              textAlign: "center",
              fontSize: "0.78rem",
              color: "var(--secondary)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <LockIcon size={14} />
              <strong>Strict Financial Privacy:</strong>
            </span>{" "}
            All expenses and budget summaries are 100% quarantined from AI and MCP endpoints.
          </div>
        </div>
      </div>
    </main>
  );
}
