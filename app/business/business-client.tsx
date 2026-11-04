"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "../components/navigation";
import { LockIcon, PlusIcon, TrashIcon } from "../components/icons";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import { BusinessDashboardData, BusinessIncomeItem } from "@/lib/business";
import { addBusinessIncomeAction, deleteBusinessIncomeAction } from "@/app/actions/business";
import { logExpenseAction, deleteExpenseAction } from "@/app/actions/money";
import { createTodoAction, toggleTodoAction, deleteTodoAction } from "@/app/actions/todos";
import { TodoItem } from "@/lib/todos";

interface BusinessClientProps {
  userName: string;
  initialDashboard: BusinessDashboardData;
  businessCategories: string[];
}

export function BusinessClient({
  userName,
  initialDashboard,
  businessCategories,
}: BusinessClientProps) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<BusinessDashboardData>(initialDashboard);

  // Modal & Tab states
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionTab, setTransactionTab] = useState<"income" | "expense">("income");

  const { showToast } = useToast();

  // Income form
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeCategory, setIncomeCategory] = useState("Sales");
  const [incomeDate, setIncomeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [incomeNote, setIncomeNote] = useState("");

  // Expense form
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState(businessCategories[0] || "Supplies");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState("");

  // Task form
  const [taskTitle, setTaskTitle] = useState("");

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const monthDate = new Date(dashboard.year, dashboard.month - 1, 1);
  const monthLabel = monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function changeMonth(delta: number) {
    let newYear = dashboard.year;
    let newMonth = dashboard.month + delta;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const target = `${newYear}-${String(newMonth).padStart(2, "0")}`;
    router.push(`/business?month=${target}`);
  }

  // Handle Income Add
  async function handleAddIncome(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedAmount = parseFloat(incomeAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid income amount greater than 0.");
      return;
    }

    setBusy(true);
    try {
      const res = await addBusinessIncomeAction({
        amount: parsedAmount,
        category: incomeCategory,
        date: incomeDate,
        note: incomeNote.trim() || undefined,
      });

      if (res.success && res.income) {
        setDashboard((prev) => {
          const newIncomes = [res.income as BusinessIncomeItem, ...prev.incomes];
          const newTotalIncome = Math.round((prev.totalIncome + parsedAmount) * 100) / 100;
          const newNetProfit = Math.round((newTotalIncome - prev.totalExpenses) * 100) / 100;
          return {
            ...prev,
            incomes: newIncomes,
            totalIncome: newTotalIncome,
            netProfit: newNetProfit,
          };
        });
        setIncomeAmount("");
        setIncomeNote("");
        setIsTransactionModalOpen(false);
        showToast({
          message: `Recorded income: +${parsedAmount.toFixed(2)} RON (${incomeCategory})`,
          type: "success",
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add income");
    } finally {
      setBusy(false);
    }
  }

  // Handle Income Delete
  async function handleDeleteIncome(id: string, amount: number) {
    const target = dashboard.incomes.find((i) => i.id === id);
    if (!target) return;

    // Optimistic removal
    setDashboard((prev) => {
      const newIncomes = prev.incomes.filter((i) => i.id !== id);
      const newTotalIncome = Math.max(0, Math.round((prev.totalIncome - amount) * 100) / 100);
      const newNetProfit = Math.round((newTotalIncome - prev.totalExpenses) * 100) / 100;
      return {
        ...prev,
        incomes: newIncomes,
        totalIncome: newTotalIncome,
        netProfit: newNetProfit,
      };
    });

    setBusy(true);
    try {
      const res = await deleteBusinessIncomeAction(id);
      if (res.success) {
        showToast({
          message: `Deleted income +${amount.toFixed(2)} RON (${target.category})`,
          actionLabel: "Undo",
          onAction: async () => {
            const reRes = await addBusinessIncomeAction({
              amount: target.amount,
              category: target.category,
              date: target.date,
              note: target.note || undefined,
            });
            if (reRes.success && reRes.income) {
              setDashboard((prev) => {
                const newIncomes = [reRes.income as BusinessIncomeItem, ...prev.incomes];
                const newTotalIncome = Math.round((prev.totalIncome + target.amount) * 100) / 100;
                const newNetProfit = Math.round((newTotalIncome - prev.totalExpenses) * 100) / 100;
                return {
                  ...prev,
                  incomes: newIncomes,
                  totalIncome: newTotalIncome,
                  netProfit: newNetProfit,
                };
              });
            }
          },
        });
      }
    } catch (err) {
      // Revert if error
      setDashboard((prev) => {
        const newIncomes = [target, ...prev.incomes];
        const newTotalIncome = Math.round((prev.totalIncome + amount) * 100) / 100;
        const newNetProfit = Math.round((newTotalIncome - prev.totalExpenses) * 100) / 100;
        return {
          ...prev,
          incomes: newIncomes,
          totalIncome: newTotalIncome,
          netProfit: newNetProfit,
        };
      });
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete income");
    } finally {
      setBusy(false);
    }
  }

  // Handle Expense Add
  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const parsedAmount = parseFloat(expenseAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Please enter a valid expense amount greater than 0.");
      return;
    }

    setBusy(true);
    try {
      const res = await logExpenseAction({
        space: "business",
        amount: parsedAmount,
        category: expenseCategory,
        date: expenseDate,
        notes: expenseNotes.trim() || undefined,
      });

      if (res.success && res.expense) {
        const addedExpense = {
          id: res.expense.id,
          amount: Number(res.expense.amount),
          category: res.expense.category,
          date: res.expense.date,
          notes: res.expense.notes,
        };
        setDashboard((prev) => {
          const newExpenses = [addedExpense, ...prev.recentExpenses];
          const newTotalExpenses = Math.round((prev.totalExpenses + parsedAmount) * 100) / 100;
          const newNetProfit = Math.round((prev.totalIncome - newTotalExpenses) * 100) / 100;
          return {
            ...prev,
            recentExpenses: newExpenses,
            totalExpenses: newTotalExpenses,
            netProfit: newNetProfit,
          };
        });
        setExpenseAmount("");
        setExpenseNotes("");
        setIsTransactionModalOpen(false);
        showToast({
          message: `Recorded expense: -${parsedAmount.toFixed(2)} RON (${expenseCategory})`,
          type: "success",
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log expense");
    } finally {
      setBusy(false);
    }
  }

  // Handle Expense Delete
  async function handleDeleteExpense(id: string, amount: number) {
    const target = dashboard.recentExpenses.find((e) => e.id === id);
    if (!target) return;

    // Optimistic removal
    setDashboard((prev) => {
      const newExpenses = prev.recentExpenses.filter((e) => e.id !== id);
      const newTotalExpenses = Math.max(0, Math.round((prev.totalExpenses - amount) * 100) / 100);
      const newNetProfit = Math.round((prev.totalIncome - newTotalExpenses) * 100) / 100;
      return {
        ...prev,
        recentExpenses: newExpenses,
        totalExpenses: newTotalExpenses,
        netProfit: newNetProfit,
      };
    });

    setBusy(true);
    try {
      const res = await deleteExpenseAction(id);
      if (res.success) {
        showToast({
          message: `Deleted expense -${amount.toFixed(2)} RON (${target.category})`,
          actionLabel: "Undo",
          onAction: async () => {
            const reRes = await logExpenseAction({
              space: "business",
              amount: target.amount,
              category: target.category,
              date: target.date,
              notes: target.notes || undefined,
            });
            if (reRes.success && reRes.expense) {
              const restored = {
                id: reRes.expense.id,
                amount: Number(reRes.expense.amount),
                category: reRes.expense.category,
                date: reRes.expense.date,
                notes: reRes.expense.notes,
              };
              setDashboard((prev) => {
                const newExpenses = [restored, ...prev.recentExpenses];
                const newTotalExpenses = Math.round((prev.totalExpenses + target.amount) * 100) / 100;
                const newNetProfit = Math.round((prev.totalIncome - newTotalExpenses) * 100) / 100;
                return {
                  ...prev,
                  recentExpenses: newExpenses,
                  totalExpenses: newTotalExpenses,
                  netProfit: newNetProfit,
                };
              });
            }
          },
        });
      }
    } catch (err) {
      // Revert if error
      setDashboard((prev) => {
        const newExpenses = [target, ...prev.recentExpenses];
        const newTotalExpenses = Math.round((prev.totalExpenses + amount) * 100) / 100;
        const newNetProfit = Math.round((prev.totalIncome - newTotalExpenses) * 100) / 100;
        return {
          ...prev,
          recentExpenses: newExpenses,
          totalExpenses: newTotalExpenses,
          netProfit: newNetProfit,
        };
      });
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete expense");
    } finally {
      setBusy(false);
    }
  }

  // Handle Task Add
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setBusy(true);
    try {
      const res = await createTodoAction({
        space: "business",
        title: taskTitle.trim(),
        isRecurring: false,
        dueDate: new Date().toISOString().slice(0, 10),
      });

      if (res.success && res.todo) {
        setDashboard((prev) => ({
          ...prev,
          pendingTasks: [res.todo as TodoItem, ...prev.pendingTasks],
        }));
        setTaskTitle("");
        showToast({
          message: `Created task "${taskTitle.trim()}"`,
          type: "success",
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setBusy(false);
    }
  }

  // Handle Task Toggle
  async function handleToggleTask(task: TodoItem) {
    const nextCompleted = !task.isCompleted;
    setDashboard((prev) => ({
      ...prev,
      pendingTasks: nextCompleted
        ? prev.pendingTasks.filter((t) => t.id !== task.id)
        : [...prev.pendingTasks, { ...task, isCompleted: false }],
    }));

    try {
      await toggleTodoAction({
        id: task.id,
        isCompleted: nextCompleted,
      });
    } catch {
      // Revert
      setDashboard((prev) => ({
        ...prev,
        pendingTasks: [...prev.pendingTasks, task],
      }));
    }
  }

  // Handle Task Delete
  async function handleDeleteTask(id: string) {
    const target = dashboard.pendingTasks.find((t) => t.id === id);
    if (!target) return;

    setDashboard((prev) => ({
      ...prev,
      pendingTasks: prev.pendingTasks.filter((t) => t.id !== id),
    }));

    try {
      await deleteTodoAction(id);
      showToast({
        message: `Deleted task "${target.title}"`,
        actionLabel: "Undo",
        onAction: async () => {
          const reRes = await createTodoAction({
            space: "business",
            title: target.title,
            isRecurring: false,
            dueDate: target.dueDate,
          });
          if (reRes.success && reRes.todo) {
            setDashboard((prev) => ({
              ...prev,
              pendingTasks: [reRes.todo as TodoItem, ...prev.pendingTasks],
            }));
          }
        },
      });
    } catch {
      setDashboard((prev) => ({
        ...prev,
        pendingTasks: [...prev.pendingTasks, target],
      }));
    }
  }

  const isProfit = dashboard.netProfit >= 0;
  const profitMargin =
    dashboard.totalIncome > 0
      ? Math.round((dashboard.netProfit / dashboard.totalIncome) * 100)
      : 0;

  return (
    <main>
      <Navigation userName={userName} />

      {/* Action Bar Header */}
      <div className="action-bar-header">
        {/* Month Selector */}
        <div className="month-selector" style={{ margin: 0 }}>
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => changeMonth(-1)}
            aria-label="Previous Month"
            disabled={busy}
          >
            ‹
          </button>
          <span className="month-label">{monthLabel}</span>
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => changeMonth(1)}
            aria-label="Next Month"
            disabled={busy}
          >
            ›
          </button>
        </div>

        <button
          type="button"
          className="btn-open-modal"
          onClick={() => {
            setErrorMsg("");
            setIsTransactionModalOpen(true);
          }}
          aria-label="Open record transaction dialog"
        >
          <PlusIcon size={16} />
          <span>Record Transaction</span>
        </button>
      </div>

      {/* Hero Financial Summary Banner */}
      <section className="surface" style={{ marginBottom: "1.25rem", padding: "1.5rem" }} aria-label="Business Performance">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
            gap: "1rem",
          }}
        >
          {/* Net Profit Card */}
          <div
            className="macro-card"
            style={{
              background: isProfit ? "rgba(143, 209, 158, 0.08)" : "rgba(240, 138, 138, 0.08)",
              border: `1.5px solid ${isProfit ? "rgba(143, 209, 158, 0.25)" : "rgba(240, 138, 138, 0.25)"}`,
              gridColumn: "span 1",
            }}
          >
            <span className="macro-title">Monthly Net Profit (Incomes − Expenses)</span>
            <div
              className="number-tabular"
              style={{
                fontSize: "2.1rem",
                fontWeight: 800,
                color: isProfit ? "var(--success)" : "var(--danger)",
                letterSpacing: "-0.02em",
              }}
            >
              {dashboard.netProfit > 0 ? "+" : ""}
              {dashboard.netProfit.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span style={{ fontSize: "1rem", fontWeight: 600 }}>RON</span>
            </div>
            <span className="macro-target">
              Profit Margin: <strong className="number-tabular">{profitMargin}%</strong>
            </span>
          </div>

          {/* Incomes Card */}
          <div className="macro-card">
            <span className="macro-title">Total Incomes Recorded</span>
            <span className="macro-numbers number-tabular" style={{ fontSize: "1.6rem", color: "var(--success)" }}>
              +{dashboard.totalIncome.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
            <span className="macro-target number-tabular">{dashboard.incomes.length} incoming transactions</span>
          </div>

          {/* Expenses Card */}
          <div className="macro-card">
            <span className="macro-title">Total Business Expenses</span>
            <span className="macro-numbers number-tabular" style={{ fontSize: "1.6rem", color: "var(--danger)" }}>
              -{dashboard.totalExpenses.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
            <span className="macro-target number-tabular">{dashboard.recentExpenses.length} expense entries</span>
          </div>
        </div>
      </section>

      {/* Notifications */}
      {errorMsg && (
        <p className="error" style={{ marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "var(--danger-subtle)", borderRadius: "0.65rem" }}>
          {errorMsg}
        </p>
      )}

      {/* Main Responsive Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Financial Records & Ledgers */}
        <div className="dashboard-main">
          {/* Incomes Ledger Card */}
          <section className="surface" aria-labelledby="incomes-list-title" style={{ marginBottom: "1.25rem" }}>
            <div className="section-heading">
              <h2 id="incomes-list-title" style={{ fontSize: "1.2rem" }}>
                Recorded Business Incomes
              </h2>
              <span className="badge badge-success number-tabular">+{dashboard.totalIncome.toFixed(2)} RON</span>
            </div>

            <div className="entries" style={{ marginTop: "1rem" }}>
              {dashboard.incomes.length === 0 ? (
                <p className="muted" style={{ padding: "2rem 0", textAlign: "center" }}>
                  No incomes recorded for {monthLabel}. Tap <strong>Record Transaction</strong> to add one.
                </p>
              ) : (
                dashboard.incomes.map((item) => (
                  <div key={item.id} className="entry-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <strong>{item.category}</strong>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          {item.date}
                        </span>
                      </div>
                      {item.note && (
                        <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                          {item.note}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                      <span className="number-tabular" style={{ fontWeight: 700, color: "var(--success)", fontSize: "1.1rem" }}>
                        +{item.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        RON
                      </span>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteIncome(item.id, item.amount)}
                        disabled={busy}
                        aria-label={`Delete income ${item.category}`}
                        title="Delete income"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Recent Business Expenses Section */}
          <section className="surface" aria-labelledby="expenses-list-title">
            <div className="section-heading">
              <h2 id="expenses-list-title" style={{ fontSize: "1.2rem" }}>
                Recent Business Expenses
              </h2>
              <span className="badge badge-danger number-tabular">-{dashboard.totalExpenses.toFixed(2)} RON</span>
            </div>

            <div className="entries" style={{ marginTop: "1rem" }}>
              {dashboard.recentExpenses.length === 0 ? (
                <p className="muted" style={{ padding: "2rem 0", textAlign: "center" }}>
                  No business expenses logged yet for this month.
                </p>
              ) : (
                dashboard.recentExpenses.map((exp) => (
                  <div key={exp.id} className="entry-row">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <strong>{exp.category}</strong>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          {exp.date}
                        </span>
                      </div>
                      {exp.notes && (
                        <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                          {exp.notes}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                      <span className="number-tabular" style={{ fontWeight: 700, color: "var(--danger)", fontSize: "1.1rem" }}>
                        -{exp.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        RON
                      </span>
                      <button
                        type="button"
                        className="delete-icon-btn"
                        onClick={() => handleDeleteExpense(exp.id, exp.amount)}
                        disabled={busy}
                        aria-label={`Delete expense ${exp.category}`}
                        title="Delete expense"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Operations Tasks & Privacy */}
        <div className="dashboard-aside">
          {/* Business Operations Tasks */}
          <section className="surface" aria-labelledby="tasks-title">
            <div className="section-heading">
              <div>
                <span className="badge badge-warning">Operations</span>
                <h2 id="tasks-title" style={{ marginTop: "0.25rem", fontSize: "1.15rem" }}>
                  Pending Business Tasks
                </h2>
              </div>
              <span className="muted number-tabular" style={{ fontSize: "0.85rem" }}>
                {dashboard.pendingTasks.length} active
              </span>
            </div>

            {/* Quick Add Task */}
            <form onSubmit={handleAddTask} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <input
                type="text"
                placeholder="New business task..."
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={busy || !taskTitle.trim()} style={{ padding: "0.4rem 0.85rem" }}>
                + Add
              </button>
            </form>

            {/* Tasks list */}
            <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.45rem" }}>
              {dashboard.pendingTasks.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem", padding: "1.25rem 0", textAlign: "center" }}>
                  All business tasks completed!
                </p>
              ) : (
                dashboard.pendingTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.6rem 0.85rem",
                      border: "1px solid var(--separator)",
                      borderRadius: "0.65rem",
                      background: "var(--surface-secondary)",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        cursor: "pointer",
                        margin: 0,
                        fontSize: "0.9rem",
                        flex: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={t.isCompleted}
                        onChange={() => handleToggleTask(t)}
                        style={{ cursor: "pointer", width: "1.1rem", height: "1.1rem" }}
                      />
                      <span style={{ textDecoration: t.isCompleted ? "line-through" : "none" }}>
                        {t.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="delete-icon-btn"
                      onClick={() => handleDeleteTask(t.id)}
                      aria-label="Delete task"
                      title="Delete task"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Privacy Card */}
          <div
            style={{
              padding: "1.15rem",
              borderRadius: "0.95rem",
              background: "var(--surface-secondary)",
              border: "1px solid var(--separator)",
              textAlign: "center",
              fontSize: "0.8125rem",
              color: "var(--secondary)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--text)", fontWeight: 600 }}>
              <LockIcon size={14} /> Strict Enterprise Privacy
            </span>
            <p style={{ margin: "0.35rem 0 0", lineHeight: 1.5 }}>
              All business incomes, expenses, margins, and operational tasks are isolated from AI providers and course audit logs.
            </p>
          </div>
        </div>
      </div>

      {/* Pop-up Modal with Heavy Blurred Background */}
      <Modal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        title="Record Business Transaction"
      >
        {/* Transaction Type Segmented Switcher */}
        <div className="space-switcher" style={{ margin: "0 0 1.25rem" }}>
          <button
            type="button"
            className={`space-tab ${transactionTab === "income" ? "active" : ""}`}
            onClick={() => setTransactionTab("income")}
          >
            Income (+)
          </button>
          <button
            type="button"
            className={`space-tab ${transactionTab === "expense" ? "active" : ""}`}
            onClick={() => setTransactionTab("expense")}
          >
            Expense (−)
          </button>
        </div>

        {transactionTab === "income" ? (
          <form onSubmit={handleAddIncome} style={{ display: "grid", gap: "0.85rem" }}>
            <label>
              Amount (RON)
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                autoFocus
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                disabled={busy}
                required
                className="number-tabular"
              />
            </label>

            <label>
              Income Category
              <input
                type="text"
                placeholder="e.g. Sales, Consulting, Retainer"
                value={incomeCategory}
                onChange={(e) => setIncomeCategory(e.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label>
              Date
              <input
                type="date"
                value={incomeDate}
                onChange={(e) => setIncomeDate(e.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label>
              Note (Optional)
              <input
                type="text"
                placeholder="Client or Invoice #"
                value={incomeNote}
                onChange={(e) => setIncomeNote(e.target.value)}
                disabled={busy}
              />
            </label>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsTransactionModalOpen(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !incomeAmount || !incomeCategory}
                style={{ flex: 2, background: "var(--success)", color: "#000" }}
              >
                {busy ? "Saving..." : "+ Record Income"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAddExpense} style={{ display: "grid", gap: "0.85rem" }}>
            <label>
              Amount (RON)
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                autoFocus
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                disabled={busy}
                required
                className="number-tabular"
              />
            </label>

            <label>
              Expense Category
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                disabled={busy}
              >
                {Array.from(new Set(businessCategories)).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label>
              Notes (Optional)
              <input
                type="text"
                placeholder="Supplier, invoice, receipt"
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
                disabled={busy}
              />
            </label>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsTransactionModalOpen(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !expenseAmount || !expenseCategory}
                style={{ flex: 2 }}
              >
                {busy ? "Logging..." : "+ Log Business Expense"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </main>
  );
}
