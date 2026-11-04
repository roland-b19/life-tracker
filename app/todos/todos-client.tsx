"use client";

import { useEffect, useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, TrashIcon, FlameIcon, RefreshIcon, BellIcon } from "../components/icons";
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

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) return;

    startTransition(async () => {
      try {
        const res = await createTodoAction({
          space,
          title: titleInput.trim(),
          isRecurring: isRecurringInput,
          recurrencePattern: isRecurringInput ? "daily" : "none",
          dueDate: currentDate,
          reminderTime: reminderTimeInput.trim() || undefined,
        });

        if (res.success && res.todo) {
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

  const handleToggleTodo = async (todo: TodoItem) => {
    startTransition(async () => {
      try {
        const res = await toggleTodoAction({
          id: todo.id,
          isCompleted: !todo.isCompleted,
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

  const handleDeleteTodo = async (id: string) => {
    startTransition(async () => {
      try {
        const res = await deleteTodoAction(id);
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
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatusMsg("Push notification permission denied.");
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setPushStatusMsg("Web push notifications enabled locally.");
        setPushSubscribed(true);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      const res = await savePushSubscriptionAction({
        subscription: sub.toJSON(),
      });

      if (res.success) {
        setPushSubscribed(true);
        setPushStatusMsg("Push notifications registered successfully.");
      }
    } catch {
      setPushStatusMsg("Failed to register push subscription.");
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

      {/* Web Push Notification Banner */}
      {pushSupported && !pushSubscribed && (
        <div className="push-toggle-card">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <BellIcon size={16} /> Enable browser reminders for due tasks?
          </span>
          <button
            type="button"
            className="secondary"
            style={{ minHeight: "2.1rem", padding: "0.25rem 0.85rem", fontSize: "0.85rem" }}
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

      {/* Main Responsive Bento Grid */}
      <div className="dashboard-grid">
        {/* Left Column: Day Progress & Task Sections */}
        <div className="dashboard-main">
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
              <span className="month-label" style={{ fontSize: "1.1rem" }}>
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
                {currentStats.completed} of {currentStats.total} completed in {space}
              </span>
            </div>

            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${currentStats.percentage}%` }}
              />
            </div>
          </section>

          {/* Recurring Habits Section */}
          {recurringHabits.length > 0 && (
            <section className="quick-expense-card" aria-label="Daily Habits">
              <div className="todo-section-title" style={{ marginTop: 0 }}>
                <span>Daily Habits &amp; Routines</span>
                <span className="badge badge-streak">
                  {recurringHabits.filter((h) => h.isCompleted).length}/{recurringHabits.length} Done
                </span>
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
                        {habit.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                      </button>
                      <div>
                        <span className={`todo-title ${habit.isCompleted ? "completed" : ""}`}>
                          {habit.title}
                        </span>
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem", flexWrap: "wrap" }}>
                          {habit.streak > 0 && (
                            <span className="badge badge-streak" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                              <FlameIcon size={12} /> {habit.streak} {habit.streak === 1 ? "day" : "days"} streak
                            </span>
                          )}
                          {habit.reminderTime && (
                            <span className="badge badge-reminder">
                              {habit.reminderTime}
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
                      <TrashIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* One-off Tasks Section */}
          <section className="quick-expense-card" aria-label="Today's Tasks">
            <div className="todo-section-title" style={{ marginTop: 0 }}>
              <span>Today&apos;s Action Tasks</span>
              <span className="badge badge-info">
                {oneOffTasks.filter((t) => t.isCompleted).length}/{oneOffTasks.length} Done
              </span>
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
                        {task.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                      </button>
                      <div>
                        <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>
                          {task.title}
                        </span>
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem", flexWrap: "wrap" }}>
                          {task.isCarriedOver && (
                            <span className="badge badge-carried">
                              Carried Over
                            </span>
                          )}
                          {task.reminderTime && (
                            <span className="badge badge-reminder">
                              {task.reminderTime}
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
                      <TrashIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--secondary)", fontSize: "0.9rem", margin: "0.5rem 0 0", textAlign: "center", padding: "1.5rem 0" }}>
                No action tasks scheduled for this day.
              </p>
            )}
          </section>
        </div>

        {/* Right Column: Quick Add Task & Insights */}
        <div className="dashboard-aside sticky">
          {/* Quick Task Creation Form */}
          <section className="quick-expense-card" aria-label="Add Task">
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.85rem" }}>
              + Add New Task
            </h2>

            <form onSubmit={handleCreateTodo}>
              <div style={{ marginBottom: "0.85rem" }}>
                <input
                  type="text"
                  required
                  maxLength={150}
                  placeholder="Task title or habit name..."
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  aria-label="Task Title"
                />
              </div>

              <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}>
                <label className="toggle-label" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isRecurringInput}
                    onChange={(e) => setIsRecurringInput(e.target.checked)}
                  />
                  <span>Daily recurring habit (tracks streaks)</span>
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--secondary)", fontWeight: 600 }}>
                    ⏰ Reminder:
                  </span>
                  <input
                    type="time"
                    value={reminderTimeInput}
                    onChange={(e) => setReminderTimeInput(e.target.value)}
                    aria-label="Reminder Time"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending || !titleInput.trim()}
                style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", fontWeight: 600 }}
              >
                {isPending ? "Adding..." : "Create Task"}
              </button>
            </form>
          </section>

          {/* Automatic Carry-over Note */}
          <section className="surface" style={{ padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.9rem", textTransform: "uppercase", color: "var(--secondary)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <RefreshIcon size={14} /> Automatic Carry-Over
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0.45rem 0 0", lineHeight: 1.5 }}>
              Any unfinished one-off tasks from past days automatically roll over to today with an amber <strong>Carried Over</strong> badge. No tasks ever get lost or forgotten.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
