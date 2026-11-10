"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Navigation } from "../components/navigation";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, FlameIcon, BellIcon, LockIcon, MoveIcon, PencilIcon, PlusIcon } from "../components/icons";
import { AnimatedNumber } from "../components/animated-number";
import { AutoHeight, fadeOut, swapIn, useBuilt, useListMotion, useMore } from "../components/list-motion";
import { Segmented } from "../components/segmented";
import { BarChart, ProgressRing } from "../components/charts";
import { Modal, useAfterClose } from "../components/modal";
import { DatePicker } from "../components/date-picker";
import { useToast } from "../components/toast";
import { isPushEnabled } from "@/lib/features";
import {
  createTodoAction,
  deleteTodoAction,
  loadTodosViewAction,
  moveTodoAction,
  restoreTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import type { TodoDayStat, TodoItem } from "@/lib/todos";
import { DEV_EDIT_PAST, PLAN_AHEAD_DAYS, TodoSpace } from "@/lib/validations/todos";
import { addDays, dayLabel, toISODate } from "@/lib/format-date";
import { isDueOn, streakOn, weekdayOf } from "@/lib/streak";
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

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
// Repeat patterns: "daily", or "days:1,3,5" for chosen ISO weekdays (1 = Monday).
const patternOf = (days: number[]) => (days.length === 7 ? "daily" : `days:${[...days].sort().join(",")}`);
const daysOf = (pattern: string) => (pattern.startsWith("days:") ? pattern.slice(5).split(",").map(Number) : ALL_DAYS);

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
  const [moving, setMoving] = useState<TodoItem | null>(null); // outlives the close, so the dialog keeps its content while it fades
  const [moveOpen, setMoveOpen] = useState(false);

  const { showToast } = useToast();
  const { rowRef, enter, leave, fadeAll, reorder } = useListMotion();
  const tasksCard = useRef<HTMLElement>(null);
  const built = useBuilt();
  const { later, runAfterClose } = useAfterClose();
  // The list shows this view, which follows the controls only after the old rows have faded out.
  const [view, setView] = useState({
    space: "personal" as TodoSpace,
    tab: "daily" as TaskTab,
    date: todayDate,
    weekday: null as number | null,
    n: 0,
  });
  const viewId = useRef(0);

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [daysInput, setDaysInput] = useState(ALL_DAYS);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  // The Week button stays mounted while it fades out after a switch to Today.
  const [showWeek, setShowWeek] = useState(true);
  const weekBtn = useRef<HTMLButtonElement>(null);
  // A weekday picked in the Week panel lists the daily tasks that repeat on it, to edit them; the date stays.
  const [weekday, setWeekday] = useState<number | null>(null);
  const [weekMap, setWeekMap] = useState<Record<TodoSpace, TodoItem[]> | null>(null);
  // Flows that finish seconds later (Undo, a refresh) read the controls as they are then.
  const latest = useRef({ date, tab, weekday });
  useEffect(() => {
    latest.current = { date, tab, weekday };
  });

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Bumped by every load and by every change made on screen, so an older refresh never lands over a newer state.
  const requestId = useRef(0);
  // The load a day switch started; a later switch that needs no load of its own waits for it.
  const loading = useRef<Promise<void>>(Promise.resolve());

  const isDaily = tab === "daily";
  // Both lists look a week ahead: one-off tasks to plan them, daily ones to see each weekday's list.
  const maxDate = addDays(todayDate, PLAN_AHEAD_DAYS);
  const tomorrow = addDays(todayDate, 1);
  // Past days can be ticked but not edited, except in dev builds, for testing.
  const isPast = date < todayDate;
  const editable = weekday !== null || !isPast || DEV_EDIT_PAST;
  // A repeating task's dueDate is its first day: it is not on the days before it.
  const visibleFor = (s: TodoSpace, daily: boolean, day: string) =>
    todosMap[s].filter((t) => t.isRecurring === daily && (!t.isRecurring || t.dueDate <= day));
  const listDaily = view.tab === "daily";
  const listPast = view.date < todayDate;
  const listEditable = view.weekday !== null || !listPast || DEV_EDIT_PAST;
  // A daily task is ticked on its day or later, never ahead of time, and never from a weekday's list.
  const listTickable = !(listDaily && (view.weekday || view.date > todayDate));
  const listTodos = view.weekday && weekMap ? weekMap[view.space] : visibleFor(view.space, listDaily, view.date);
  const [shownTodos, moreTodos] = useMore(listTodos);
  // A weekday's tasks are read from its next day in the week ahead.
  const weekDate = (w: number) => addDays(todayDate, (w - weekdayOf(todayDate) + 7) % 7);
  // Whether a task belongs on the list the controls show now.
  const shows = (t: TodoItem) => {
    const { date: d, tab: tb, weekday: w } = latest.current;
    const day = w ? weekDate(w) : d;
    if (t.isRecurring !== (tb === "daily")) return false;
    return t.isRecurring ? t.dueDate <= day && isDueOn(t.recurrencePattern, day) : t.dueDate === day;
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
  // `before` holds the swap back until the old rows have faded out.
  const loadDay = async (at: { date: string; weekday: number | null } = latest.current, before?: Promise<void>) => {
    const id = ++requestId.current;
    const day = at.weekday && weekDate(at.weekday);
    try {
      const view = await loadTodosViewAction(at.date, day || null);
      // A weekday's list has no day to tick, so nothing on it is done.
      const plan = (list: TodoItem[]) =>
        list.filter((t) => t.isRecurring).map((t) => ({ ...t, isCompleted: false })).sort(compareTodos);
      await before;
      if (id === requestId.current) {
        setTodosMap({ personal: view.daily[0].todos, business: view.daily[1].todos });
        setWeekMap(view.weekly ? { personal: plan(view.weekly[0].todos), business: plan(view.weekly[1].todos) } : null);
        setHistory({ personal: view.history[0] ?? [], business: view.history[1] ?? [] });
        setPlanned({ personal: view.planned[0], business: view.planned[1] });
      }
    } catch {
      showToast({ message: "Failed to load tasks", type: "warning" });
    }
  };

  // The controls switch at once; the rows fade out, then the new view's rows (and day) come in.
  const switchView = (next: { space?: TodoSpace; tab?: TaskTab; date?: string; weekday?: number | null }) => {
    const target = { space, tab, date, weekday, ...next };
    if (target.space === space && target.tab === tab && target.date === date && target.weekday === weekday) return;
    setSpace(target.space);
    setTab(target.tab);
    setDate(target.date);
    setWeekday(target.weekday);
    const n = ++viewId.current;
    const faded = new Promise<void>((done) => fadeAll(done));
    const load = target.date !== date || (target.weekday && target.weekday !== weekday);
    const settled = load ? (loading.current = loadDay(target, faded)) : Promise.all([faded, loading.current]);
    void settled.then(() => {
      if (n !== viewId.current) return;
      swapIn(tasksCard.current);
      setView({ ...target, n });
    });
  };

  // A day from the picker, the arrows or the chart leaves a weekday's list.
  const goTo = (next: string) => switchView({ date: next, weekday: null });

  const stepDay = (delta: number) => goTo(addDays(date, delta));

  // Today lists one day's tasks, so it has no Week panel.
  const changeTab = (next: TaskTab) => {
    if (next === "daily") {
      weekBtn.current?.getAnimations().forEach((a) => a.cancel());
      setShowWeek(true);
    } else {
      setWeekOpen(false);
      fadeOut(weekBtn.current, () => setShowWeek(false));
    }
    // Undone tasks carry over to today, so the Today tab never shows a past day.
    switchView({ tab: next, weekday: next === "daily" ? weekday : null, date: next === "daily" || date >= todayDate ? date : todayDate });
  };

  const toggleWeek = () => {
    if (weekOpen) switchView({ weekday: null });
    setWeekOpen(!weekOpen);
  };

  const openForm = (todo?: TodoItem) => {
    runAfterClose(); // reopened before the last close finished
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
    setTitleError(null);
    setSaving(true);
    let entered: Promise<void> | undefined;
    try {
      if (editing) {
        const before = editing;
        const after = { ...before, title, reminderTime, recurrencePattern };
        const res = await updateTodoAction({ id: before.id, title, reminderTime, recurrencePattern });
        if ("error" in res) return setTitleError(res.error);
        if (res.success) {
          // Once the form has closed, an edit that takes the task off this list leaves it like a delete; the
          // refresh lands after that.
          let gone = Promise.resolve();
          entered = new Promise((done) =>
            later(() => {
              if (shows(before) && !shows(after))
                gone = new Promise((left) => leave(before.id, () => (drop(before), left())));
              void gone.then(done);
            }),
          );
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            actionLabel: "Undo",
            // A task the edit took off the list comes back like a deleted one put back by Undo.
            onAction: async () => {
              ++requestId.current;
              runAfterClose(); // the edit first, if the form is still closing
              await gone; // or the late removal would drop it again
              const back = shows(before) && !shows(after) ? putBack(before) : undefined;
              const undone = await updateTodoAction({
                id: before.id,
                title: before.title,
                reminderTime: before.reminderTime,
                recurrencePattern: before.recurrencePattern,
              }).catch(() => null);
              if (!undone || !("success" in undone) || !undone.success) {
                if (back) leave(before.id, () => drop(before));
                showToast({ message: "Failed to undo the edit", type: "warning" });
              }
              await loadDay(undefined, back);
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
          if (shows(created))
            entered = new Promise((done) => later(() => void putBack(created).then(done)));
          // No Undo: a new task is one tap from Delete.
          showToast({ message: `Added "${title}"`, type: "success" });
        }
      }
      closeForm();
      await loadDay(undefined, entered);
    } catch {
      setTitleError("Failed to save task"); // the form stays open
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
    ++requestId.current;
    setCompleted(todo.id, next);
    try {
      // No toast: ticking again is its own undo.
      await toggleTodoAction({ id: todo.id, isCompleted: next, currentDate: date });
    } catch {
      showToast({ message: "Failed to update task", type: "warning" });
    }
    // Refresh to pick up the server-computed streak.
    await loadDay();
  };

  // Back in the list where the server would sort it.
  // Resolves when its entrance is done.
  const putBack = (task: TodoItem) => {
    const entered = enter(task.id);
    const add = (prev: Record<TodoSpace, TodoItem[]>) => ({
      ...prev,
      [task.space]: prev[task.space].some((t) => t.id === task.id)
        ? prev[task.space]
        : [...prev[task.space], task].sort(compareTodos),
    });
    if (latest.current.weekday) setWeekMap((prev) => prev && add(prev));
    else setTodosMap(add);
    return entered;
  };

  const drop = (task: TodoItem) => {
    const remove = (prev: Record<TodoSpace, TodoItem[]>) => ({
      ...prev,
      [task.space]: prev[task.space].filter((t) => t.id !== task.id),
    });
    setTodosMap(remove);
    setWeekMap((prev) => prev && remove(prev));
  };

  // Moving always takes the row out of this list; the server call starts now, the row leaves once the dialog has closed.
  const handleMove = (task: TodoItem, recurrencePattern: string, day: string) => {
    setMoveOpen(false);
    if (recurrencePattern === "none" && !task.isRecurring && day === task.dueDate) return;
    ++requestId.current;
    const moved = moveTodoAction({ id: task.id, recurrencePattern, dueDate: day }).then(
      (res) => (res.success ? null : "error" in res ? res.error : "Failed to move task"),
      () => "Failed to move task",
    );
    const gone = new Promise<void>((done) =>
      later(() =>
        leave(task.id, () => {
          drop(task);
          done();
        }),
      ),
    );
    void Promise.all([moved, gone]).then(([error]) => {
      if (error) {
        if (shows(task)) putBack(task); // unless the list on screen changed meanwhile
        showToast({ message: error, type: "warning" });
        return;
      }
      void loadDay();
      showToast({
        message: `Moved "${task.title}" to ${recurrencePattern === "none" ? whenLabel(day) : "Daily"}`,
        type: "success",
      });
    });
  };

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  // Undo restores the same task, streak included.
  const handleDeleteTodo = (target: TodoItem) => {
    ++requestId.current;
    const deleted = deleteTodoAction(target.id, date).then(
      (res) => res.success,
      () => false,
    );
    // Undo or a failure waits for the row to finish leaving, or the late removal would drop it again.
    const gone = new Promise<void>((done) =>
      leave(target.id, () => {
        drop(target);
        done();
      }),
    );
    showToast({
      message: `Removed "${target.title}"`,
      actionLabel: "Undo",
      onAction: async () => {
        ++requestId.current;
        await gone;
        // Only onto the list it was on, if that is still the one on screen.
        const entered = shows(target) ? putBack(target) : undefined;
        if (!(await deleted)) return; // the delete never happened
        const { id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, doneDates, createdAt } = target;
        const back = await restoreTodoAction({
          id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, doneDates, createdAt,
        }).catch(() => null);
        if (!back?.success) {
          if (entered) leave(target.id, () => drop(target));
          showToast({ message: back && "error" in back ? back.error : "Failed to restore task", type: "warning" });
        }
        await loadDay(undefined, entered);
      },
    });
    void Promise.all([deleted, gone]).then(([ok]) => {
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
      if (!vapidPublicKey) {
        showToast({ message: "Reminders enabled", type: "success" });
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

      if (!res.success) throw new Error("not saved");
      setPushSubscribed(true);
      showToast({ message: "Reminders enabled", type: "success" });
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
          <section ref={tasksCard} className="surface" aria-labelledby="tasks-title">
            <div className="section-head">
              <h2 id="tasks-title" className="section-title">
                {isDaily ? "Daily tasks" : "Tasks"} <span className="muted number-tabular">{listTodos.length}</span>
              </h2>
              <span className="head-actions below">
                {showWeek && (
                  <button
                    ref={weekBtn}
                    type="button"
                    className="btn-sm tint week-btn"
                    inert={!isDaily}
                    aria-expanded={weekOpen}
                    aria-controls="week-strip"
                    onClick={toggleWeek}
                  >
                    Week
                  </button>
                )}
                {editable && (
                  <button type="button" className="btn-sm tint" onClick={() => openForm()}>
                    <PlusIcon size={14} />
                    Add task
                  </button>
                )}
              </span>
            </div>

            <AutoHeight>
              {weekOpen && (
                <div id="week-strip" className="week-strip" role="group" aria-label="Day of the week">
                  {WEEKDAYS.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      className="weekday-btn"
                      aria-pressed={weekday === i + 1}
                      aria-label={name}
                      onClick={() => switchView({ weekday: weekday === i + 1 ? null : i + 1 })}
                    >
                      {name.slice(0, 3)}
                    </button>
                  ))}
                </div>
              )}
            </AutoHeight>

            {isPast && !DEV_EDIT_PAST && !weekday && (
              <p className="readonly-note">
                <LockIcon size={13} /> Past days can be ticked, not edited
              </p>
            )}
            {isDaily && (weekday || date > todayDate) && (
              <p className="readonly-note">
                <LockIcon size={13} /> Daily tasks are ticked on the day
              </p>
            )}

            <AutoHeight wash className={built ? "todo-list built" : "todo-list"}>
              {listTodos.length > 0 ? (
                // Keyed by the view so the rows replay their entrance when the space, list or day changes.
                <Fragment key={view.n}>
                {shownTodos.map((task) => (
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

                    {listDaily && !view.weekday && task.streak > 0 && (
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
                            runAfterClose();
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
                ))}
                {moreTodos}
                </Fragment>
              ) : (
                // Keyed by the view like the rows: a reused note keeps fadeAll's faded-out state and stays invisible.
                <p key={`empty-${view.n}`} ref={rowRef("empty")} className="empty-note">
                  {view.weekday
                    ? `No daily tasks on ${WEEKDAYS[view.weekday - 1]}s.`
                    : view.date === todayDate
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
            {!totalCount ? (
              <p className="empty-note">
                {listPast ? "No record" : "No tasks"} for {dayLabel(view.date, "long")}.
              </p>
            ) : (
              <div className="dash-hero">
                {/* Not keyed by the view: the ring stays mounted and eases from the old share to the new one, up or down. */}
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
                  {tracked.length ? <AnimatedNumber value={avg} format={(n) => `${Math.round(n)}%`} /> : "—"}
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
              <fieldset className="weekday-picker" disabled={saving}>
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
            <button
              type="submit"
              disabled={saving || !titleInput.trim() || ((editing ? editing.isRecurring : isDaily) && !daysInput.length)}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={moveOpen} onClose={() => setMoveOpen(false)} onExited={runAfterClose} title="Move task">
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
