"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { AddButton, Badge, BigNumber, Card, Checkbox, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FormModal, Page, SmallButton, Toolbar, ToolbarGroup } from "../components/blocks";
import { BellIcon } from "../components/icons";
import { ListBox, RowActions } from "../components/lists";
import { Segmented } from "../components/segmented";
import { ProgressRing } from "../components/charts";
import { undoWith, useToast } from "../components/toast";
import { useOnce } from "../components/once";
import { useServerState } from "../components/server-state";
import { remindersState } from "./reminders";
import { isPushEnabled } from "@/lib/features";
import {
  addTodoAction,
  deletePushSubscriptionAction,
  deleteTodoAction,
  loadTodosViewAction,
  restoreTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/actions/todos";
import type { TodoItem } from "@/lib/todos";
import { TODO_GONE, type TodoSpace } from "@/lib/validations/todos";
import { blockPlacements, compareTodos } from "@/lib/todo-order";

type TaskTab = "daily" | "one-day";

/** What a task toast touches (D-040): the task's row. */
const touches = (id: string) => [`todos:${id}`];
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
  // The task the form opened on (its values then), null for a new task.
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const closeForm = () => setIsTaskModalOpen(false);
  // Each space's list as the server sent it; the edit form closes when another device deletes its task.
  const editingIn = (s: TodoSpace) => (isTaskModalOpen && editing?.space === s ? editing.id : null);
  const [personalTodos, setPersonalTodos] = useServerState(initialPersonalTodos, { editing: editingIn("personal"), onDeleted: closeForm });
  const [businessTodos, setBusinessTodos] = useServerState(initialBusinessTodos, { editing: editingIn("business"), onDeleted: closeForm });
  const todosMap: Record<TodoSpace, TodoItem[]> = { personal: personalTodos, business: businessTodos };
  const updateList = (s: TodoSpace, change: (list: TodoItem[]) => TodoItem[]) => (s === "personal" ? setPersonalTodos : setBusinessTodos)(change);
  const [categories, setCategories] = useServerState(initialCategories);

  const { showToast } = useToast();
  const warn = (message: string) => showToast({ message, type: "warning" });
  // A tick or a Delete acts once per tap burst (D-043); Save gets the same from FormModal.
  const once = useOnce();
  const tappedButton = useRef<Element | null>(null);
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

  // Form state
  const [titleInput, setTitleInput] = useState("");
  const [reminderTimeInput, setReminderTimeInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("other");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // The id the open add form's task gets (D-040): made when the form opens, so a second Save after a lost answer adds nothing.
  const addId = useRef("");
  // Which opening of the form is on screen: a save answers the opening it came from, so it never closes or marks one
  // opened after it.
  const formOpening = useRef(0);
  const [savingIn, setSavingIn] = useState<number | null>(null);
  const [opening, setOpening] = useState(0);
  const saving = savingIn === opening;
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
  // The load a day switch started; a later switch that needs no load of its own waits for it.
  const loading = useRef<Promise<void>>(Promise.resolve());

  const isDaily = tab === "daily";
  const listDaily = view.tab === "daily";
  // The daily list shows its tasks under their category (each group in the list's own order); the Today list is flat.
  // Every list is today's: tasks are added for today only, and unfinished ones carry over.
  const listTodos = (() => {
    const list = todosMap[view.space].filter((t) => t.isRecurring === listDaily);
    return listDaily ? groupOrder(categories[view.space], list).flatMap((c) => list.filter((t) => t.category === c)) : list;
  })();
  const [isFolded, toggleFolded] = useFolded("todos");
  const foldKey = (category: string) => `${view.space}/${view.tab}/${category}`;
  // Whether a task belongs on the list the controls show now.
  const shows = (t: TodoItem) => {
    return t.isRecurring === (latest.current.tab === "daily");
  };

  // Progress counts the list on screen (`view`: its space and tab), so it never shows the last day's numbers while the
  // next one loads, and is labelled with that tab. A list with no tasks shows only a note, no ring.
  const doneCount = listTodos.filter((t) => t.isCompleted).length;
  const totalCount = listTodos.length;
  const percentage = Math.round((doneCount / (totalCount || 1)) * 100);

  // Whether reminders can be turned on here, and are: the browser's push subscription says so.
  useEffect(() => {
    if (!isPushEnabled()) return;
    remindersState()
      .then(({ supported, subscribed }) => {
        setPushSupported(supported);
        setPushSubscribed(subscribed);
      })
      .catch(() => {});
  }, []);

  // Loads both spaces and swaps them in with one state update, so the list never flashes empty.
  const loadDay = async () => {
    const id = ++requestId.current;
    try {
      const view = await loadTodosViewAction();
      if (!view.success) throw new Error(view.error);
      if (id === requestId.current) {
        setPersonalTodos(view.daily[0].todos);
        setBusinessTodos(view.daily[1].todos);
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
    setErrorMsg(null);
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setCategoryInput(todo?.category ?? "other");
    if (!todo) addId.current = crypto.randomUUID();
    formOpening.current += 1;
    setOpening(formOpening.current);
    setIsTaskModalOpen(true);
  };

  // The fields an edit changes: only those are sent, so another tab's change to the rest stays (D-040).
  type Editable = Pick<TodoItem, "title" | "reminderTime" | "category">;
  const changedFields = (from: TodoItem, to: Editable): Partial<Editable> =>
    Object.fromEntries((Object.keys(to) as (keyof Editable)[]).filter((k) => to[k] !== from[k]).map((k) => [k, to[k]]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = titleInput.trim();
    if (!title) return;
    const reminderTime = reminderTimeInput.trim() || null;
    const before = editing;
    const from = formOpening.current;
    // The answer belongs to the opening it came from: a form opened since stays as it is, and a refusal is told in a toast.
    const stillOpen = () => from === formOpening.current;
    // The server checks the limits; its message shows in the form, which keeps what was typed.
    const refused = (message: string) => (stillOpen() ? setErrorMsg(message) : warn(message));
    setErrorMsg(null);
    setSavingIn(from);
    try {
      if (before) {
        // Only a daily task has a category to pick; a one-off keeps the one it has.
        const changed = changedFields(before, { title, reminderTime, category: before.isRecurring ? categoryInput : before.category });
        const saved = updateTodoAction({ id: before.id, ...changed }).catch(() => null);
        const res = await saved;
        if (!res?.success) {
          if (res?.error !== TODO_GONE) return refused(res?.error ?? "Failed to save task");
          // Deleted on another device: the form closes and the row leaves.
          if (stillOpen()) closeForm();
          drop(before);
          return warn(res.error);
        }
        // The old values of the fields this edit changed, so its Undo leaves another tab's change to the rest alone.
        const undo = Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof Editable]])) as Partial<Editable>;
        const after = { ...before, ...changed };
        ++requestId.current;
        replace(after);
        keepCategory(after);
        if (stillOpen()) closeForm();
        showToast({
          message: `Saved "${title}"`,
          type: "success",
          touches: touches(before.id),
          saved,
          // Writes the old values back; if that fails the edit stays, so the screen matches the database.
          onUndo: undoWith(
            showToast,
            async () => {
              ++requestId.current;
              replace({ ...after, ...undo });
              const back = await updateTodoAction({ id: before.id, ...undo }).catch(() => null);
              if (back?.success) keepCategory({ ...after, ...undo });
              else replace(after);
              void loadDay();
              return back;
            },
            (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
          ),
        });
      } else {
        const saved = addTodoAction({
          id: addId.current,
          space,
          title,
          isRecurring: isDaily,
          recurrencePattern: isDaily ? "daily" : "none",
          dueDate: todayDate,
          reminderTime,
          category: isDaily ? categoryInput : "other",
        }).catch(() => null);
        const res = await saved;
        if (!res?.success) return refused(res?.error ?? "Failed to save task");
        const created = res.todo;
        ++requestId.current;
        if (shows(created)) putBack(created);
        keepCategory(created);
        if (stillOpen()) closeForm();
        // A repeat of an add whose answer was lost adds nothing (D-040): the toast says so, without an Undo.
        showToast(
          res.repeated
            ? { message: `Already added "${created.title}"`, type: "success", touches: touches(created.id), saved }
            : {
                message: `Added "${created.title}"`,
                type: "success",
                touches: touches(created.id),
                saved,
                onUndo: undoWith(
                  showToast,
                  async () => {
                    ++requestId.current;
                    drop(created);
                    const back = await deleteTodoAction(created.id).catch(() => null);
                    if (!back?.success && shows(created)) putBack(created);
                    void loadDay();
                    return back;
                  },
                  (back) => (back && !back.success ? back.error : "Failed to undo"),
                ),
              },
        );
      }
      await loadDay();
    } finally {
      setSavingIn((now) => (now === from ? null : now));
    }
  };

  // `completedAt` is when the box last changed: ticked goes to the top of the done tasks, unticked to the bottom of the open ones.
  // Undo passes the time from before the change, so the task goes back to where it was; left out, it is now.
  const setCompleted = (task: TodoItem, isCompleted: boolean, completedAt: Date | null = new Date()) =>
    updateList(task.space, (list) => list.map((t) => (t.id === task.id ? { ...t, isCompleted, completedAt } : t)).sort(compareTodos));

  const toggle = async (todo: TodoItem, next: boolean, withUndo: boolean, completedAt?: Date | null) => {
    ++requestId.current;
    setCompleted(todo, next, completedAt);
    const saved = toggleTodoAction({ id: todo.id, isCompleted: next, completedAt }).catch(() => null);
    if (withUndo) {
      showToast({
        message: next ? `Completed "${todo.title}"` : `Marked "${todo.title}" not done`,
        touches: touches(todo.id),
        saved,
        onUndo: () => void toggle(todo, !next, false, todo.completedAt),
      });
    }
    const res = await saved;
    if (!res?.success) warn(res?.error ?? "Failed to update task");
    // Refresh so the screen matches the database, whatever the server answered.
    await loadDay();
  };

  const handleToggleTodo = (todo: TodoItem) => once(`todos:${todo.id}`, () => toggle(todo, !todo.isCompleted, true), tappedButton.current);

  // Back in the list where the server would sort it.
  const putBack = (task: TodoItem) =>
    updateList(task.space, (list) => (list.some((t) => t.id === task.id) ? list : [...list, task].sort(compareTodos)));

  // The task as edited, where the server would sort it (a task deleted meanwhile stays off).
  const replace = (task: TodoItem) =>
    updateList(task.space, (list) => (list.some((t) => t.id === task.id) ? [...list.filter((t) => t.id !== task.id), task].sort(compareTodos) : list));

  // The server files a saved task under its category and creates the category if it is gone (an Undo after the category was deleted): the card shows it too.
  const keepCategory = ({ space, category }: TodoItem) =>
    setCategories((prev) => (category === "other" || prev[space].includes(category) ? prev : { ...prev, [space]: [...prev[space], category] }));

  const drop = (task: TodoItem) => updateList(task.space, (list) => list.filter((t) => t.id !== task.id));

  // What the server needs to put a task back as it was.
  const snapshot = ({ id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, createdAt, placedAt, completedAt }: TodoItem) => ({
    id, space, title, isRecurring, recurrencePattern, dueDate, reminderTime, isCompleted, isCarriedOver, category, createdAt, placedAt, completedAt,
  });

  // Nothing waits on the network: the row leaves and the toast shows at once; a failed delete puts the row back.
  // Undo restores the same task.
  const handleDeleteTodo = (target: TodoItem) => {
    ++requestId.current;
    drop(target);
    const saved = deleteTodoAction(target.id).catch(() => null);
    // true: removed now; false: the call failed; "gone": it was already deleted elsewhere, so there is nothing to undo.
    const deleted = saved.then((res) => (res?.success ? (res.deleted ? true : ("gone" as const)) : false));
    showToast({
      message: `Removed "${target.title}"`,
      touches: touches(target.id),
      saved,
      onUndo: undoWith(
        showToast,
        async () => {
          ++requestId.current;
          if ((await deleted) === "gone") return true; // deleted elsewhere: Undo must not bring it back
          // Only onto the list it was on, if that is still the one on screen.
          if (shows(target)) putBack(target);
          if (!(await deleted)) return true; // the delete never happened
          const back = await restoreTodoAction(snapshot(target)).catch(() => null);
          if (back?.success) keepCategory(target);
          else if (shows(target)) drop(target);
          void loadDay();
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore task"),
      ),
    });
    void saved.then((res) => {
      if (res?.success) {
        if (!res.deleted) warn(`"${target.title}" was already removed`);
        return void loadDay();
      }
      if (shows(target)) putBack(target);
      warn(res?.error ?? "Failed to remove task");
    });
    return saved;
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
        onUndo: undoWith(
          showToast,
          async () => {
            setPushSubscribed(false);
            try {
              if (!(await deletePushSubscriptionAction(enabled.endpoint)).success) throw new Error("not removed");
              await enabled.unsubscribe();
              return true;
            } catch {
              setPushSubscribed(true);
              return false;
            }
          },
          "Failed to turn reminders off",
        ),
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
                    <div className="todo-row" onClickCapture={(e) => (tappedButton.current = (e.target as Element).closest("button"))}>
                      <Checkbox
                        checked={task.isCompleted}
                        onChange={() => handleToggleTodo(task)}
                        label={`Mark ${task.title} as ${task.isCompleted ? "incomplete" : "complete"}`}
                      />

                      <div className="todo-main">
                        <span className={`todo-title ${task.isCompleted ? "completed" : ""}`}>{task.title}</span>
                        {((!listDaily && task.isCarriedOver) || (task.reminderTime && isPushEnabled())) && (
                          <div className="badge-row">
                            {!listDaily && task.isCarriedOver && <Badge kind="info">Carried over</Badge>}
                            {task.reminderTime && isPushEnabled() && <Badge kind="info">{task.reminderTime}</Badge>}
                          </div>
                        )}
                      </div>

                      <RowActions bare onEdit={() => openForm(task)} onDelete={() => once(`todos:${task.id}`, () => handleDeleteTodo(task), tappedButton.current)} editLabel={`Edit ${task.title}`} deleteLabel={`Delete ${task.title}`} />
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
                updateList(view.space, (list) => {
                  // As the server files them: repeating tasks land on top of the new category as one block, in the order they had.
                  const moving = (t: TodoItem) => t.category === from && (!only || only.includes(t.id));
                  const placed = blockPlacements(list.filter((t) => moving(t) && t.isRecurring));
                  return list.map((t) => (!moving(t) ? t : { ...t, category: to, placedAt: placed.get(t.id) ?? t.placedAt })).sort(compareTodos);
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
              <EmptyNote>{listDaily ? "No daily tasks yet." : "No tasks for today."}</EmptyNote>
            ) : (
              <div className="dash-hero">
                <div className="dash-hero-text">
                  {/* Plain numbers: the fraction never counts; only the ring fills (the user's call). */}
                  <BigNumber value={doneCount} of={`of ${totalCount} done`} />
                  <span className="muted">{listDaily ? "Daily" : "Today"}</span>
                </div>
                <ProgressRing percent={percentage} label={`of ${listDaily ? "daily" : "the day's"} tasks done`} />
              </div>
            )}
          </Card>

          {/* Last in the aside: it appears once the service worker is ready, so nothing sits below it to shift. */}
          {pushSupported && !pushSubscribed && (
            <Card className="push-toggle-card" label="Task reminders">
              <span className="push-toggle-label">
                <BellIcon size={16} /> Task reminders
              </span>
              <SmallButton onClick={handleEnablePush}>Enable</SmallButton>
            </Card>
          )}
        </DashboardAside>
      </Dashboard>

      <FormModal
        isOpen={isTaskModalOpen}
        onClose={closeForm}
        title={editing ? "Edit task" : isDaily ? "New daily task" : "New task"}
        onSubmit={handleSubmit}
        error={errorMsg}
        errorId="task-title-error"
        busy={saving}
        canSubmit={!!titleInput.trim()}
      >
        <Field
          label="Title"
          type="text"
          required
          disabled={saving}
          value={titleInput}
          onChange={(e) => {
            setTitleInput(e.target.value);
            setErrorMsg(null);
          }}
          aria-invalid={errorMsg ? true : undefined}
          aria-describedby={errorMsg ? "task-title-error" : undefined}
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
