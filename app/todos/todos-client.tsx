"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { AddButton, Badge, Card, ChartControls, Checkbox, Dashboard, DashboardAside, DashboardMain, DateField, DayStepper, EmptyNote, Field, FormModal, Page, ReadonlyNote, SelectField, StatRow, TintButton, Toolbar, ToolbarGroup } from "../components/blocks";
import { FlameIcon, BellIcon } from "../components/icons";
import { ListBox, RowActions } from "../components/lists";
import { Segmented } from "../components/segmented";
import { BarChart, ProgressRing } from "../components/charts";
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
import { PLAN_AHEAD_DAYS, TodoSpace } from "@/lib/validations/todos";
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

  const { showToast } = useToast();
  // The list shows this view, which follows the controls once the day's tasks have loaded.
  const [view, setView] = useState({
    space: "personal" as TodoSpace,
    tab: "daily" as TaskTab,
    date: todayDate,
  });
  const viewId = useRef(0);
  // The page position when a switch started: the list changes a render after the controls, so put the page back then too.
  const scrolled = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (scrolled.current !== null) window.scrollTo(0, scrolled.current);
    scrolled.current = null;
  }, [view]);

  const [todosMap, setTodosMap] = useState<Record<TodoSpace, TodoItem[]>>({
    personal: initialPersonalTodos,
    business: initialBusinessTodos,
  });

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("other");
  // Editing can also move the task: "keep" leaves it where it is.
  const [whenInput, setWhenInput] = useState<"keep" | "today" | "tomorrow" | "pick" | "daily">("keep");
  const [pickDate, setPickDate] = useState(todayDate);
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
  // Days before today are only looked at, except yesterday: one day of grace to tick, edit or delete what was forgotten.
  const yesterday = addDays(todayDate, -1);
  const isPast = date < todayDate;
  const editable = !isPast;
  // A repeating task's dueDate is its first day: it is not on the days before it.
  const visibleFor = (s: TodoSpace, daily: boolean, day: string) =>
    todosMap[s].filter((t) => t.isRecurring === daily && (!t.isRecurring || t.dueDate <= day));
  const listDaily = view.tab === "daily";
  const listPast = view.date < todayDate;
  const listEditable = view.date >= yesterday;
  // A daily task is ticked on its day or later, never ahead of time.
  const listTickable = listEditable && !(listDaily && view.date > todayDate);
  // The daily list shows its tasks under their category (each group in the list's own order); the Today list is flat.
  const listTodos = (() => {
    const list = visibleFor(view.space, listDaily, view.date);
    return listDaily ? groupOrder(categories[view.space], list).flatMap((c) => list.filter((t) => t.category === c)) : list;
  })();
  const [isFolded, toggleFolded] = useFolded("todos");
  const foldKey = (category: string) => `${view.space}/${view.tab}/${category}`;
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
    scrolled.current = window.scrollY;
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


  // Undone tasks carry over to today, so the Today tab never shows a past day.
  const changeTab = (next: TaskTab) =>
    switchView({ tab: next, date: next === "daily" || date >= todayDate ? date : todayDate });

  const openForm = (todo?: TodoItem) => {
    setTitleError(null);
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setCategoryInput(todo?.category ?? "other");
    setWhenInput("keep");
    setPickDate(todo && !todo.isRecurring ? todo.dueDate : todayDate);
    setIsTaskModalOpen(true);
  };

  const closeForm = () => {
    setIsTaskModalOpen(false);
    setTitleInput("");
    setReminderTimeInput("");
  };

  // Where the edit form sends the task; null when it stays.
  const moveTarget = (task: TodoItem) => {
    if (whenInput === "daily") return { pattern: "daily", day: todayDate };
    const day = whenInput === "today" ? todayDate : whenInput === "tomorrow" ? tomorrow : whenInput === "pick" ? pickDate : null;
    return day && (task.isRecurring || day !== task.dueDate) ? { pattern: "none", day } : null;
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
        const target = moveTarget(before);
        // Only a daily task (or one that becomes daily) has a category to pick; a one-off keeps the one it has.
        const category = before.isRecurring || target?.pattern === "daily" ? categoryInput : before.category;
        const after = { ...before, title, reminderTime, category };
        if (target) {
          // The edits travel with the move, so the server changes the task once.
          closeForm();
          await moveTask(before, after, target.pattern, target.day);
          return;
        }
        const res = await updateTodoAction({ id: before.id, title, reminderTime, category, day: date });
        if ("error" in res) return setTitleError(res.error);
        if (res.success) {
          // A daily task edited from a later day is a new task from that day on: it has a new id.
          const saved = { ...after, id: res.todo?.id ?? before.id };
          ++requestId.current;
          drop(before);
          putBack(saved);
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            onUndo: async () => {
              ++requestId.current;
              drop(saved);
              putBack({ ...before, id: saved.id });
              const undone = await updateTodoAction({
                id: saved.id,
                title: before.title,
                reminderTime: before.reminderTime,
                category: before.category,
                day: date,
              }).catch(() => null);
              if (!undone || !("success" in undone) || !undone.success) {
                drop({ ...before, id: saved.id });
                putBack(saved);
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
            onUndo: async () => {
              ++requestId.current;
              drop(created);
              const gone = await deleteTodoAction(created.id, created.dueDate).then(
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
          const next = { ...t, isCompleted, completedAt: new Date() }; // when the box last changed: ticked goes to the top of the done tasks, unticked to the bottom of the open ones
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
        onUndo: () => toggle(todo, !next, day, false),
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

  const drop = (task: TodoItem) => {
    setTodosMap((prev) => ({ ...prev, [task.space]: prev[task.space].filter((t) => t.id !== task.id) }));
  };

  // What the server needs to put a task back as it was.
  const snapshot = ({ id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, doneDates, createdAt }: TodoItem) => ({
    id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, doneDates, createdAt,
  });

  // Moving always takes the row out of this list; Undo puts the task back as it was, edits included (a new task a move created is deleted).
  const moveTask = async (before: TodoItem, after: TodoItem, recurrencePattern: string, day: string) => {
    ++requestId.current;
    drop(before);
    const res = await moveTodoAction({
      id: before.id,
      recurrencePattern,
      dueDate: day,
      from: date,
      title: after.title,
      reminderTime: after.reminderTime,
      category: after.category,
    }).catch(() => null);
    if (!res?.success) {
      if (shows(after)) putBack(after); // unless the list on screen changed meanwhile
      showToast({ message: res && "error" in res ? res.error : "Failed to move task", type: "warning" });
      return;
    }
    const createdId = res.todo && res.todo.id !== before.id ? res.todo.id : undefined;
    showToast({
      message: `Moved "${after.title}" to ${recurrencePattern === "none" ? whenLabel(day) : "Daily"}`,
      type: "success",
      onUndo: async () => {
        ++requestId.current;
        if (shows(before)) putBack(before);
        const back = await revertMoveTodoAction(snapshot(before), createdId).catch(() => null);
        if (!back?.success) {
          if (shows(before)) drop(before);
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
      onUndo: async () => {
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
        // Forgets the subscription here and on the server, so no reminder arrives.
        onUndo: async () => {
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
    <Page userName={userName}>
      <Toolbar dash>
        <ToolbarGroup>
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
        </ToolbarGroup>
        <DayStepper
          value={date}
          today={todayDate}
          max={maxDate}
          min={isDaily ? undefined : todayDate}
          marked={isDaily ? undefined : planned[space].filter((d) => d > todayDate)}
          label={dayLabel(date)}
          onChange={goTo}
        />
      </Toolbar>

      <Dashboard className="todos-grid">
        <DashboardMain>
          <Card
            id="tasks-title"
            title={isDaily ? "Daily tasks" : "Tasks"}
            count={listTodos.length}
            below
            actions={editable && <AddButton onClick={() => openForm()}>Add task</AddButton>}
          >
            {date < yesterday && <ReadonlyNote>Days before yesterday are read-only</ReadonlyNote>}
            {isDaily && date > todayDate && <ReadonlyNote>Daily tasks are ticked on the day</ReadonlyNote>}

            <ListBox wash className="todo-list">
              {listTodos.length > 0 ? (
                <GroupedList
                  items={listTodos}
                  grouped={listDaily}
                  isFolded={(c) => isFolded(foldKey(c))}
                  onToggle={(c) => toggleFolded(foldKey(c))}
                  row={(task) => (
                    <div className="todo-row">
                      <Checkbox
                        checked={task.isCompleted}
                        onChange={listTickable ? () => handleToggleTodo(task) : undefined}
                        label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                      />

                      <div className="todo-main">
                        <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>{task.title}</span>
                        {((!listDaily && task.isCarriedOver) || (task.reminderTime && isPushEnabled())) && (
                          <div className="badge-row">
                            {!listDaily && task.isCarriedOver && <Badge kind="carried">Carried over</Badge>}
                            {task.reminderTime && isPushEnabled() && <Badge kind="reminder">{task.reminderTime}</Badge>}
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
                        <RowActions bare onEdit={() => openForm(task)} onDelete={() => handleDeleteTodo(task)} editLabel={`Edit ${task.title}`} deleteLabel={`Delete ${task.title}`} />
                      )}
                    </div>
                  )}
                />
              ) : (
                <EmptyNote>
                  {view.date === todayDate
                    ? listDaily
                      ? "No daily tasks yet."
                      : "Nothing planned for today."
                    : listDaily
                      ? "No daily tasks for this day."
                      : listPast
                        ? "Nothing was planned for this day."
                        : "Nothing planned for this day."}
                </EmptyNote>
              )}
            </ListBox>
          </Card>
          {/* A daily task is filed under a category of its own space, so each space has its own list. */}
          {view.tab === "daily" && (
            <CategoriesCard
              key={view.space}
              api={scopedCategories(view.space)}
              categories={categories[view.space]}
              onChange={(update) => setCategories((prev) => ({ ...prev, [view.space]: update(prev[view.space]) }))}
              onRefile={(from, to, only) => {
                // Days that are over keep their categories, so only today and the days ahead change on screen; the server decides the rest.
                if (view.date >= todayDate)
                  setTodosMap((prev) => ({
                    ...prev,
                    [view.space]: prev[view.space].map((t) => (t.category === from && (!only || only.includes(t.id)) ? { ...t, category: to } : t)),
                  }));
                void loadDay();
              }}
            />
          )}
        </DashboardMain>

        <DashboardAside>
          <Card id="progress-title" title="Progress">
            {!totalCount ? (
              <EmptyNote>
                {listPast ? "No record" : "No tasks"} for {dayLabel(view.date, "long")}.
              </EmptyNote>
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
          </Card>

          <Card id="history-title" title={`Last ${span} days`}>
            <ChartControls>
              <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
              <Segmented label="Show" value={metric} options={METRICS} onChange={setMetric} />
            </ChartControls>
            <StatRow
              stats={[
                { value: tracked.length ? `${Math.round(avg)}%` : "—", label: "Average" },
                { value: Math.round(perfectDays), label: "Perfect days" },
                { value: Math.round(doneTotal), label: "Tasks done" },
              ]}
            />
            <BarChart
              key={`${period}-${metric}-${space}-${tab}-${date}`}
              data={bars}
              max={metric === "rate" ? 100 : maxDone}
              format={metric === "rate" ? (v) => `${v}%` : String}
              summary={`${metric === "rate" ? "Completion rate" : "Tasks done"} per day over the last ${span} days, average ${avg}%.${isDaily ? " Choose a day to open it." : ""}`}
              onSelect={isDaily ? (i) => goTo(days[i].iso) : undefined}
            />
          </Card>
          {/* Last in the aside: it appears once the service worker is ready, so nothing sits below it to shift. */}
          {pushSupported && !pushSubscribed && (
            <Card className="push-toggle-card" label="Task reminders">
              <span className="push-toggle-label">
                <BellIcon size={16} /> Task reminders
              </span>
              <TintButton onClick={handleEnablePush}>Enable</TintButton>
            </Card>
          )}
        </DashboardAside>
      </Dashboard>

      <FormModal
        isOpen={isTaskModalOpen}
        onClose={closeForm}
        title={editing ? "Edit task" : isDaily ? "New daily task" : "New task"}
        onSubmit={handleSubmit}
        error={titleError}
        errorId="task-title-error"
        busy={saving}
        canSubmit={!!titleInput.trim()}
      >
        <Field
          label="Title"
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
        {editing && (
          <>
            <SelectField
              label="Day"
              disabled={saving}
              value={whenInput}
              onChange={(e) => setWhenInput(e.target.value as typeof whenInput)}
              options={[
                { value: "keep", label: editing.isRecurring ? "Daily" : whenLabel(editing.dueDate) },
                ...(editing.isRecurring || editing.dueDate !== todayDate ? [{ value: "today", label: "Today" }] : []),
                ...(editing.isRecurring || editing.dueDate !== tomorrow ? [{ value: "tomorrow", label: "Tomorrow" }] : []),
                { value: "pick", label: "Another day…" },
                ...(!editing.isRecurring ? [{ value: "daily", label: "Daily" }] : []),
              ]}
            />
            {whenInput === "pick" && (
              <DateField
                id="task-pick-date"
                value={pickDate}
                today={todayDate}
                min={todayDate}
                max={maxDate}
                text={dayLabel(pickDate)}
                disabled={saving}
                onChange={setPickDate}
              />
            )}
          </>
        )}
        {(editing ? editing.isRecurring || whenInput === "daily" : isDaily) && (
          <CategoryField categories={categories[editing?.space ?? space]} value={categoryInput} onChange={setCategoryInput} disabled={saving} />
        )}
        {/* Without push there is nothing to remind with; an existing time stays untouched on save. */}
        {isPushEnabled() && (
          <Field label="Reminder (optional)" type="time" disabled={saving} value={reminderTimeInput} onChange={(e) => setReminderTimeInput(e.target.value)} />
        )}
      </FormModal>
    </Page>
  );
}
