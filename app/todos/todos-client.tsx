"use client";

import { useEffect, useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import {
  createTodoAction,
  deleteTodoAction,
  getDailyTodosAction,
  savePushSubscriptionAction,
  toggleTodoAction,
} from "@/app/actions/todos";
import { TodoItem, TodoStats } from "@/lib/todos";
import { TodoSpace } from "@/lib/validations/todos";

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialPersonalStats: TodoStats;
  initialBusinessTodos: TodoItem[];
  initialBusinessStats: TodoStats;
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialPersonalStats,
  initialBusinessTodos,
  initialBusinessStats,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [currentDate, setCurrentDate] = useState(todayDate);

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  const [statsMap, setStatsMap] = useState<Record<TodoSpace, TodoStats>>({
    personal: initialPersonalStats,
    business: initialBusinessStats,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [isRecurringInput, setIsRecurringInput] = useState(false);
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const currentTodos = todosMap[space];
  const currentStats = statsMap[space];

  // Separate recurring habits from one-off tasks
  const recurringHabits = currentTodos.filter((t) => t.isRecurring);
  const oneOffTasks = currentTodos.filter((t) => !t.isRecurring);

  // Check push notification availability on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.register("/sw.js").then(() => {
        setPushSupported(true);
        if (Notification.permission === "granted") {
          setPushSubscribed(true);
        }
      }).catch(() => {});
    }
  }, []);

  const refreshDailyData = (date: string, targetSpace = space) => {
    startTransition(async () => {
      try {
        const res = await getDailyTodosAction(targetSpace, date);
        if (res.success && res.todos && res.stats) {
          setTodosMap((prev) => ({ ...prev, [targetSpace]: res.todos }));
          setStatsMap((prev) => ({ ...prev, [targetSpace]: res.stats }));
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleDateChange = (daysDelta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + daysDelta);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const newDateStr = `${d.getFullYear()}-${m}-${day}`;
    setCurrentDate(newDateStr);
    refreshDailyData(newDateStr, space);
  };

  const handleSpaceChange = (newSpace: TodoSpace) => {
    setSpace(newSpace);
    refreshDailyData(currentDate, newSpace);
  };

  const handleCreateTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) return;
    setErrorMsg(null);

    startTransition(async () => {
      try {
        const res = await createTodoAction({
          space,
          title: titleInput.trim(),
          isRecurring: isRecurringInput,
          recurrencePattern: isRecurringInput ? "daily" : "none",
          dueDate: currentDate,
          reminderTime: reminderTimeInput || null,
        });

        if (res.success) {
          setTitleInput("");
          setIsRecurringInput(false);
          setReminderTimeInput("");
          refreshDailyData(currentDate, space);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleToggleTodo = (todo: TodoItem) => {
    startTransition(async () => {
      try {
        const nextState = !todo.isCompleted;
        const res = await toggleTodoAction({
          id: todo.id,
          isCompleted: nextState,
          currentDate,
        });

        if (res.success) {
          refreshDailyData(currentDate, space);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleDeleteTodo = (todoId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await deleteTodoAction(todoId);
        if (res.success) {
          refreshDailyData(currentDate, space);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleEnablePush = async () => {
    if (!pushSupported) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setPushSubscribed(true);
        setPushStatusMsg("Push notifications enabled!");
        await navigator.serviceWorker.ready;
        // Mock dummy keys for local browser demonstration
        await savePushSubscriptionAction({
          endpoint: `https://webpush.local/sub/${encodeURIComponent(userName)}`,
          p256dhKey: "sample-p256dh-val",
          authKey: "sample-auth-val",
        });
      } else {
        setPushStatusMsg("Notification permission was denied.");
      }
    } catch {
      setPushStatusMsg("Failed to subscribe to push notifications.");
    }
  };

  return (
    <main>
      <Navigation userName={userName} />

      {/* Space Switcher */}
      <div className="space-switcher" role="tablist" aria-label="Task Space Switcher">
        <button
          type="button"
          role="tab"
          aria-selected={space === "personal"}
          className={`space-tab ${space === "personal" ? "active" : ""}`}
          onClick={() => handleSpaceChange("personal")}
        >
          👤 Personal Tasks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={space === "business"}
          className={`space-tab ${space === "business" ? "active" : ""}`}
          onClick={() => handleSpaceChange("business")}
        >
          💼 Business Tasks
        </button>
      </div>

      {/* Web Push Notification Banner */}
      {pushSupported && !pushSubscribed && (
        <div className="push-toggle-card">
          <span>🔔 Enable browser reminders for due tasks?</span>
          <button
            type="button"
            className="secondary"
            style={{ minHeight: "2rem", padding: "0.25rem 0.75rem", fontSize: "0.85rem" }}
            onClick={handleEnablePush}
          >
            Enable Push
          </button>
        </div>
      )}

      {pushStatusMsg && (
        <p style={{ fontSize: "0.85rem", color: "var(--secondary)", margin: "-0.5rem 0 1rem" }}>
          {pushStatusMsg}
        </p>
      )}

      {errorMsg && (
        <div className="error" style={{ marginBottom: "1rem" }} role="alert">
          {errorMsg}
        </div>
      )}

      {/* Daily Progress & Date Header Card */}
      <section className="todo-hero-card" aria-label="Daily Overview">
        <div className="month-selector" style={{ marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => handleDateChange(-1)}
            aria-label="Previous Day"
            disabled={isPending}
          >
            ‹
          </button>
          <span className="month-label" style={{ fontSize: "1.05rem" }}>
            {currentDate === todayDate ? "Today" : currentDate}
          </span>
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => handleDateChange(1)}
            aria-label="Next Day"
            disabled={isPending}
          >
            ›
          </button>
        </div>

        <div className="todo-stats-header">
          <span className="todo-stats-rate">
            {currentStats.percentage}%
          </span>
          <span className="todo-stats-fraction">
            {currentStats.completed} of {currentStats.total} completed
          </span>
        </div>

        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{ width: `${currentStats.percentage}%` }}
          />
        </div>
      </section>

      {/* Quick Task Creation Form */}
      <section className="quick-expense-card" aria-label="Add Task">
        <h2 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>
          Add New Task
        </h2>

        <form onSubmit={handleCreateTodo}>
          <div style={{ marginBottom: "0.75rem" }}>
            <input
              type="text"
              required
              maxLength={150}
              placeholder="What do you need to do?"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "0.75rem",
                border: "1.5px solid var(--separator)",
                background: "var(--background)",
                color: "var(--text)",
                fontSize: "1rem",
              }}
              aria-label="Task Title"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
            <label className="toggle-label" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isRecurringInput}
                onChange={(e) => setIsRecurringInput(e.target.checked)}
              />
              <span>Daily recurring habit</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>⏰ Reminder:</span>
              <input
                type="time"
                value={reminderTimeInput}
                onChange={(e) => setReminderTimeInput(e.target.value)}
                style={{
                  padding: "0.35rem 0.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--separator)",
                  background: "var(--background)",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                }}
                aria-label="Reminder Time"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !titleInput.trim()}
            style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", fontWeight: 600 }}
          >
            {isPending ? "Adding..." : "Add Task"}
          </button>
        </form>
      </section>

      {/* Recurring Habits Section */}
      {recurringHabits.length > 0 && (
        <section className="quick-expense-card" aria-label="Daily Habits">
          <div className="todo-section-title" style={{ marginTop: 0 }}>
            <span>🔥 Daily Habits & Routines</span>
            <span>{recurringHabits.filter((h) => h.isCompleted).length}/{recurringHabits.length}</span>
          </div>

          <div>
            {recurringHabits.map((habit) => (
              <div key={habit.id} className="todo-row">
                <div className="todo-left">
                  <button
                    type="button"
                    className={`todo-checkbox-btn ${habit.isCompleted ? "checked" : ""}`}
                    onClick={() => handleToggleTodo(habit)}
                    aria-label={`Mark ${habit.title} as ${habit.isCompleted ? "incomplete" : "complete"}`}
                  >
                    {habit.isCompleted && "✓"}
                  </button>
                  <div>
                    <span className={`todo-title ${habit.isCompleted ? "completed" : ""}`}>
                      {habit.title}
                    </span>
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                      {habit.streak > 0 && (
                        <span className="badge badge-streak">
                          🔥 {habit.streak} {habit.streak === 1 ? "day" : "days"} streak
                        </span>
                      )}
                      {habit.reminderTime && (
                        <span className="badge badge-reminder">
                          ⏰ {habit.reminderTime}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="delete-icon-btn"
                  onClick={() => handleDeleteTodo(habit.id)}
                  aria-label={`Delete habit ${habit.title}`}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* One-off Tasks Section */}
      <section className="quick-expense-card" aria-label="Today's Tasks">
        <div className="todo-section-title" style={{ marginTop: 0 }}>
          <span>📋 Today&apos;s Tasks</span>
          <span>{oneOffTasks.filter((t) => t.isCompleted).length}/{oneOffTasks.length}</span>
        </div>

        {oneOffTasks.length > 0 ? (
          <div>
            {oneOffTasks.map((task) => (
              <div key={task.id} className="todo-row">
                <div className="todo-left">
                  <button
                    type="button"
                    className={`todo-checkbox-btn ${task.isCompleted ? "checked" : ""}`}
                    onClick={() => handleToggleTodo(task)}
                    aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                  >
                    {task.isCompleted && "✓"}
                  </button>
                  <div>
                    <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>
                      {task.title}
                    </span>
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                      {task.isCarriedOver && (
                        <span className="badge badge-carried">
                          Carried Over
                        </span>
                      )}
                      {task.reminderTime && (
                        <span className="badge badge-reminder">
                          ⏰ {task.reminderTime}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="delete-icon-btn"
                  onClick={() => handleDeleteTodo(task.id)}
                  aria-label={`Delete task ${task.title}`}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--secondary)", fontSize: "0.9rem", margin: "0.5rem 0 0" }}>
            No one-off tasks for this day.
          </p>
        )}
      </section>
    </main>
  );
}
