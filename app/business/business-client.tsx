"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "../components/navigation";
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
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="btn-secondary"
          style={{ minHeight: "2.4rem", padding: "0 0.85rem" }}
          aria-label="Previous Month"
        >
          ← Prev Month
        </button>
        <div style={{ textAlign: "center" }}>
          <span className="badge badge-info" style={{ marginBottom: "0.2rem" }}>
            Monthly Overview
          </span>
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>{monthLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="btn-secondary"
          style={{ minHeight: "2.4rem", padding: "0 0.85rem" }}
          aria-label="Next Month"
        >
          Next Month →
        </button>
      </div>

      {/* Hero Card: Net Profit & Core KPIs */}
      <section className="surface" aria-labelledby="kpi-title">
        <div className="section-heading">
          <div>
            <span className="badge badge-info">Family Business</span>
            <h2 id="kpi-title" style={{ marginTop: "0.25rem" }}>
              Financial Health
            </h2>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: isProfit ? "#34c759" : "var(--danger)",
            }}
          >
            {isProfit ? "● Profitable" : "● Deficit"}
          </span>
        </div>

        {/* Big Profit Hero */}
        <div
          style={{
            background: isProfit ? "rgba(52, 199, 89, 0.08)" : "rgba(215, 0, 21, 0.08)",
            border: `1px solid ${isProfit ? "rgba(52, 199, 89, 0.25)" : "rgba(215, 0, 21, 0.25)"}`,
            borderRadius: "0.75rem",
            padding: "1.25rem",
            marginTop: "1rem",
            textAlign: "center",
          }}
        >
          <span
            style={{
              textTransform: "uppercase",
              fontSize: "0.78rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: "var(--secondary)",
            }}
          >
            Monthly Net Profit (Incomes − Expenses)
          </span>
          <div
            style={{
              fontSize: "2.25rem",
              fontWeight: 800,
              color: isProfit ? "#34c759" : "var(--danger)",
              marginTop: "0.25rem",
            }}
          >
            {dashboard.netProfit > 0 ? "+" : ""}
            {dashboard.netProfit.toLocaleString("ro-RO", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            <span style={{ fontSize: "1.1rem", fontWeight: 500 }}>RON</span>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--secondary)", marginTop: "0.3rem" }}>
            Margin: <strong>{profitMargin}%</strong>
          </div>
        </div>

        {/* Incomes vs Expenses Macro Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
            gap: "0.75rem",
            marginTop: "1rem",
          }}
        >
          <div className="macro-card">
            <span className="macro-title">Total Incomes</span>
            <span
              className="macro-numbers"
              style={{ fontSize: "1.4rem", color: "#34c759" }}
            >
              +{dashboard.totalIncome.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
          </div>

          <div className="macro-card">
            <span className="macro-title">Business Expenses</span>
            <span
              className="macro-numbers"
              style={{ fontSize: "1.4rem", color: "var(--danger)" }}
            >
              -{dashboard.totalExpenses.toLocaleString("ro-RO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="macro-target">RON</span>
            </span>
          </div>
        </div>
      </section>

      {/* Notification messages */}
      {errorMsg && (
        <p
          className="error"
          style={{
            color: "var(--danger)",
            margin: "0.75rem 0",
            padding: "0.6rem 0.85rem",
            background: "rgba(215, 0, 21, 0.08)",
            borderRadius: "0.5rem",
          }}
        >
          {errorMsg}
        </p>
      )}
      {successMsg && (
        <p
          style={{
            color: "#34c759",
            margin: "0.75rem 0",
            padding: "0.6rem 0.85rem",
            background: "rgba(52, 199, 89, 0.08)",
            borderRadius: "0.5rem",
            fontSize: "0.9rem",
          }}
        >
          {successMsg}
        </p>
      )}

      {/* Income Recording Section */}
      <section className="surface" aria-labelledby="income-title" style={{ marginTop: "1.25rem" }}>
        <h2 id="income-title" style={{ fontSize: "1.1rem" }}>
          + Record Business Income
        </h2>

        <form onSubmit={handleAddIncome} style={{ marginTop: "0.85rem", display: "grid", gap: "0.75rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.5rem",
            }}
          >
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
                placeholder="e.g. Sales, Consulting, Delivery"
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
                placeholder="Client name, invoice #, etc."
                value={incomeNote}
                onChange={(e) => setIncomeNote(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy || !incomeAmount || !incomeCategory}
            style={{ alignSelf: "start", background: "#34c759", borderColor: "#34c759" }}
          >
            {busy ? "Saving..." : "+ Record Income"}
          </button>
        </form>

        {/* Incomes List */}
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "0.95rem", color: "var(--secondary)", textTransform: "uppercase" }}>
            Recorded Incomes ({dashboard.incomes.length})
          </h3>
          {dashboard.incomes.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}>
              No incomes recorded for {monthLabel}.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
              {dashboard.incomes.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid var(--separator)",
                    borderRadius: "0.5rem",
                    background: "var(--surface)",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{item.category}</span>
                    <span className="muted" style={{ fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                      {item.date}
                    </span>
                    {item.note && (
                      <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                        {item.note}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontWeight: 700, color: "#34c759" }}>
                      +{item.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      RON
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteIncome(item.id, item.amount)}
                      disabled={busy}
                      aria-label={`Delete income ${item.category}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        background: "transparent",
                        color: "var(--danger)",
                        border: "1px solid var(--separator)",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Expense Logging Section */}
      <section className="surface" aria-labelledby="expense-title" style={{ marginTop: "1.25rem" }}>
        <h2 id="expense-title" style={{ fontSize: "1.1rem" }}>
          + Quick Business Expense
        </h2>

        <form onSubmit={handleAddExpense} style={{ marginTop: "0.85rem", display: "grid", gap: "0.75rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
              gap: "0.5rem",
            }}
          >
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
              Category
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                disabled={busy}
                style={{
                  minHeight: "2.75rem",
                  borderRadius: "0.65rem",
                  border: "1px solid var(--separator)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  padding: "0.5rem",
                }}
              >
                {businessCategories.map((c) => (
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
                placeholder="Supplier, purpose, receipt #"
                value={expenseNotes}
                onChange={(e) => setExpenseNotes(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy || !expenseAmount || !expenseCategory}
            style={{ alignSelf: "start" }}
          >
            {busy ? "Logging..." : "+ Log Business Expense"}
          </button>
        </form>

        {/* Recent Business Expenses */}
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "0.95rem", color: "var(--secondary)", textTransform: "uppercase" }}>
            Recent Business Expenses ({dashboard.recentExpenses.length})
          </h3>
          {dashboard.recentExpenses.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}>
              No business expenses recorded yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
              {dashboard.recentExpenses.map((exp) => (
                <div
                  key={exp.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid var(--separator)",
                    borderRadius: "0.5rem",
                    background: "var(--surface)",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{exp.category}</span>
                    <span className="muted" style={{ fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                      {exp.date}
                    </span>
                    {exp.notes && (
                      <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>
                        {exp.notes}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontWeight: 700, color: "var(--danger)" }}>
                      -{exp.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      RON
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp.id, exp.amount)}
                      disabled={busy}
                      aria-label={`Delete expense ${exp.category}`}
                      style={{
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        background: "transparent",
                        color: "var(--danger)",
                        border: "1px solid var(--separator)",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Business Tasks (To-Dos) */}
      <section className="surface" aria-labelledby="tasks-title" style={{ marginTop: "1.25rem" }}>
        <div className="section-heading">
          <div>
            <span className="badge badge-warning">Operations</span>
            <h2 id="tasks-title" style={{ marginTop: "0.25rem" }}>
              Pending Business Tasks
            </h2>
          </div>
          <span className="muted">{dashboard.pendingTasks.length} active</span>
        </div>

        {/* Quick Add Task */}
        <form onSubmit={handleAddTask} style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
          <input
            type="text"
            placeholder="Add business task (e.g. Renew domain, File VAT invoice)..."
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={busy || !taskTitle.trim()}>
            + Add Task
          </button>
        </form>

        {/* Tasks list */}
        <div style={{ marginTop: "1rem" }}>
          {dashboard.pendingTasks.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}>
              All business tasks are done! Good work.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {dashboard.pendingTasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.8rem",
                    border: "1px solid var(--separator)",
                    borderRadius: "0.5rem",
                    background: "var(--surface)",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      cursor: "pointer",
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={t.isCompleted}
                      onChange={() => handleToggleTask(t)}
                      disabled={busy}
                      style={{ width: "1.2rem", height: "1.2rem" }}
                    />
                    <span style={{ fontWeight: 500 }}>{t.title}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(t.id)}
                    disabled={busy}
                    aria-label={`Delete task ${t.title}`}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      background: "transparent",
                      color: "var(--danger)",
                      border: "1px solid var(--separator)",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Security & Isolation Disclaimer */}
      <div
        style={{
          marginTop: "1.5rem",
          padding: "0.85rem",
          borderRadius: "0.65rem",
          background: "rgba(142, 142, 147, 0.08)",
          border: "1px solid var(--separator)",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--secondary)",
        }}
      >
        🔒 <strong>Private Business Vault:</strong> Excluded from Food AI, MCP tools, and external LLM processing. All data is isolated in your dedicated tenant database.
      </div>
    </main>
  );
}
