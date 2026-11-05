"use client";

import { useEffect, useState, useTransition } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, TrashIcon, FlameIcon, BellIcon, PlusIcon } from "../components/icons";
import { Segmented } from "../components/segmented";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import {
  createTodoAction,
  deleteTodoAction,
  getDailyTodosAction,
  savePushSubscriptionAction,
  toggleTodoAction,
} from "@/app/actions/todos";
import { TodoItem } from "@/lib/todos";
import { TodoSpace } from "@/lib/validations/todos";
import { formatDMY } from "@/lib/format-date";

type TaskTab = "daily" | "one-day";

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [currentDate, setCurrentDate] = useState(todayDate);
  const [tab, setTab] = useState<TaskTab>("daily");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const { showToast } = useToast();

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  const currentTodos = todosMap[space];
  const isDaily = tab === "daily";
  const visibleTodos = currentTodos.filter((t) => t.isRecurring === isDaily);
  const doneCount = visibleTodos.filter((t) => t.isCompleted).length;
  const percentage = visibleTodos.length ? Math.round((doneCount / visibleTodos.length) * 100) : 0;

  // Check push notification availability on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          setPushSupported(true);
          if (Notification.permission === "granted") {
            setPushSubscribed(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  const refreshDailyData = (date: string, targetSpace = space) => {
    startTransition(async () => {
      try {
        const res = await getDailyTodosAction(targetSpace, date);
        if (res.success && res.todos) {
          setTodosMap((prev) => ({ ...prev, [targetSpace]: res.todos }));
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
          isRecurring: isDaily,
          dueDate: currentDate,
          reminderTime: reminderTimeInput.trim() || undefined,
        });

        if (res.success && res.todo) {
          const createdTitle = titleInput.trim();
          setTitleInput("");
          setReminderTimeInput("");
          setIsTaskModalOpen(false);
          showToast({
            message: `Added "${createdTitle}"`,
            type: "success",
          });
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
    // Optimistic toggle
    const nextCompleted = !todo.isCompleted;
    setTodosMap((prev) => ({
      ...prev,
      [space]: prev[space].map((t) => (t.id === todo.id ? { ...t, isCompleted: nextCompleted } : t)),
    }));

    startTransition(async () => {
      try {
        const res = await toggleTodoAction({
          id: todo.id,
          isCompleted: nextCompleted,
          currentDate,
        });

        if (res.success) {
          refreshDailyData(currentDate, space);
        } else {
          // Revert if error
          refreshDailyData(currentDate, space);
        }
      } catch (err: unknown) {
        refreshDailyData(currentDate, space);
        if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      }
    });
  };

  const handleDeleteTodo = async (id: string) => {
    const target = currentTodos.find((t) => t.id === id);
    if (!target) return;

    // Optimistic removal
    setTodosMap((prev) => ({
      ...prev,
      [space]: prev[space].filter((t) => t.id !== id),
    }));

    startTransition(async () => {
      try {
        const res = await deleteTodoAction(id);
        if (res.success) {
          showToast({
            message: `Deleted "${target.title}"`,
            actionLabel: "Undo",
            onAction: async () => {
              await createTodoAction({
                space,
                title: target.title,
                isRecurring: target.isRecurring,
                dueDate: target.dueDate,
                reminderTime: target.reminderTime || undefined,
              });
              refreshDailyData(currentDate, space);
            },
          });
          refreshDailyData(currentDate, space);
        }
      } catch (err: unknown) {
        // Revert
        setTodosMap((prev) => ({
          ...prev,
          [space]: [...prev[space], target],
        }));
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

      <div className="toolbar">
        <Segmented
          label="Space"
          value={space}
          options={[
            { value: "personal", label: "Personal" },
            { value: "business", label: "Business" },
          ]}
          onChange={handleSpaceChange}
        />
        <button
          type="button"
          className="btn-open-modal"
          onClick={() => {
            setErrorMsg(null);
            setIsTaskModalOpen(true);
          }}
          aria-label="Add task"
        >
          <PlusIcon size={16} />
          <span>Add</span>
        </button>
      </div>

      {/* Web Push Notification Banner */}
      {pushSupported && !pushSubscribed && (
        <div className="push-toggle-card">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <BellIcon size={16} /> Task reminders
          </span>
          <button
            type="button"
            className="secondary btn-sm"
            onClick={handleEnablePush}
          >
            Enable
          </button>
        </div>
      )}

      {pushStatusMsg && (
        <p className="muted" style={{ fontSize: "0.875rem", margin: "0 0 1.25rem" }}>
          {pushStatusMsg}
        </p>
      )}

      {errorMsg && (
        <div className="error" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="dashboard-main">
        <section className="todo-hero-card" aria-label="Day overview">
          <div className="month-selector">
            <button
              type="button"
              className="month-nav-btn"
              onClick={() => handleDateChange(-1)}
              aria-label="Previous day"
              disabled={isPending}
            >
              ‹
            </button>
            <span className="month-label">
              {currentDate === todayDate ? "Today" : formatDMY(currentDate)}
            </span>
            <button
              type="button"
              className="month-nav-btn"
              onClick={() => handleDateChange(1)}
              aria-label="Next day"
              disabled={isPending}
            >
              ›
            </button>
          </div>

          <div className="todo-stats-header">
            <span className="todo-stats-rate number-tabular">{percentage}%</span>
            <span className="todo-stats-fraction number-tabular">
              {doneCount} of {visibleTodos.length} done
            </span>
          </div>

          <div className="progress-track" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${percentage}%` }} />
          </div>
        </section>

        <section className="quick-expense-card" aria-label="Tasks">
          <Segmented
            label="Task type"
            value={tab}
            options={[
              { value: "daily", label: "Daily" },
              { value: "one-day", label: "One day" },
            ]}
            onChange={setTab}
          />

          {isPending && visibleTodos.length === 0 && (
            <div style={{ display: "grid", gap: "0.5rem", paddingTop: "1rem" }}>
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          )}

          {visibleTodos.length > 0 ? (
            <div style={{ marginTop: "0.5rem" }}>
              {visibleTodos.map((task) => (
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
                      {(task.streak > 0 || task.isCarriedOver || task.reminderTime) && (
                        <div className="badge-row">
                          {isDaily && task.streak > 0 && (
                            <span className="badge badge-streak number-tabular">
                              <FlameIcon size={12} /> {task.streak} {task.streak === 1 ? "day" : "days"}
                            </span>
                          )}
                          {!isDaily && task.isCarriedOver && (
                            <span className="badge badge-carried">Carried over</span>
                          )}
                          {task.reminderTime && (
                            <span className="badge badge-reminder">{task.reminderTime}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="delete-icon-btn"
                    onClick={() => handleDeleteTodo(task.id)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            !isPending && (
              <p className="empty-note">{isDaily ? "No daily tasks yet." : "Nothing planned for this day."}</p>
            )
          )}
        </section>
      </div>

      {/* Modal: Create Task with Blurred Backdrop */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={isDaily ? "New daily task" : "New task"}
      >
        <form onSubmit={handleCreateTodo}>
          <div className="form-stack">
            <label>
              Title
              <input
                type="text"
                required
                maxLength={150}
                placeholder="e.g. Morning workout"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
              />
            </label>
            <label>
              Reminder (optional)
              <input
                type="time"
                value={reminderTimeInput}
                onChange={(e) => setReminderTimeInput(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsTaskModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !titleInput.trim()}
              style={{ flex: 2 }}
            >
              {isPending ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
