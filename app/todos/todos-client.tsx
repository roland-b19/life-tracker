"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, TrashIcon, FlameIcon, BellIcon, LockIcon, PencilIcon, PlusIcon } from "../components/icons";
import { AnimatedNumber } from "../components/animated-number";
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
type Period = "7" | "30" | "90";
type Metric = "rate" | "done";

const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];
const METRICS: { value: Metric; label: string }[] = [
  // Bar height: share of that day's tasks completed, or how many were completed.
  { value: "rate", label: "% done" },
  { value: "done", label: "Tasks done" },
];
// Sparse day labels so 30 and 90 bars stay readable.
const LABEL_EVERY: Record<Period, number> = { "7": 1, "30": 5, "90": 15 };

const dayLabel = (iso: string, weekday: "short" | "long" = "short") =>
  `${new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday })} ${formatDMY(iso)}`;

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
  initialHistory: Record<TodoSpace, TodoDayStat[]>;
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
  initialHistory,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [date, setDate] = useState(todayDate);
  const [tab, setTab] = useState<TaskTab>("daily");
  const [period, setPeriod] = useState<Period>("30");
  const [metric, setMetric] = useState<Metric>("rate");
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

  const isDaily = tab === "daily";
  // Past days are read-only: they show what was done, never edit, delete or tick.
  const isPast = date < todayDate;
  const visibleTodos = todosMap[space].filter(
    (t) => t.isRecurring === isDaily && (!isPast || !t.isRecurring || toISODate(new Date(t.createdAt)) <= date),
  );

  const byDate = new Map(history[space].filter((h) => h.isRecurring === isDaily).map((h) => [h.date, h]));
  // Past days use the snapshot taken that day; today and later use the live list.
  const snapshot = isPast ? byDate.get(date) : undefined;
  const doneCount = isPast ? (snapshot?.done ?? 0) : visibleTodos.filter((t) => t.isCompleted).length;
  const totalCount = isPast ? (snapshot?.total ?? 0) : visibleTodos.length;
  const noRecord = isPast && !snapshot;
  // Nothing due counts as everything done.
  const percentage = totalCount ? Math.round((doneCount / totalCount) * 100) : 100;

  // History for the chosen period; days without a snapshot are shown as empty.
  const span = Number(period);
  const today = new Date(`${todayDate}T00:00:00`);
  const days = Array.from({ length: span }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (span - 1 - i));
    const iso = toISODate(d);
    return { iso, day: d.getDate(), stat: byDate.get(iso) };
  });
  const tracked = days.filter((d) => d.stat);
  const avg = tracked.length
    ? Math.round(tracked.reduce((n, d) => n + (d.stat!.done / d.stat!.total) * 100, 0) / tracked.length)
    : 0;
  const perfectDays = tracked.filter((d) => d.stat!.done === d.stat!.total).length;
  const doneTotal = tracked.reduce((n, d) => n + d.stat!.done, 0);
  const maxDone = Math.max(1, ...tracked.map((d) => d.stat!.done));
  const every = LABEL_EVERY[period];
  const bars = days.map((d, i) => ({
    label: (span - 1 - i) % every === 0 ? String(d.day) : "",
    value: d.stat ? (metric === "rate" ? (d.stat.done / d.stat.total) * 100 : d.stat.done) : 0,
    empty: !d.stat,
    highlight: d.iso === date,
    title: d.stat ? `${dayLabel(d.iso)}: ${d.stat.done} of ${d.stat.total} done` : `${dayLabel(d.iso)}: no record`,
  }));

  // Check push notification availability on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
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

  const goTo = (next: string) => {
    setDate(next);
    void loadDay(next);
  };

  const stepDay = (delta: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + delta);
    goTo(toISODate(d));
  };

  const changeTab = (next: TaskTab) => {
    setTab(next);
    // Daily tasks have no future: coming back from a future one-off day lands on today.
    if (next === "daily" && date > todayDate) goTo(todayDate);
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
              await loadDay(date);
            },
          });
        }
      } else {
        const res = await createTodoAction({
          space,
          title,
          isRecurring: isDaily,
          dueDate: date,
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
              await loadDay(date);
            },
          });
        }
      }
      closeForm();
      await loadDay(date);
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
            await loadDay(date);
          },
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
    await loadDay(date);
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

      <div className="toolbar dash">
        <div className="toolbar-group">
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
        <div className="month-selector" role="group" aria-label="Day">
          <button type="button" className="month-nav-btn" onClick={() => stepDay(-1)} aria-label="Previous day">
            ‹
          </button>
          <button
            type="button"
            className="month-label-btn number-tabular"
            onClick={() => goTo(todayDate)}
            disabled={date === todayDate}
            title={date === todayDate ? undefined : "Back to today"}
          >
            {dayLabel(date)}
          </button>
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => stepDay(1)}
            disabled={isDaily && date >= todayDate}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      {pushSupported && !pushSubscribed && (
        <div className="push-toggle-card">
          <span className="push-toggle-label">
            <BellIcon size={16} /> Task reminders
          </span>
          <button type="button" className="secondary btn-sm" onClick={handleEnablePush}>
            Enable
          </button>
        </div>
      )}

      {pushStatusMsg && <p className="status-note">{pushStatusMsg}</p>}

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
                {isDaily ? "Daily tasks" : "Tasks"}
              </h2>
              {!isPast && (
                <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                  <PlusIcon size={14} />
                  Add task
                </button>
              )}
            </div>

            {isPast && (
              <p className="readonly-note">
                <LockIcon size={13} /> Past days are read-only
              </p>
            )}

            {visibleTodos.length > 0 ? (
              <div className="todo-list">
                {visibleTodos.map((task) => (
                  <div key={task.id} className="todo-row">
                    {isPast ? (
                      !isDaily && (
                        <span className={`todo-checkbox-btn static ${task.isCompleted ? "checked" : ""}`} aria-hidden="true">
                          {task.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        className={`todo-checkbox-btn ${task.isCompleted ? "checked" : ""}`}
                        onClick={() => handleToggleTodo(task)}
                        aria-label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                      >
                        {task.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                      </button>
                    )}

                    <div className="todo-main">
                      <span className={`todo-title ${!isPast && task.isCompleted ? "completed" : ""}`}>
                        {task.title}
                        {isPast && !isDaily && (
                          <span className="visually-hidden">{task.isCompleted ? ", done" : ", not done"}</span>
                        )}
                      </span>
                      {((!isDaily && task.isCarriedOver) || task.reminderTime) && (
                        <div className="badge-row">
                          {!isDaily && task.isCarriedOver && <span className="badge badge-carried">Carried over</span>}
                          {task.reminderTime && <span className="badge badge-reminder">{task.reminderTime}</span>}
                        </div>
                      )}
                    </div>

                    {isDaily && task.streak > 0 && (
                      <span className="streak number-tabular" title={`${task.streak}-day streak`}>
                        <FlameIcon size={15} />
                        {task.streak}
                      </span>
                    )}

                    {!isPast && (
                      <>
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
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">
                {isDaily ? "No daily tasks yet." : isPast ? "Nothing was planned for this day." : "Nothing planned for this day."}
              </p>
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
            {noRecord ? (
              <p className="empty-note">No record for {dayLabel(date, "long")}.</p>
            ) : (
              <div className="dash-hero" key={`${date}-${space}-${tab}`}>
                <ProgressRing percent={percentage} label={`of ${isDaily ? "daily" : "the day's"} tasks done`} />
                <div className="dash-hero-text">
                  <span className="todo-stats-fraction number-tabular">
                    <AnimatedNumber value={doneCount} /> of <AnimatedNumber value={totalCount} /> done
                  </span>
                  <span className="muted">{date === todayDate ? "Today" : dayLabel(date, "long")}</span>
                </div>
              </div>
            )}
          </section>

          <section className="surface" aria-labelledby="history-title">
            <div className="section-head">
              <h2 id="history-title" className="section-title">
                Last {span} days
              </h2>
            </div>
            <div className="chart-controls">
              <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
              <Segmented label="Show" value={metric} options={METRICS} onChange={setMetric} />
            </div>
            <div className="stat-row">
              <div className="stat-tile">
                <strong className="number-tabular">
                  {tracked.length ? <AnimatedNumber value={avg} format={(n) => `${Math.round(n)}%`} /> : "–"}
                </strong>
                <span>Average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  <AnimatedNumber value={perfectDays} />
                </strong>
                <span>Perfect days</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  <AnimatedNumber value={doneTotal} />
                </strong>
                <span>Tasks done</span>
              </div>
            </div>
            <BarChart
              key={`${period}-${metric}-${space}-${tab}-${date}`}
              data={bars}
              max={metric === "rate" ? 100 : maxDone}
              summary={`${metric === "rate" ? "Completion rate" : "Tasks done"} per day over the last ${span} days, average ${avg}%. Choose a day to open it.`}
              onSelect={(i) => goTo(days[i].iso)}
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
