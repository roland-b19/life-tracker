"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { CategoriesCard, categoryLabel, groupOrder } from "../components/categories-card";
import { Navigation } from "../components/navigation";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, FlameIcon, BellIcon, LockIcon, MoveIcon, PencilIcon, PlusIcon } from "../components/icons";
import { ListBox, useMore } from "../components/lists";
import { Segmented } from "../components/segmented";
import { BarChart, ProgressRing } from "../components/charts";
import { Modal } from "../components/modal";
import { DatePicker } from "../components/date-picker";
import { useToast } from "../components/toast";
import { isPushEnabled } from "@/lib/features";
import {
  createTodoAction,
  deletePushSubscriptionAction,
  deleteTodoAction,
  loadTodosViewAction,
  moveTodoAction,
  restoreTodoAction,
  revertMoveTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import type { TodoDayStat, TodoItem } from "@/lib/todos";
import { DEV_EDIT_PAST, PLAN_AHEAD_DAYS, TodoSpace } from "@/lib/validations/todos";
import { addDays, dayLabel, toISODate } from "@/lib/format-date";
import { streakOn } from "@/lib/streak";
import { compareTodos } from "@/lib/todo-order";

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
  { value: "rate", label: "Rate" },
  { value: "done", label: "Count" },
];
// Sparse day labels so 30 and 90 bars stay readable.
const LABEL_EVERY: Record<Period, number> = { "7": 1, "30": 5, "90": 15 };

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
  initialHistory: Record<TodoSpace, TodoDayStat[]>;
  initialPlanned: Record<TodoSpace, string[]>;
  initialCategories: Record<TodoSpace, string[]>;
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
  initialHistory,
  initialPlanned,
  initialCategories,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [date, setDate] = useState(todayDate);
  const [tab, setTab] = useState<TaskTab>("daily");
  const [period, setPeriod] = useState<Period>("30");
  const [metric, setMetric] = useState<Metric>("rate");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [planned, setPlanned] = useState(initialPlanned);
  const [categories, setCategories] = useState(initialCategories);
  const [moving, setMoving] = useState<TodoItem | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const { showToast } = useToast();
  // The list shows this view, which follows the controls once the day's tasks have loaded.
  const [view, setView] = useState({
    space: "personal" as TodoSpace,
    tab: "daily" as TaskTab,
    date: todayDate,
  });
  const viewId = useRef(0);

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("other");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [saving, setSaving] = useState(false);
  // Flows that finish seconds later (Undo, a refresh) read the controls as they are then.
  const latest = useRef({ date, tab });
  useEffect(() => {
    latest.current = { date, tab };
  });

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Bumped by every load and by every change made on screen, so an older refresh never lands over a newer state.
  const requestId = useRef(0);
  // The load a day switch started; a later switch that needs no load of its own waits for it.
  const loading = useRef<Promise<void>>(Promise.resolve());

  const isDaily = tab === "daily";
  // Both lists look a week ahead: one-off tasks to plan them, daily ones to see what is coming.
  const maxDate = addDays(todayDate, PLAN_AHEAD_DAYS);
  const tomorrow = addDays(todayDate, 1);
  // Past days can be ticked but not edited, except in dev builds, for testing.
  const isPast = date < todayDate;
  const editable = !isPast || DEV_EDIT_PAST;
  // A repeating task's dueDate is its first day: it is not on the days before it.
  const visibleFor = (s: TodoSpace, daily: boolean, day: string) =>
    todosMap[s].filter((t) => t.isRecurring === daily && (!t.isRecurring || t.dueDate <= day));
  const listDaily = view.tab === "daily";
  const listPast = view.date < todayDate;
  const listEditable = !listPast || DEV_EDIT_PAST;
  // A daily task is ticked on its day or later, never ahead of time.
  const listTickable = !(listDaily && view.date > todayDate);
  // The daily list shows its tasks under their category (each group in the list's own order); the Today list is flat.
  const listTodos = (() => {
    const list = visibleFor(view.space, listDaily, view.date);
    return listDaily ? groupOrder(categories[view.space], list).flatMap((c) => list.filter((t) => t.category === c)) : list;
  })();
  const [shownTodos, moreTodos] = useMore(listTodos);
  // Whether a task belongs on the list the controls show now.
  const shows = (t: TodoItem) => {
    const { date: day, tab: tb } = latest.current;
    if (t.isRecurring !== (tb === "daily")) return false;
    return t.isRecurring ? t.dueDate <= day : t.dueDate === day;
  };
  const whenLabel = (day: string) => (day === todayDate ? "Today" : day === tomorrow ? "Tomorrow" : dayLabel(day));

  const byDate = new Map(history[space].filter((h) => h.isRecurring === isDaily).map((h) => [h.date, h]));
  // Progress counts the list on screen (`view`), so it never shows the last day's numbers while the next one loads.
  // A day with no tasks shows only a note, no ring.
  const progressTodos = visibleFor(view.space, listDaily, view.date);
  const doneCount = progressTodos.filter((t) => t.isCompleted).length;
  const totalCount = progressTodos.length;
  const percentage = Math.round((doneCount / (totalCount || 1)) * 100);

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
  // An even top keeps the axis's middle number whole.
  const maxDone = 2 * Math.ceil(Math.max(1, ...tracked.map((d) => d.stat!.done)) / 2);
  const every = LABEL_EVERY[period];
  const bars = days.map((d, i) => ({
    label: (span - 1 - i) % every === 0 ? String(d.day) : "",
    value: d.stat ? (metric === "rate" ? (d.stat.done / d.stat.total) * 100 : d.stat.done) : 0,
    empty: !d.stat,
    highlight: d.iso === date,
    tip: d.stat && (metric === "rate" ? `${Math.round((d.stat.done / d.stat.total) * 100)}%` : `${d.stat.done} done`),
    title: d.stat ? `${dayLabel(d.iso)}: ${d.stat.done} of ${d.stat.total} done` : `${dayLabel(d.iso)}: no record`,
  }));

  // Check push notification availability on mount
  useEffect(() => {
    if (isPushEnabled() && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
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
  const loadDay = async (at: { date: string } = latest.current) => {
    const id = ++requestId.current;
    try {
      const view = await loadTodosViewAction(at.date);
      if (id === requestId.current) {
        setTodosMap({ personal: view.daily[0].todos, business: view.daily[1].todos });
        setHistory({ personal: view.history[0] ?? [], business: view.history[1] ?? [] });
        setPlanned({ personal: view.planned[0], business: view.planned[1] });
      }
    } catch {
      showToast({ message: "Failed to load tasks", type: "warning" });
    }
  };

  // The controls switch at once; the list follows once the new day has loaded.
  const switchView = (next: { space?: TodoSpace; tab?: TaskTab; date?: string }) => {
    const target = { space, tab, date, ...next };
    if (target.space === space && target.tab === tab && target.date === date) return;
    setSpace(target.space);
    setTab(target.tab);
    setDate(target.date);
    const n = ++viewId.current;
    const settled = target.date !== date ? (loading.current = loadDay(target)) : loading.current;
    void settled.then(() => {
      if (n === viewId.current) setView(target);
    });
  };

  const goTo = (next: string) => switchView({ date: next });

  const stepDay = (delta: number) => goTo(addDays(date, delta));

  // Undone tasks carry over to today, so the Today tab never shows a past day.
  const changeTab = (next: TaskTab) =>
    switchView({ tab: next, date: next === "daily" || date >= todayDate ? date : todayDate });

  const openForm = (todo?: TodoItem) => {
    setTitleError(null);
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setCategoryInput(todo?.category ?? "other");
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
    const recurrencePattern = (editing ? editing.isRecurring : isDaily) ? "daily" : "none";
    setTitleError(null);
    setSaving(true);
    try {
      if (editing) {
        const before = editing;
        // Only a daily task has a category to pick; a one-off keeps the one it has.
        const category = before.isRecurring ? categoryInput : before.category;
        const after = { ...before, title, reminderTime, category };
        const res = await updateTodoAction({ id: before.id, title, reminderTime, category });
        if ("error" in res) return setTitleError(res.error);
        if (res.success) {
          ++requestId.current;
          replace(after);
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              ++requestId.current;
              replace(before);
              const undone = await updateTodoAction({
                id: before.id,
                title: before.title,
                reminderTime: before.reminderTime,
                category: before.category,
              }).catch(() => null);
              if (!undone || !("success" in undone) || !undone.success) {
                replace(after);
                showToast({ message: "Failed to undo the edit", type: "warning" });
              }
              await loadDay();
            },
          });
        }
      } else {
        const res = await createTodoAction({
          space,
          title,
          isRecurring: isDaily,
          recurrencePattern,
          // A daily task starts on the day it is added, whichever day is on screen.
          dueDate: isDaily ? todayDate : date,
          reminderTime,
          category: isDaily ? categoryInput : "other",
        });
        if (!res.success) return setTitleError(res.error); // the form stays open to fix the title
        if (res.todo) {
          const created = res.todo;
          ++requestId.current;
          if (shows(created)) putBack(created);
          showToast({
            message: `Added "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              ++requestId.current;
              drop(created);
              const gone = await deleteTodoAction(created.id, date).then(
                (r) => r.success,
                () => false,
              );
              if (!gone) {
                if (shows(created)) putBack(created);
                showToast({ message: "Failed to undo", type: "warning" });
              }
              await loadDay();
            },
          });
        }
      }
      closeForm();
      await loadDay();
    } catch {
      setTitleError("Failed to save task"); // the form stays open
    } finally {
      setSaving(false);
    }
  };

  // The streak moves with the tick, counted as the server counts it.
  const setCompleted = (task: TodoItem, isCompleted: boolean, day: string) => {
    const apply = (list: TodoItem[]) =>
      list
        .map((t) => {
          if (t.id !== task.id) return t;
          const next = { ...t, isCompleted, completedAt: isCompleted ? new Date() : null };
          if (!t.isRecurring) return next;
          const doneDates = isCompleted ? [...new Set([...t.doneDates, day])].sort() : t.doneDates.filter((d) => d !== day);
          return { ...next, doneDates, streak: streakOn(new Set(doneDates), day) };
        })
        .sort(compareTodos);
    setTodosMap((prev) => ({ ...prev, [task.space]: apply(prev[task.space]) }));
  };

  // `day` is the day it was ticked on, which may no longer be the one on screen when Undo comes.
  const toggle = async (todo: TodoItem, next: boolean, day: string, withUndo: boolean) => {
    ++requestId.current;
    if (latest.current.date === day) setCompleted(todo, next, day);
    if (withUndo) {
      showToast({
        message: next ? `Completed "${todo.title}"` : `Marked "${todo.title}" not done`,
        actionLabel: "Undo",
        onAction: () => toggle(todo, !next, day, false),
      });
    }
    try {
      await toggleTodoAction({ id: todo.id, isCompleted: next, currentDate: day });
    } catch {
      showToast({ message: "Failed to update task", type: "warning" });
    }
    // Refresh to pick up the server-computed streak.
    await loadDay();
  };

  const handleToggleTodo = (todo: TodoItem) => toggle(todo, !todo.isCompleted, date, true);

  // Back in the list where the server would sort it.
  const putBack = (task: TodoItem) =>
    setTodosMap((prev) => ({
      ...prev,
      [task.space]: prev[task.space].some((t) => t.id === task.id) ? prev[task.space] : [...prev[task.space], task].sort(compareTodos),
    }));

  const replace = (task: TodoItem) =>
    setTodosMap((prev) => ({ ...prev, [task.space]: prev[task.space].map((t) => (t.id === task.id ? task : t)).sort(compareTodos) }));

  const drop = (task: TodoItem) => {
    setTodosMap((prev) => ({ ...prev, [task.space]: prev[task.space].filter((t) => t.id !== task.id) }));
  };

  // What the server needs to put a task back as it was.
  const snapshot = ({ id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, doneDates, createdAt }: TodoItem) => ({
    id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, doneDates, createdAt,
  });

  // Moving always takes the row out of this list; Undo puts the task back as it was (a new task a move created is deleted).
  const handleMove = async (task: TodoItem, recurrencePattern: string, day: string) => {
    setMoveOpen(false);
    if (recurrencePattern === "none" && !task.isRecurring && day === task.dueDate) return;
    ++requestId.current;
    drop(task);
    const res = await moveTodoAction({ id: task.id, recurrencePattern, dueDate: day }).catch(() => null);
    if (!res?.success) {
      if (shows(task)) putBack(task); // unless the list on screen changed meanwhile
      showToast({ message: res && "error" in res ? res.error : "Failed to move task", type: "warning" });
      return;
    }
    const createdId = res.todo && res.todo.id !== task.id ? res.todo.id : undefined;
    showToast({
      message: `Moved "${task.title}" to ${recurrencePattern === "none" ? whenLabel(day) : "Daily"}`,
      type: "success",
      actionLabel: "Undo",
      onAction: async () => {
        ++requestId.current;
        if (shows(task)) putBack(task);
        const back = await revertMoveTodoAction(snapshot(task), createdId).catch(() => null);
        if (!back?.success) {
          if (shows(task)) drop(task);
          showToast({ message: back && "error" in back ? back.error : "Failed to undo the move", type: "warning" });
        }
        await loadDay();
      },
    });
    await loadDay();
  };

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  // Undo restores the same task, streak included.
  const handleDeleteTodo = (target: TodoItem) => {
    ++requestId.current;
    drop(target);
    const deleted = deleteTodoAction(target.id, date).then(
      (res) => res.success,
      () => false,
    );
    showToast({
      message: `Removed "${target.title}"`,
      actionLabel: "Undo",
      onAction: async () => {
        ++requestId.current;
        // Only onto the list it was on, if that is still the one on screen.
        if (shows(target)) putBack(target);
        if (!(await deleted)) return; // the delete never happened
        const back = await restoreTodoAction(snapshot(target)).catch(() => null);
        if (!back?.success) {
          if (shows(target)) drop(target);
          showToast({ message: back && "error" in back ? back.error : "Failed to restore task", type: "warning" });
        }
        await loadDay();
      },
    });
    void deleted.then((ok) => {
      if (ok) return void loadDay();
      if (shows(target)) putBack(target);
      showToast({ message: "Failed to remove task", type: "warning" });
    });
  };

  const handleEnablePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        showToast({ message: "Failed to enable reminders (notifications are blocked)", type: "warning" });
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      let sub: PushSubscription | null = null;
      if (vapidPublicKey) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey });
        const res = await savePushSubscriptionAction({ subscription: sub.toJSON() });
        if (!res.success) throw new Error("not saved");
      }
      setPushSubscribed(true);
      const enabled = sub;
      showToast({
        message: "Reminders enabled",
        type: "success",
        actionLabel: "Undo",
        // Forgets the subscription here and on the server, so no reminder arrives.
        onAction: async () => {
          setPushSubscribed(false);
          try {
            if (enabled) {
              await deletePushSubscriptionAction(enabled.endpoint);
              await enabled.unsubscribe();
            }
          } catch {
            setPushSubscribed(true);
            showToast({ message: "Failed to turn reminders off", type: "warning" });
          }
        },
      });
    } catch {
      showToast({ message: "Failed to enable reminders", type: "warning" });
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
            onChange={(next) => switchView({ space: next })}
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
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => stepDay(-1)}
            disabled={!isDaily && date <= todayDate}
            aria-label="Previous day"
          >
            <ChevronLeftIcon size={17} />
          </button>
          <DatePicker
            mode="day"
            value={date}
            today={todayDate}
            max={maxDate}
            min={isDaily ? undefined : todayDate}
            marked={isDaily ? undefined : planned[space].filter((d) => d > todayDate)}
            label={dayLabel(date)}
            onChange={goTo}
          />
          <button
            type="button"
            className="month-nav-btn"
            onClick={() => stepDay(1)}
            disabled={date >= maxDate}
            aria-label="Next day"
          >
            <ChevronRightIcon size={17} />
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="surface" aria-labelledby="tasks-title">
            <div className="section-head">
              <h2 id="tasks-title" className="section-title">
                {isDaily ? "Daily tasks" : "Tasks"} <span className="muted number-tabular">{listTodos.length}</span>
              </h2>
              <span className="head-actions below">
                {editable && (
                  <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                    <PlusIcon size={14} />
                    Add task
                  </button>
                )}
              </span>
            </div>

            {isPast && !DEV_EDIT_PAST && (
              <p className="readonly-note">
                <LockIcon size={13} /> Past days can be ticked, not edited
              </p>
            )}
            {isDaily && date > todayDate && (
              <p className="readonly-note">
                <LockIcon size={13} /> Daily tasks are ticked on the day
              </p>
            )}

            <ListBox wash className="todo-list">
              {listTodos.length > 0 ? (
                <>
                {shownTodos.map((task, i) => (
                  <Fragment key={task.id}>
                  {listDaily && task.category !== shownTodos[i - 1]?.category && shownTodos.some((x) => x.category !== "other") && (
                    <h3 className="group-label">{categoryLabel(task.category)}</h3>
                  )}
                  <div className="todo-row">
                    {!listTickable ? (
                      <span className={`todo-checkbox-btn static ${task.isCompleted ? "checked" : ""}`} aria-hidden="true">
                        {task.isCompleted && <CheckIcon size={12} strokeWidth={3} />}
                      </span>
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
                      <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>{task.title}</span>
                      {((!listDaily && task.isCarriedOver) || task.reminderTime) && (
                        <div className="badge-row">
                          {!listDaily && task.isCarriedOver && <span className="badge badge-carried">Carried over</span>}
                          {task.reminderTime && <span className="badge badge-reminder">{task.reminderTime}</span>}
                        </div>
                      )}
                    </div>

                    {listDaily && task.streak > 0 && (
                      <span className="streak number-tabular" title={`${task.streak}-day streak`}>
                        <FlameIcon size={15} />
                        {task.streak}
                      </span>
                    )}

                    {listEditable && (
                      <>
                        <button
                          type="button"
                          className="delete-icon-btn edit"
                          onClick={() => {
                            setMoving(task);
                            setMoveOpen(true);
                          }}
                          aria-label={`Move ${task.title}`}
                          title="Move"
                        >
                          <MoveIcon size={17} />
                        </button>
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
                  </Fragment>
                ))}
                {moreTodos}
                </>
              ) : (
                <p className="empty-note">
                  {view.date === todayDate
                    ? listDaily
                      ? "No daily tasks yet."
                      : "Nothing planned for today."
                    : listDaily
                      ? "No daily tasks for this day."
                      : listPast
                        ? "Nothing was planned for this day."
                        : "Nothing planned for this day."}
                </p>
              )}
            </ListBox>
          </section>
          {/* A daily task is filed under a category of its own space, so each space has its own list. */}
          {view.tab === "daily" && (
            <CategoriesCard
              key={view.space}
              scope={view.space}
              categories={categories[view.space]}
              onChange={(update) => setCategories((prev) => ({ ...prev, [view.space]: update(prev[view.space]) }))}
              onRefile={(from, to, only) =>
                setTodosMap((prev) => ({
                  ...prev,
                  [view.space]: prev[view.space].map((t) => (t.category === from && (!only || only.includes(t.id)) ? { ...t, category: to } : t)),
                }))
              }
            />
          )}
        </div>

        <div className="dashboard-aside summary-first">
          <section className="surface" aria-labelledby="progress-title">
            <div className="section-head">
              <h2 id="progress-title" className="section-title">
                Progress
              </h2>
            </div>
            {!totalCount ? (
              // Same height as the ring below, so the cards under it never move when a day has no tasks.
              <p className="empty-note dash-hero-empty">
                {listPast ? "No record" : "No tasks"} for {dayLabel(view.date, "long")}.
              </p>
            ) : (
              <div className="dash-hero">
                                <ProgressRing percent={percentage} label={`of ${listDaily ? "daily" : "the day's"} tasks done`} />
                <div className="dash-hero-text">
                  <span className="todo-stats-fraction number-tabular">
                    {/* Plain numbers: the fraction never counts; only the ring fills (the user's call). */}
                    {doneCount} of {totalCount} done
                  </span>
                  <span className="muted">{view.date === todayDate ? "Today" : dayLabel(view.date, "long")}</span>
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
                  {tracked.length ? `${Math.round(avg)}%` : "—"}
                </strong>
                <span>Average</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  {Math.round(perfectDays)}
                </strong>
                <span>Perfect days</span>
              </div>
              <div className="stat-tile">
                <strong className="number-tabular">
                  {Math.round(doneTotal)}
                </strong>
                <span>Tasks done</span>
              </div>
            </div>
            <BarChart
              key={`${period}-${metric}-${space}-${tab}-${date}`}
              data={bars}
              max={metric === "rate" ? 100 : maxDone}
              format={metric === "rate" ? (v) => `${v}%` : String}
              summary={`${metric === "rate" ? "Completion rate" : "Tasks done"} per day over the last ${span} days, average ${avg}%.${isDaily ? " Choose a day to open it." : ""}`}
              onSelect={isDaily ? (i) => goTo(days[i].iso) : undefined}
            />
          </section>
          {/* Last in the aside: it appears once the service worker is ready, so nothing sits below it to shift. */}
          {pushSupported && !pushSubscribed && (
            <section className="surface push-toggle-card" aria-label="Task reminders">
              <span className="push-toggle-label">
                <BellIcon size={16} /> Task reminders
              </span>
              <button type="button" className="btn-sm tint" onClick={handleEnablePush}>
                Enable
              </button>
            </section>
          )}
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
                disabled={saving}
                value={titleInput}
                onChange={(e) => {
                  setTitleInput(e.target.value);
                  setTitleError(null);
                }}
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? "task-title-error" : undefined}
              />
            </label>
            {(editing ? editing.isRecurring : isDaily) && (
              <label>
                Category
                <select disabled={saving} value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)}>
                  {[...new Set([...categories[editing?.space ?? space], categoryInput, "other"])].map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Reminder (optional)
              <input
                type="time"
                disabled={saving}
                value={reminderTimeInput}
                onChange={(e) => setReminderTimeInput(e.target.value)}
              />
            </label>
            {titleError && (
              <p id="task-title-error" className="error" role="alert">
                {titleError}
              </p>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !titleInput.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={moveOpen} onClose={() => setMoveOpen(false)} title="Move task">
        {moving && (
          <div className="move-options">
            {moving.isRecurring && (
              <p className="muted move-hint">
                It leaves the daily list and becomes a task for the day you pick. Its streak starts over.
              </p>
            )}
            {(moving.isRecurring || moving.dueDate !== todayDate) && (
              <button type="button" className="secondary" onClick={() => handleMove(moving, "none", todayDate)}>
                Today
              </button>
            )}
            {(moving.isRecurring || moving.dueDate !== tomorrow) && (
              <button type="button" className="secondary" onClick={() => handleMove(moving, "none", tomorrow)}>
                Tomorrow
              </button>
            )}
            <DatePicker
              mode="day"
              className="secondary move-pick"
              value={moving.isRecurring ? todayDate : moving.dueDate}
              today={todayDate}
              min={DEV_EDIT_PAST ? undefined : todayDate}
              max={maxDate}
              label="Another day…"
              onChange={(d) => handleMove(moving, "none", d)}
            />
            {!moving.isRecurring && (
              <button type="button" className="secondary" onClick={() => handleMove(moving, "daily", todayDate)}>
                Daily
              </button>
            )}
          </div>
        )}
      </Modal>
    </main>
  );
}
