"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "../components/navigation";
import { CloseIcon, LockIcon } from "../components/icons";
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
  const [successMsg, setSuccessMsg] = useState("");

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
    setSuccessMsg("");

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
        setSuccessMsg("Income recorded successfully.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add income");
    } finally {
      setBusy(false);
    }
  }

  // Handle Income Delete
  async function handleDeleteIncome(id: string, amount: number) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await deleteBusinessIncomeAction(id);
      if (res.success) {
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
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete income");
    } finally {
      setBusy(false);
    }
  }

  // Handle Expense Add
  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

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
        setSuccessMsg("Business expense logged successfully.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log expense");
    } finally {
      setBusy(false);
    }
  }

  // Handle Expense Delete
  async function handleDeleteExpense(id: string, amount: number) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await deleteExpenseAction(id);
      if (res.success) {
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
      }
    } catch (err) {
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
    setErrorMsg("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await createTodoAction({
        space: "business",
        title: taskTitle.trim(),
        dueDate: today,
        isRecurring: false,
        recurrencePattern: "none",
      });

      if (res.success && res.todo) {
        setDashboard((prev) => ({
          ...prev,
          pendingTasks: [res.todo as TodoItem, ...prev.pendingTasks],
        }));
        setTaskTitle("");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setBusy(false);
    }
  }

  // Handle Task Toggle
  async function handleToggleTask(task: TodoItem) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await toggleTodoAction({
        id: task.id,
        isCompleted: !task.isCompleted,
      });
      if (res.success) {
        setDashboard((prev) => ({
          ...prev,
          pendingTasks: prev.pendingTasks.filter((t) => t.id !== task.id),
        }));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setBusy(false);
    }
  }

  // Handle Task Delete
  async function handleDeleteTask(taskId: string) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await deleteTodoAction(taskId);
      if (res.success) {
        setDashboard((prev) => ({
          ...prev,
          pendingTasks: prev.pendingTasks.filter((t) => t.id !== taskId),
        }));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setBusy(false);
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

      {/* Month Selector Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
        }}
      >
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="secondary"
          style={{ minHeight: "2.4rem", padding: "0 0.85rem" }}
          aria-label="Previous Month"
        >
          ← Prev Month
        </button>
        <div style={{ textAlign: "center" }}>
          <span className="badge badge-info" style={{ marginBottom: "0.2rem" }}>
            Monthly Accounting
          </span>
          <h2 style={{ fontSize: "1.35rem", margin: 0 }}>{monthLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="secondary"
          style={{ minHeight: "2.4rem", padding: "0 0.85rem" }}
          aria-label="Next Month"
        >
          Next Month →
        </button>
      </div>

      {/* Hero Financial Health Banner */}
      <section className="surface" aria-labelledby="kpi-title" style={{ marginBottom: "1.5rem" }}>
        <div className="section-heading">
          <div>
            <span className="badge badge-info">Family Business Dashboard</span>
            <h2 id="kpi-title" style={{ marginTop: "0.25rem" }}>
              Profit & Loss Overview
            </h2>
          </div>
          <span
            className={`badge ${isProfit ? "badge-success" : "badge-danger"}`}
            style={{ fontSize: "0.85rem" }}
          >
            {isProfit ? "● Profitable Period" : "● Deficit Period"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
          {/* Net Profit Card */}
          <div
            className="macro-card"
            style={{
              background: isProfit ? "rgba(52, 199, 89, 0.08)" : "rgba(255, 59, 48, 0.08)",
              border: `1.5px solid ${isProfit ? "rgba(52, 199, 89, 0.25)" : "rgba(255, 59, 48, 0.25)"}`,
              gridColumn: "span 1",
            }}
          >
            <span className="macro-title">Monthly Net Profit (Incomes − Expenses)</span>
            <div
              style={{
                fontSize: "2.1rem",
                fontWeight: 800,
                color: isProfit ? "#34c759" : "var(--danger)",
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
              Profit Margin: <strong>{profitMargin}%</strong>
            </span>
          </div>

          {/* Incomes Card */}
          <div className="macro-card">
            <span className="macro-title">Total Incomes Recorded</span>
            <span className="macro-numbers" style={{ fontSize: "1.6rem", color: "#34c759" }}>
              +{dashboard.totalIncome.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
            <span className="macro-target">{dashboard.incomes.length} incoming transactions</span>
          </div>

          {/* Expenses Card */}
          <div className="macro-card">
            <span className="macro-title">Total Business Expenses</span>
            <span className="macro-numbers" style={{ fontSize: "1.6rem", color: "var(--danger)" }}>
              -{dashboard.totalExpenses.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
            <span className="macro-target">{dashboard.recentExpenses.length} expense entries</span>
          </div>
        </div>
      </section>

      {/* Notifications */}
      {errorMsg && (
        <p className="error" style={{ marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "var(--danger-subtle)", borderRadius: "0.65rem" }}>
          {errorMsg}
        </p>
      )}
      {successMsg && (
        <p style={{ color: "#34c759", marginBottom: "1rem", padding: "0.6rem 0.85rem", background: "var(--success-subtle)", borderRadius: "0.65rem", fontSize: "0.9rem" }}>
          {successMsg}
        </p>
      )}

      {/* Main Responsive Bento Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Financial Records & Ledgers */}
        <div className="dashboard-main">
          {/* Incomes Ledger Card */}
          <section className="surface" aria-labelledby="incomes-list-title">
            <div className="section-heading">
              <h2 id="incomes-list-title" style={{ fontSize: "1.2rem" }}>
                Recorded Business Incomes
              </h2>
              <span className="badge badge-success">+{dashboard.totalIncome.toFixed(2)} RON</span>
            </div>

            {/* Quick Add Income Form */}
            <form onSubmit={handleAddIncome} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", padding: "1rem", background: "var(--surface-secondary)", borderRadius: "0.85rem", border: "1px solid var(--separator)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "0.5rem" }}>
                <label>
                  Amount (RON)
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={incomeAmount}
                    onChange={(e) => setIncomeAmount(e.target.value)}
                    disabled={busy}
                    required
                  />
                </label>

                <label>
                  Category
                  <input
                    type="text"
                    placeholder="e.g. Sales, Consulting"
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
              </div>

              <button
                type="submit"
                disabled={busy || !incomeAmount || !incomeCategory}
                style={{ alignSelf: "start", background: "#34c759" }}
              >
                {busy ? "Saving..." : "+ Record Income"}
              </button>
            </form>

            {/* Incomes List */}
            <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.5rem" }}>
              {dashboard.incomes.length === 0 ? (
                <p className="muted" style={{ padding: "1.5rem 0", textAlign: "center" }}>
                  No incomes recorded for {monthLabel}.
                </p>
              ) : (
                dashboard.incomes.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      border: "1px solid var(--separator)",
                      borderRadius: "0.65rem",
                      background: "var(--surface-solid)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{item.category}</span>
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
                      <span style={{ fontWeight: 700, color: "#34c759", fontSize: "1.1rem" }}>
                        +{item.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        RON
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteIncome(item.id, item.amount)}
                        disabled={busy}
                        aria-label={`Delete income ${item.category}`}
                        style={{
                          padding: "0.25rem 0.55rem",
                          fontSize: "0.75rem",
                          background: "transparent",
                          color: "var(--danger)",
                          border: "1px solid var(--separator)",
                        }}
                      >
                        Delete
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
              <span className="badge badge-danger">-{dashboard.totalExpenses.toFixed(2)} RON</span>
            </div>

            <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
              {dashboard.recentExpenses.length === 0 ? (
                <p className="muted" style={{ padding: "1.5rem 0", textAlign: "center" }}>
                  No business expenses logged yet.
                </p>
              ) : (
                dashboard.recentExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.75rem 1rem",
                      border: "1px solid var(--separator)",
                      borderRadius: "0.65rem",
                      background: "var(--surface-solid)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{exp.category}</span>
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
                      <span style={{ fontWeight: 700, color: "var(--danger)", fontSize: "1.1rem" }}>
                        -{exp.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        RON
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteExpense(exp.id, exp.amount)}
                        disabled={busy}
                        aria-label={`Delete expense ${exp.category}`}
                        style={{
                          padding: "0.25rem 0.55rem",
                          fontSize: "0.75rem",
                          background: "transparent",
                          color: "var(--danger)",
                          border: "1px solid var(--separator)",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Fast Expense Logger & Operations Tasks */}
        <div className="dashboard-aside sticky">
          {/* Quick Business Expense Form Card */}
          <section className="surface" aria-labelledby="add-expense-title">
            <h2 id="add-expense-title" style={{ fontSize: "1.15rem" }}>
              + Quick Business Expense
            </h2>

            <form onSubmit={handleAddExpense} style={{ marginTop: "0.85rem", display: "grid", gap: "0.75rem" }}>
              <label>
                Amount (RON)
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  disabled={busy}
                  required
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

              <button
                type="submit"
                disabled={busy || !expenseAmount || !expenseCategory}
                style={{ width: "100%", marginTop: "0.35rem" }}
              >
                {busy ? "Logging..." : "+ Log Business Expense"}
              </button>
            </form>
          </section>

          {/* Business Operations Tasks (Todos) */}
          <section className="surface" aria-labelledby="tasks-title">
            <div className="section-heading">
              <div>
                <span className="badge badge-warning">Operations</span>
                <h2 id="tasks-title" style={{ marginTop: "0.25rem", fontSize: "1.15rem" }}>
                  Pending Business Tasks
                </h2>
              </div>
              <span className="muted" style={{ fontSize: "0.85rem" }}>
                {dashboard.pendingTasks.length} active
              </span>
            </div>

            {/* Quick Add Task */}
            <form onSubmit={handleAddTask} style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
              <input
                type="text"
                placeholder="New business task..."
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <button type="submit" disabled={busy || !taskTitle.trim()}>
                + Add
              </button>
            </form>

            {/* Tasks list */}
            <div style={{ marginTop: "0.85rem", display: "grid", gap: "0.45rem" }}>
              {dashboard.pendingTasks.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem", padding: "1rem 0", textAlign: "center" }}>
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
                      padding: "0.55rem 0.75rem",
                      border: "1px solid var(--separator)",
                      borderRadius: "0.55rem",
                      background: "var(--surface-solid)",
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
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={t.isCompleted}
                        onChange={() => handleToggleTask(t)}
                        disabled={busy}
                        style={{ width: "1.15rem", height: "1.15rem" }}
                      />
                      <span>{t.title}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(t.id)}
                      disabled={busy}
                      aria-label={`Delete task ${t.title}`}
                      style={{
                        padding: "0.2rem 0.45rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        color: "var(--danger)",
                        border: "1px solid var(--separator)",
                        borderRadius: "0.35rem",
                      }}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Privacy & Quarantine Badge */}
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "0.85rem",
              background: "var(--surface-secondary)",
              border: "1px solid var(--separator)",
              textAlign: "center",
              fontSize: "0.78rem",
              color: "var(--secondary)",
              lineHeight: 1.4,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <LockIcon size={14} />
              <strong>Private Business Vault:</strong>
            </span>{" "}
            Excluded from Food AI, MCP tools, and external LLMs. Data is isolated in your dedicated tenant database.
          </div>
        </div>
      </div>
    </main>
  );
}
