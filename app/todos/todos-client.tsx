"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, TrashIcon, FlameIcon, BellIcon, PencilIcon, PlusIcon } from "../components/icons";
import { Segmented } from "../components/segmented";
import { BarChart, ProgressRing } from "../components/charts";
import { Modal } from "../components/modal";
import { useToast } from "../components/toast";
import {
  createTodoAction,
  deleteTodoAction,
  getDailyTodosAction,
  getTodoHistoryAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import type { TodoDayStat, TodoItem } from "@/lib/todos";
import { TodoSpace } from "@/lib/validations/todos";
import { formatDMY, toISODate } from "@/lib/format-date";

type TaskTab = "daily" | "one-day";

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
  initialHistory: Record<TodoSpace, TodoDayStat[]>;
}

const HISTORY_DAYS = 14;

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
  initialHistory,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [currentDate, setCurrentDate] = useState(todayDate);
  const [tab, setTab] = useState<TaskTab>("daily");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [history, setHistory] = useState(initialHistory);

  const { showToast } = useToast();

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);

  const requestId = useRef(0);

  const currentTodos = todosMap[space];
  const isDaily = tab === "daily";
  // Daily tasks always belong to today; only the Today filter can browse other days.
  const activeDate = isDaily ? todayDate : currentDate;
  const visibleTodos = currentTodos.filter((t) => t.isRecurring === isDaily);
  const doneCount = visibleTodos.filter((t) => t.isCompleted).length;
  const percentage = visibleTodos.length ? Math.round((doneCount / visibleTodos.length) * 100) : 0;

  // Last N days for the active filter; days without a snapshot are shown as empty.
  const byDate = new Map(
    history[space].filter((h) => h.isRecurring === isDaily).map((h) => [h.date, h]),
  );
  const today = new Date(`${todayDate}T00:00:00`);
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (HISTORY_DAYS - 1 - i));
    const iso = toISODate(d);
    return { iso, label: String(d.getDate()), stat: byDate.get(iso) };
  });
  const tracked = days.filter((d) => d.stat);
  const avg = tracked.length
    ? Math.round(tracked.reduce((n, d) => n + (d.stat!.done / d.stat!.total) * 100, 0) / tracked.length)
    : 0;
  const perfectDays = tracked.filter((d) => d.stat!.done === d.stat!.total).length;
  const doneTotal = tracked.reduce((n, d) => n + d.stat!.done, 0);
  const bars = days.map((d) => ({
    label: d.label,
    value: d.stat ? (d.stat.done / d.stat.total) * 100 : 0,
    empty: !d.stat,
    highlight: d.iso === activeDate,
    title: d.stat ? `${formatDMY(d.iso)}: ${d.stat.done} of ${d.stat.total} done` : `${formatDMY(d.iso)}: no tasks`,
  }));

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

  // Loads both spaces (and their history) and swaps them in with one state update, so the list never flashes empty.
  const loadDay = async (date: string) => {
    const id = ++requestId.current;
    try {
      const [personal, business, hp, hb] = await Promise.all([
        getDailyTodosAction("personal", date),
        getDailyTodosAction("business", date),
        getTodoHistoryAction("personal"),
        getTodoHistoryAction("business"),
      ]);
      if (id === requestId.current) {
        setTodosMap({ personal: personal.todos, business: business.todos });
        setHistory({ personal: hp.history ?? [], business: hb.history ?? [] });
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  const handleDateChange = (daysDelta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + daysDelta);
    const newDateStr = toISODate(d);
    setCurrentDate(newDateStr);
    void loadDay(newDateStr);
  };

  const changeTab = (next: TaskTab) => {
    setTab(next);
    // Switching to Today shows the chosen day, so make sure its tasks are loaded.
    if (next === "one-day" && currentDate !== todayDate) void loadDay(currentDate);
    else if (next === "daily" && currentDate !== todayDate) void loadDay(todayDate);
  };

  const openForm = (todo?: TodoItem) => {
    setErrorMsg(null);
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setIsTaskModalOpen(true);
  };

  const closeForm = () => {
    setIsTaskModalOpen(false);
    setTitleInput("");
    setReminderTimeInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = titleInput.trim();
    if (!title || saving) return;
    const reminderTime = reminderTimeInput.trim() || null;
    setSaving(true);
    try {
      if (editing) {
        const before = editing;
        const res = await updateTodoAction({ id: before.id, title, reminderTime });
        if (res.success) {
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await updateTodoAction({ id: before.id, title: before.title, reminderTime: before.reminderTime });
              await loadDay(activeDate);
            },
          });
        }
      } else {
        const res = await createTodoAction({
          space,
          title,
          isRecurring: isDaily,
          dueDate: activeDate,
          reminderTime,
        });
        if (res.success && res.todo) {
          const createdId = res.todo.id;
          showToast({
            message: `Added "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await deleteTodoAction(createdId);
              await loadDay(activeDate);
            },
          });
        }
      }
      closeForm();
      await loadDay(activeDate);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setCompleted = (id: string, isCompleted: boolean) => {
    setTodosMap((prev) => ({
      ...prev,
      [space]: prev[space].map((t) => (t.id === id ? { ...t, isCompleted } : t)),
    }));
  };

  const handleToggleTodo = async (todo: TodoItem) => {
    const next = !todo.isCompleted;
    const date = activeDate;
    setCompleted(todo.id, next);
    try {
      await toggleTodoAction({ id: todo.id, isCompleted: next, currentDate: date });
      showToast({
        message: next ? `Done "${todo.title}"` : `Reopened "${todo.title}"`,
        actionLabel: "Undo",
        onAction: async () => {
          await toggleTodoAction({ id: todo.id, isCompleted: !next, currentDate: date });
          await loadDay(date);
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
    // Refresh to pick up the server-computed streak.
    await loadDay(date);
  };

  const handleDeleteTodo = async (target: TodoItem) => {
    setTodosMap((prev) => ({
      ...prev,
      [space]: prev[space].filter((t) => t.id !== target.id),
    }));

    try {
      const res = await deleteTodoAction(target.id);
      if (res.success) {
        showToast({
          message: `Deleted "${target.title}"`,
          actionLabel: "Undo",
          onAction: async () => {
            await createTodoAction({
              space: target.space,
              title: target.title,
              isRecurring: target.isRecurring,
              dueDate: target.dueDate,
              reminderTime: target.reminderTime,
            });
            await loadDay(activeDate);
          },
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
    await loadDay(activeDate);
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
          onChange={setSpace}
        />
        <Segmented
          label="Task type"
          value={tab}
          options={[
            { value: "daily", label: "Daily" },
            { value: "one-day", label: "Today" },
          ]}
          onChange={changeTab}
        />
      </div>

      {/* Web Push Notification Banner */}
      {pushSupported && !pushSubscribed && (
        <div className="push-toggle-card">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <BellIcon size={16} /> Task reminders
          </span>
          <button type="button" className="secondary btn-sm" onClick={handleEnablePush}>
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

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="tasks-title">
            <div className="section-head">
              <h2 id="tasks-title" className="section-title">
                {isDaily ? "Daily tasks" : "Today"}
              </h2>
              <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                <PlusIcon size={14} />
                Add task
              </button>
            </div>

            {!isDaily && (
              <div className="month-selector">
                <button
                  type="button"
                  className="month-nav-btn"
                  onClick={() => handleDateChange(-1)}
                  aria-label="Previous day"
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
                >
                  ›
                </button>
              </div>
            )}

            {visibleTodos.length > 0 ? (
              <div className="todo-list">
                {visibleTodos.map((task) => (
                  <div key={task.id} className="todo-row">
                    <button
                      type="button"
                      className={`todo-checkbox-btn ${task.isCompleted ? "checked" : ""}`}
                      onClick={() => handleToggleTodo(task)}
                      aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                    >
                      {task.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                    </button>

                    <div className="todo-main">
                      <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>
                        {task.title}
                      </span>
                      {((!isDaily && task.isCarriedOver) || task.reminderTime) && (
                        <div className="badge-row">
                          {!isDaily && task.isCarriedOver && (
                            <span className="badge badge-carried">Carried over</span>
                          )}
                          {task.reminderTime && (
                            <span className="badge badge-reminder">{task.reminderTime}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {isDaily && task.streak > 0 && (
                      <span className="streak number-tabular" title={`${task.streak}-day streak`}>
                        <FlameIcon size={15} />
                        {task.streak}
                      </span>
                    )}

                    <button
                      type="button"
                      className="delete-icon-btn edit"
                      onClick={() => openForm(task)}
                      aria-label={`Edit ${task.title}`}
                      title="Edit"
                    >
                      <PencilIcon size={17} />
                    </button>
                    <button
                      type="button"
                      className="delete-icon-btn"
                      onClick={() => handleDeleteTodo(task)}
                      aria-label={`Delete ${task.title}`}
                      title="Delete"
                    >
                      <TrashIcon size={17} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">{isDaily ? "No daily tasks yet." : "Nothing planned for this day."}</p>
            )}
          </section>
        </div>

        <div className="dashboard-aside">
          <section className="surface" aria-labelledby="progress-title">
            <div className="section-head">
              <h2 id="progress-title" className="section-title">
                Progress
              </h2>
            </div>
            <div className="dash-hero">
              <ProgressRing percent={percentage} label={`of ${isDaily ? "daily" : "day's"} tasks done`} />
              <div className="dash-hero-text">
                <span className="todo-stats-fraction number-tabular">
                  {doneCount} of {visibleTodos.length} done
                </span>
                <span className="muted">
                  {isDaily || currentDate === todayDate ? "Today" : formatDMY(currentDate)}
                </span>
              </div>
            </div>
          </section>

          <section className="surface" aria-labelledby="history-title">
            <div className="section-head">
              <h2 id="history-title" className="section-title">
                Last {HISTORY_DAYS} days
              </h2>
            </div>
            <div className="stat-row">
              <div className="stat-tile">
                <strong className="number-tabular">{tracked.length ? `${avg}%` : "–"}</strong>
                <span>Average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">{perfectDays}</strong>
                <span>Perfect days</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">{doneTotal}</strong>
                <span>Tasks done</span>
              </div>
            </div>
            <BarChart
              data={bars}
              summary={`Completion per day over the last ${HISTORY_DAYS} days, average ${avg}%`}
            />
          </section>
        </div>
      </div>

      <Modal
        isOpen={isTaskModalOpen}
        onClose={closeForm}
        title={editing ? "Edit task" : isDaily ? "New daily task" : "New task"}
      >
        <form onSubmit={handleSubmit}>
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

          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !titleInput.trim()}>
              {editing ? "Save" : "Add task"}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
