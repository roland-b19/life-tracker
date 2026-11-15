"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { AddButton, Badge, Card, Checkbox, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FormModal, Page, TintButton, Toolbar, ToolbarGroup } from "../components/blocks";
import { BellIcon } from "../components/icons";
import { ListBox, RowActions } from "../components/lists";
import { Segmented } from "../components/segmented";
import { ProgressRing } from "../components/charts";
import { useToast } from "../components/toast";
import { isPushEnabled } from "@/lib/features";
import {
  createTodoAction,
  deletePushSubscriptionAction,
  deleteTodoAction,
  loadTodosViewAction,
  restoreTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import type { TodoItem } from "@/lib/todos";
import type { TodoSpace } from "@/lib/validations/todos";
import { blockPlacements, compareTodos } from "@/lib/todo-order";

type TaskTab = "daily" | "one-day";
interface TodosClientProps {
  userName: string;
  todayDate: string;
  initialPersonalTodos: TodoItem[];
  initialBusinessTodos: TodoItem[];
  initialCategories: Record<TodoSpace, string[]>;
}

export function TodosClient({
  userName,
  todayDate,
  initialPersonalTodos,
  initialBusinessTodos,
  initialCategories,
}: TodosClientProps) {
  const [space, setSpace] = useState<TodoSpace>("personal");
  const [tab, setTab] = useState<TaskTab>("daily");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [categories, setCategories] = useState(initialCategories);

  const { showToast } = useToast();
  // The list shows this view, which follows the controls once the tasks have loaded.
  const [view, setView] = useState({
    space: "personal" as TodoSpace,
    tab: "daily" as TaskTab,
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
  const [titleError, setTitleError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [saving, setSaving] = useState(false);
  // Flows that finish seconds later (Undo, a refresh) read the controls as they are then.
  const latest = useRef({ tab });
  useEffect(() => {
    latest.current = { tab };
  });

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Bumped by every load and by every change made on screen, so an older refresh never lands over a newer state.
  const requestId = useRef(0);
  const submitting = useRef(false);
  // The load a day switch started; a later switch that needs no load of its own waits for it.
  const loading = useRef<Promise<void>>(Promise.resolve());

  const isDaily = tab === "daily";
  // Every list is today's: tasks are added for today only, and unfinished ones carry over.
  const visibleFor = (s: TodoSpace, daily: boolean) => todosMap[s].filter((t) => t.isRecurring === daily);
  const listDaily = view.tab === "daily";
  // The daily list shows its tasks under their category (each group in the list's own order); the Today list is flat.
  const listTodos = (() => {
    const list = visibleFor(view.space, listDaily);
    return listDaily ? groupOrder(categories[view.space], list).flatMap((c) => list.filter((t) => t.category === c)) : list;
  })();
  const [isFolded, toggleFolded] = useFolded("todos");
  const foldKey = (category: string) => `${view.space}/${view.tab}/${category}`;
  // Whether a task belongs on the list the controls show now.
  const shows = (t: TodoItem) => {
    return t.isRecurring === (latest.current.tab === "daily");
  };

  // Progress counts the list on screen (`view`), so it never shows the last day's numbers while the next one loads.
  // A day with no tasks shows only a note, no ring.
  const progressTodos = visibleFor(view.space, listDaily);
  const doneCount = progressTodos.filter((t) => t.isCompleted).length;
  const totalCount = progressTodos.length;
  const percentage = Math.round((doneCount / (totalCount || 1)) * 100);

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

  // Loads both spaces and swaps them in with one state update, so the list never flashes empty.
  const loadDay = async () => {
    const id = ++requestId.current;
    try {
      const view = await loadTodosViewAction();
      if (id === requestId.current) {
        setTodosMap({ personal: view.daily[0].todos, business: view.daily[1].todos });
      }
    } catch {
      showToast({ message: "Failed to load tasks", type: "warning" });
    }
  };

  // The controls switch at once; the list follows a render later.
  const switchView = (next: { space?: TodoSpace; tab?: TaskTab }) => {
    const target = { space, tab, ...next };
    if (target.space === space && target.tab === tab) return;
    scrolled.current = window.scrollY;
    setSpace(target.space);
    setTab(target.tab);
    const n = ++viewId.current;
    void loading.current.then(() => {
      if (n === viewId.current) setView(target);
    });
  };

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
    if (!title || saving || submitting.current) return;
    submitting.current = true; // state is stale within one tick, so a fast double tap would save twice
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
        if (!res.success) showToast({ message: `"${before.title}" was removed elsewhere`, type: "warning" });
        else {
          ++requestId.current;
          drop(before);
          putBack(after);
          keepCategory(after);
          showToast({
            message: `Saved "${title}"`,
            type: "success",
            onUndo: async () => {
              ++requestId.current;
              drop(after);
              putBack(before);
              const undone = await updateTodoAction({
                id: before.id,
                title: before.title,
                reminderTime: before.reminderTime,
                category: before.category,
              }).catch(() => null);
              if (!undone || !("success" in undone) || !undone.success) {
                drop(before);
                putBack(after);
                showToast({ message: "Failed to undo the edit", type: "warning" });
              } else keepCategory(before);
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
          dueDate: todayDate,
          reminderTime,
          category: isDaily ? categoryInput : "other",
        });
        if (!res.success) return setTitleError(res.error); // the form stays open to fix the title
        if (res.todo) {
          const created = res.todo;
          ++requestId.current;
          if (shows(created)) putBack(created);
          keepCategory(created);
          showToast({
            message: `Added "${title}"`,
            type: "success",
            onUndo: async () => {
              ++requestId.current;
              drop(created);
              const gone = await deleteTodoAction(created.id).then(
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
      submitting.current = false;
      setSaving(false);
    }
  };

  // `completedAt` is when the box last changed: ticked goes to the top of the done tasks, unticked to the bottom of the open ones.
  // Undo passes the time from before the change, so the task goes back to where it was; left out, it is now.
  const setCompleted = (task: TodoItem, isCompleted: boolean, completedAt: Date | null = new Date()) =>
    setTodosMap((prev) => ({
      ...prev,
      [task.space]: prev[task.space].map((t) => (t.id === task.id ? { ...t, isCompleted, completedAt } : t)).sort(compareTodos),
    }));

  const toggle = async (todo: TodoItem, next: boolean, withUndo: boolean, completedAt?: Date | null) => {
    ++requestId.current;
    setCompleted(todo, next, completedAt);
    if (withUndo) {
      showToast({
        message: next ? `Completed "${todo.title}"` : `Marked "${todo.title}" not done`,
        onUndo: () => toggle(todo, !next, false, todo.completedAt),
      });
    }
    try {
      await toggleTodoAction({ id: todo.id, isCompleted: next, completedAt });
    } catch {
      showToast({ message: "Failed to update task", type: "warning" });
    }
    // Refresh so the screen matches the database, whatever the server answered.
    await loadDay();
  };

  const handleToggleTodo = (todo: TodoItem) => toggle(todo, !todo.isCompleted, true);

  // Back in the list where the server would sort it.
  const putBack = (task: TodoItem) =>
    setTodosMap((prev) => ({
      ...prev,
      [task.space]: prev[task.space].some((t) => t.id === task.id) ? prev[task.space] : [...prev[task.space], task].sort(compareTodos),
    }));

  // The server files a saved task under its category and creates the category if it is gone (an Undo after the category was deleted): the card shows it too.
  const keepCategory = ({ space, category }: TodoItem) =>
    setCategories((prev) => (category === "other" || prev[space].includes(category) ? prev : { ...prev, [space]: [...prev[space], category] }));

  const drop = (task: TodoItem) => {
    setTodosMap((prev) => ({ ...prev, [task.space]: prev[task.space].filter((t) => t.id !== task.id) }));
  };

  // What the server needs to put a task back as it was.
  const snapshot = ({ id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, createdAt, placedAt, completedAt }: TodoItem) => ({
    id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, createdAt, placedAt, completedAt,
  });

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  // Undo restores the same task.
  const handleDeleteTodo = (target: TodoItem) => {
    ++requestId.current;
    drop(target);
    // true: removed now; false: the call failed; "gone": it was already deleted elsewhere, so there is nothing to undo.
    const deleted = deleteTodoAction(target.id).then(
      (res) => (res.success ? (res.deleted ? true : ("gone" as const)) : false),
      () => false,
    );
    showToast({
      message: `Removed "${target.title}"`,
      onUndo: async () => {
        ++requestId.current;
        if ((await deleted) === "gone") return; // deleted elsewhere: Undo must not bring it back
        // Only onto the list it was on, if that is still the one on screen.
        if (shows(target)) putBack(target);
        if (!(await deleted)) return; // the delete never happened
        const back = await restoreTodoAction(snapshot(target)).catch(() => null);
        if (!back?.success) {
          if (shows(target)) drop(target);
          showToast({ message: back && "error" in back ? back.error : "Failed to restore task", type: "warning" });
        } else keepCategory(target);
        await loadDay();
      },
    });
    void deleted.then((ok) => {
      if (ok === "gone") showToast({ message: `"${target.title}" was already removed`, type: "warning" });
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
      // Without a key no reminder could ever arrive, so never say they are on.
      if (!vapidPublicKey) throw new Error("no push key");
      const enabled = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey });
      const { endpoint, keys } = enabled.toJSON();
      const res = await savePushSubscriptionAction({ endpoint, p256dhKey: keys?.p256dh, authKey: keys?.auth });
      if (!res.success) throw new Error("not saved");
      setPushSubscribed(true);
      showToast({
        message: "Reminders enabled",
        type: "success",
        // Forgets the subscription here and on the server, so no reminder arrives.
        onUndo: async () => {
          setPushSubscribed(false);
          try {
            await deletePushSubscriptionAction(enabled.endpoint);
            await enabled.unsubscribe();
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
            onChange={(next) => switchView({ tab: next })}
          />
        </ToolbarGroup>
      </Toolbar>

      <Dashboard className="todos-grid">
        <DashboardMain>
          <Card
            id="tasks-title"
            title={isDaily ? "Daily tasks" : "Tasks"}
            count={listTodos.length}
            actions={<AddButton onClick={() => openForm()}>Add task</AddButton>}
          >
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
                        onChange={() => handleToggleTodo(task)}
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

                      <RowActions bare onEdit={() => openForm(task)} onDelete={() => handleDeleteTodo(task)} editLabel={`Edit ${task.title}`} deleteLabel={`Delete ${task.title}`} />
                    </div>
                  )}
                />
              ) : (
                <EmptyNote>
                  {listDaily ? "No daily tasks yet." : "Nothing planned for today."}
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
                setTodosMap((prev) => {
                  // As the server files them: repeating tasks land on top of the new category as one block, in the order they had.
                  const moving = (t: TodoItem) => t.category === from && (!only || only.includes(t.id));
                  const placed = blockPlacements(prev[view.space].filter((t) => moving(t) && t.isRecurring));
                  const refiled = prev[view.space]
                    .map((t) => (!moving(t) ? t : { ...t, category: to, placedAt: placed.get(t.id) ?? t.placedAt }))
                    .sort(compareTodos);
                  return { ...prev, [view.space]: refiled };
                });
              }}
              idsIn={(c) => todosMap[view.space].filter((t) => t.category === c).map((t) => t.id)}
              // Read the tasks again once the server has saved (or undone) the change.
              onSynced={() => void loadDay()}
            />
          )}
        </DashboardMain>

        <DashboardAside>
          <Card id="progress-title" title="Progress">
            {!totalCount ? (
              <EmptyNote>
                No tasks for today.
              </EmptyNote>
            ) : (
              <div className="dash-hero">
                <ProgressRing percent={percentage} label={`of ${listDaily ? "daily" : "the day's"} tasks done`} />
                <div className="dash-hero-text">
                  <span className="todo-stats-fraction number-tabular">
                    {/* Plain numbers: the fraction never counts; only the ring fills (the user's call). */}
                    {doneCount} of {totalCount} done
                  </span>
                  <span className="muted">Today</span>
                </div>
              </div>
            )}
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
        {(editing ? editing.isRecurring : isDaily) && (
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
