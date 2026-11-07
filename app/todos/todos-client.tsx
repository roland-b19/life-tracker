"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, TrashIcon, FlameIcon, BellIcon, LockIcon, MoveIcon, PencilIcon, PlusIcon } from "../components/icons";
import { AnimatedNumber } from "../components/animated-number";
import { AutoHeight, useListMotion } from "../components/list-motion";
import { Segmented } from "../components/segmented";
import { BarChart, ProgressRing } from "../components/charts";
import { Modal, useAfterClose } from "../components/modal";
import { DatePicker } from "../components/date-picker";
import { useToast } from "../components/toast";
import {
  createTodoAction,
  deleteTodoAction,
  getDailyTodosAction,
  getPlannedDaysAction,
  getTodoHistoryAction,
  moveTodoAction,
  restoreTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import type { TodoDayStat, TodoItem } from "@/lib/todos";
import { DEV_EDIT_PAST, PLAN_AHEAD_DAYS, TodoSpace } from "@/lib/validations/todos";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { streakOn, weekdayOf } from "@/lib/streak";
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
  { value: "rate", label: "% done" },
  { value: "done", label: "Tasks done" },
];
// Sparse day labels so 30 and 90 bars stay readable.
const LABEL_EVERY: Record<Period, number> = { "7": 1, "30": 5, "90": 15 };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
// Repeat patterns: "daily", or "days:1,3,5" for chosen ISO weekdays (1 = Monday).
const patternOf = (days: number[]) => (days.length === 7 ? "daily" : `days:${[...days].sort().join(",")}`);
const daysOf = (pattern: string) => (pattern.startsWith("days:") ? pattern.slice(5).split(",").map(Number) : ALL_DAYS);

const dayLabel = (iso: string, weekday: "short" | "long" = "short") =>
  `${new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday })} ${formatDMY(iso)}`;

interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
  initialHistory: Record<TodoSpace, TodoDayStat[]>;
  initialPlanned: Record<TodoSpace, string[]>;
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
  initialHistory,
  initialPlanned,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [date, setDate] = useState(todayDate);
  const [tab, setTab] = useState<TaskTab>("daily");
  const [period, setPeriod] = useState<Period>("30");
  const [metric, setMetric] = useState<Metric>("rate");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [planned, setPlanned] = useState(initialPlanned);
  const [moving, setMoving] = useState<TodoItem | null>(null);

  const { showToast } = useToast();
  const { rowRef, enter, leave, fadeAll, reorder } = useListMotion();
  const { later, runAfterClose } = useAfterClose();
  // The list shows this view, which follows the controls only after the old rows have faded out.
  const [view, setView] = useState({ space: "personal" as TodoSpace, tab: "daily" as TaskTab, date: todayDate, n: 0 });
  const viewId = useRef(0);

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [daysInput, setDaysInput] = useState(ALL_DAYS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);

  const requestId = useRef(0);

  const isDaily = tab === "daily";
  // Both lists look a week ahead: one-off tasks to plan them, daily ones to see each weekday's list.
  const maxDate = addDays(todayDate, PLAN_AHEAD_DAYS);
  const tomorrow = addDays(todayDate, 1);
  // Past days can be ticked but not edited, except in dev builds, for testing.
  const isPast = date < todayDate;
  const editable = !isPast || DEV_EDIT_PAST;
  // A repeating task's dueDate is its first day: it is not on the days before it.
  const visibleFor = (s: TodoSpace, daily: boolean, day: string) =>
    todosMap[s].filter((t) => t.isRecurring === daily && (!t.isRecurring || t.dueDate <= day));
  const visibleTodos = visibleFor(space, isDaily, date);
  const listDaily = view.tab === "daily";
  const listPast = view.date < todayDate;
  const listEditable = !listPast || DEV_EDIT_PAST;
  // A daily task is ticked on its day or later, never ahead of time.
  const listTickable = !(listDaily && view.date > todayDate);
  const listTodos = visibleFor(view.space, listDaily, view.date);
  // The week ahead, each weekday once, Monday first, to jump to any of them.
  const week = Array.from({ length: 7 }, (_, i) => addDays(todayDate, i)).sort((a, b) => weekdayOf(a) - weekdayOf(b));
  const whenLabel = (day: string) => (day === todayDate ? "Today" : day === tomorrow ? "Tomorrow" : dayLabel(day));

  const byDate = new Map(history[space].filter((h) => h.isRecurring === isDaily).map((h) => [h.date, h]));
  // A past day with no snapshot and nothing on its list has no record; otherwise the list is counted.
  const doneCount = visibleTodos.filter((t) => t.isCompleted).length;
  const totalCount = visibleTodos.length;
  const noRecord = isPast && !byDate.has(date) && totalCount === 0;
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
  // `before` holds the swap back until the old rows have faded out.
  const loadDay = async (date: string, before?: Promise<void>) => {
    const id = ++requestId.current;
    try {
      const [personal, business, hp, hb, pp, pb] = await Promise.all([
        getDailyTodosAction("personal", date),
        getDailyTodosAction("business", date),
        getTodoHistoryAction("personal"),
        getTodoHistoryAction("business"),
        getPlannedDaysAction("personal"),
        getPlannedDaysAction("business"),
      ]);
      await before;
      if (id === requestId.current) {
        setTodosMap({ personal: personal.todos, business: business.todos });
        setHistory({ personal: hp.history ?? [], business: hb.history ?? [] });
        setPlanned({ personal: pp.days, business: pb.days });
      }
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
  };

  // The controls switch at once; the rows fade out, then the new view's rows (and day) come in.
  const switchView = (next: { space?: TodoSpace; tab?: TaskTab; date?: string }) => {
    const target = { space, tab, date, ...next };
    if (target.space === space && target.tab === tab && target.date === date) return;
    setSpace(target.space);
    setTab(target.tab);
    setDate(target.date);
    const n = ++viewId.current;
    const faded = new Promise<void>((done) => fadeAll(done));
    void (target.date !== date ? loadDay(target.date, faded) : faded).then(() => {
      if (n === viewId.current) setView({ ...target, n });
    });
  };

  const goTo = (next: string) => switchView({ date: next });

  const stepDay = (delta: number) => goTo(addDays(date, delta));

  const changeTab = (next: TaskTab) => switchView({ tab: next });

  const openForm = (todo?: TodoItem) => {
    runAfterClose(); // reopened before the last close finished
    setErrorMsg(null);
    setTitleError(null);
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setDaysInput(daysOf(todo?.recurrencePattern ?? "daily"));
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
    const repeats = editing ? editing.isRecurring : isDaily;
    if (repeats && !daysInput.length) return;
    const recurrencePattern = repeats ? patternOf(daysInput) : "none";
    setSaving(true);
    let entered: Promise<void> | undefined;
    try {
      if (editing) {
        const before = editing;
        const res = await updateTodoAction({ id: before.id, title, reminderTime, recurrencePattern });
        if ("error" in res) return setTitleError(res.error);
        if (res.success) {
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              await updateTodoAction({
                id: before.id,
                title: before.title,
                reminderTime: before.reminderTime,
                recurrencePattern: before.recurrencePattern,
              });
              await loadDay(date);
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
        });
        if (!res.success) return setTitleError(res.error); // the form stays open to fix the title
        if (res.todo) {
          const created = res.todo;
          // The row comes in once the form has closed; the refresh (stats, chart) lands after its entrance, not in the middle of it.
          if (!created.isRecurring || created.dueDate <= date)
            entered = new Promise((done) => later(() => void putBack(created).then(done)));
          showToast({
            message: `Added "${title}"`,
            type: "success",
            actionLabel: "Undo",
            onAction: async () => {
              runAfterClose(); // the row first, if the form is still closing
              await deleteTodoAction(created.id);
              leave(created.id, () => {
                drop(created);
                void loadDay(date);
              });
            },
          });
        }
      }
      closeForm();
      await loadDay(date, entered);
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  // The streak moves with the tick, counted as the server counts it; the row slides to its new place.
  const setCompleted = (id: string, isCompleted: boolean) =>
    reorder(() =>
      setTodosMap((prev) => ({
        ...prev,
        [space]: prev[space]
          .map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, isCompleted, completedAt: isCompleted ? new Date() : null };
            if (!t.isRecurring) return next;
            const doneDates = isCompleted ? [...new Set([...t.doneDates, date])].sort() : t.doneDates.filter((d) => d !== date);
            return { ...next, doneDates, streak: streakOn(new Set(doneDates), t.recurrencePattern, date) };
          })
          .sort(compareTodos),
      })),
    );

  const handleToggleTodo = async (todo: TodoItem) => {
    const next = !todo.isCompleted;
    setCompleted(todo.id, next);
    try {
      // No toast: ticking again is its own undo.
      await toggleTodoAction({ id: todo.id, isCompleted: next, currentDate: date });
    } catch (err: unknown) {
      if (err instanceof Error) setErrorMsg(err.message);
    }
    // Refresh to pick up the server-computed streak.
    await loadDay(date);
  };

  // Back in the list where the server would sort it.
  // Resolves when its entrance is done.
  const putBack = (task: TodoItem) => {
    const entered = enter(task.id);
    setTodosMap((prev) => ({
      ...prev,
      [task.space]: prev[task.space].some((t) => t.id === task.id)
        ? prev[task.space]
        : [...prev[task.space], task].sort(compareTodos),
    }));
    return entered;
  };

  const drop = (task: TodoItem) =>
    setTodosMap((prev) => ({ ...prev, [task.space]: prev[task.space].filter((t) => t.id !== task.id) }));

  // Moving always takes the row out of this list; the server call runs while it leaves.
  const handleMove = (task: TodoItem, recurrencePattern: string, day: string) => {
    setMoving(null);
    if (recurrencePattern === "none" && !task.isRecurring && day === task.dueDate) return;
    const moved = moveTodoAction({ id: task.id, recurrencePattern, dueDate: day }).then(
      (res) => (res.success ? null : "error" in res ? res.error : "Failed to move task"),
      () => "Failed to move task",
    );
    const gone = new Promise<void>((done) =>
      leave(task.id, () => {
        drop(task);
        done();
      }),
    );
    void Promise.all([moved, gone]).then(([error]) => {
      if (error) {
        putBack(task);
        showToast({ message: error, type: "warning" });
        return;
      }
      void loadDay(date);
      showToast({
        message: `Moved "${task.title}" to ${recurrencePattern === "none" ? whenLabel(day) : "Daily"}`,
        type: "success",
      });
    });
  };

  // The server call runs while the row fades, so nothing waits on the network; undo restores the same task, streak included.
  const handleDeleteTodo = (target: TodoItem) => {
    const deleted = deleteTodoAction(target.id, date).then(
      (res) => res.success,
      () => false,
    );
    leave(target.id, () => {
      drop(target);
      void deleted.then((ok) => {
        if (!ok) {
          putBack(target);
          showToast({ message: "Failed to delete task", type: "warning" });
          return;
        }
        void loadDay(date);
        showToast({
          message: `Deleted "${target.title}"`,
          actionLabel: "Undo",
          onAction: async () => {
            const entered = putBack(target);
            const { id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, doneDates, createdAt } = target;
            const back = await restoreTodoAction({
              id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, doneDates, createdAt,
            }).catch(() => null);
            if (!back?.success) {
              leave(target.id, () => drop(target));
              showToast({ message: back && "error" in back ? back.error : "Failed to restore task", type: "warning" });
            }
            await loadDay(date, entered);
          },
        });
      });
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
          <button type="button" className="month-nav-btn" onClick={() => stepDay(-1)} aria-label="Previous day">
            ‹
          </button>
          <DatePicker
            mode="day"
            value={date}
            today={todayDate}
            max={maxDate}
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
              <span className="head-actions">
                <button
                  type="button"
                  className="btn-sm secondary"
                  aria-expanded={weekOpen}
                  aria-controls="week-strip"
                  onClick={() => setWeekOpen((open) => !open)}
                >
                  Week
                </button>
                {editable && (
                  <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                    <PlusIcon size={14} />
                    Add task
                  </button>
                )}
              </span>
            </div>

            {weekOpen && (
              <div id="week-strip" className="week-strip" role="group" aria-label="Day of the week">
                {week.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className="weekday-btn"
                    aria-pressed={day === date}
                    aria-label={WEEKDAYS[weekdayOf(day) - 1]}
                    onClick={() => goTo(day)}
                  >
                    {WEEKDAYS[weekdayOf(day) - 1].slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

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

            <AutoHeight className="todo-list">
              {listTodos.length > 0 ? (
                // Keyed by the view so the rows replay their entrance when the space, list or day changes.
                <Fragment key={view.n}>
                {listTodos.map((task) => (
                  <div key={task.id} ref={rowRef(task.id)} className="todo-row">
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
                      {((!listDaily && task.isCarriedOver) || task.reminderTime || task.recurrencePattern.startsWith("days:")) && (
                        <div className="badge-row">
                          {!listDaily && task.isCarriedOver && <span className="badge badge-carried">Carried over</span>}
                          {task.recurrencePattern.startsWith("days:") && (
                            <span className="badge badge-repeat">
                              {daysOf(task.recurrencePattern).map((d) => WEEKDAYS[d - 1].slice(0, 3)).join(", ")}
                            </span>
                          )}
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
                          onClick={() => setMoving(task)}
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
                ))}
                </Fragment>
              ) : (
                // Keyed by the view like the rows: a reused note keeps fadeAll's faded-out state and stays invisible.
                <p key={`empty-${view.n}`} ref={rowRef("empty")} className="empty-note">
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
            </AutoHeight>
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
              format={metric === "rate" ? (v) => `${v}%` : String}
              summary={`${metric === "rate" ? "Completion rate" : "Tasks done"} per day over the last ${span} days, average ${avg}%. Choose a day to open it.`}
              onSelect={(i) => goTo(days[i].iso)}
            />
          </section>
        </div>
      </div>

      <Modal
        isOpen={isTaskModalOpen}
        onClose={closeForm}
        onExited={runAfterClose}
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
                onChange={(e) => {
                  setTitleInput(e.target.value);
                  setTitleError(null);
                }}
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? "task-title-error" : undefined}
              />
            </label>
            {titleError && (
              <p id="task-title-error" className="error" role="alert">
                {titleError}
              </p>
            )}
            {(editing ? editing.isRecurring : isDaily) && (
              <fieldset className="weekday-picker">
                <legend>Repeat on</legend>
                <div className="weekday-options">
                  {WEEKDAYS.map((name, i) => {
                    const on = daysInput.includes(i + 1);
                    return (
                      <button
                        key={name}
                        type="button"
                        className="weekday-btn"
                        aria-pressed={on}
                        aria-label={name}
                        onClick={() =>
                          setDaysInput((d) => (on ? d.filter((x) => x !== i + 1) : [...d, i + 1].sort()))
                        }
                      >
                        {name.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
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
            <button
              type="submit"
              disabled={saving || !titleInput.trim() || ((editing ? editing.isRecurring : isDaily) && !daysInput.length)}
            >
              {editing ? "Save" : "Add task"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={moving !== null} onClose={() => setMoving(null)} title="Move task">
        {moving && (
          <div className="move-options">
            <p className="muted move-hint">
              {moving.isRecurring
                ? "It leaves the daily list and becomes a task for the day you pick. Its streak starts over."
                : "Pick a day, or make it a daily task."}
            </p>
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
