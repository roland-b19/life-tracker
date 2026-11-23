"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CategoriesCard, CategoryField, GroupedList, groupOrder, scopedCategories, useFolded } from "../components/categories-card";
import { AddButton, Badge, BigNumber, Card, Checkbox, Dashboard, DashboardAside, DashboardMain, EmptyNote, Field, FormModal, Page, SmallButton, Toolbar, ToolbarGroup, type FormOpening } from "../components/blocks";
import { changedFields } from "../components/forms";
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
  // The list shows this view, which follows the controls a render later.
  const [view, setView] = useState({
    space: "personal" as TodoSpace,
    tab: "daily" as TaskTab,
  });
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
  const [errorMsg, setErrorMsg] = useState("");
  // Flows that finish seconds later (Undo, a refresh) read the controls as they are then.
  const latest = useRef({ tab });
  useEffect(() => {
    latest.current = { tab };
  });

  // Push notifications state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

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

  // The controls switch at once; the list follows a render later.
  const switchView = (next: { space?: TodoSpace; tab?: TaskTab }) => {
    const target = { space, tab, ...next };
    if (target.space === space && target.tab === tab) return;
    scrolled.current = window.scrollY;
    setSpace(target.space);
    setTab(target.tab);
    setView(target);
  };

  const openForm = (todo?: TodoItem) => {
    setErrorMsg("");
    setEditing(todo ?? null);
    setTitleInput(todo?.title ?? "");
    setReminderTimeInput(todo?.reminderTime ?? "");
    setCategoryInput(todo?.category ?? "other");
    setIsTaskModalOpen(true);
  };

  type Editable = Pick<TodoItem, "title" | "reminderTime" | "category">;

  const handleSubmit = async (e: React.FormEvent, { id, stillOpen }: FormOpening) => {
    e.preventDefault();
    const title = titleInput.trim();
    if (!title) return;
    const reminderTime = reminderTimeInput.trim() || null;
    const before = editing;
    // The answer belongs to the opening it came from: a form closed or opened since stays as it is. The server checks
    // the limits; its message shows in the form, which keeps what was typed, or in a toast once the form is gone.
    const refused = (message: string) => (stillOpen() ? setErrorMsg(message) : warn(message));
    setErrorMsg("");
    if (before) {
      // Only a daily task has a category to pick; a one-off keeps the one it has.
      const changed = changedFields(before, { title, reminderTime, category: before.isRecurring ? categoryInput : before.category });
      const res = await updateTodoAction({ id: before.id, ...changed }).catch(() => null);
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
      putFields(before, changed);
      keepCategory(after);
      if (stillOpen()) closeForm();
      showToast({
        message: `Saved "${title}"`,
        type: "success",
        touches: touches(before.id),
        // Writes the old values back; if that fails the edit stays, so the screen matches the database.
        onUndo: undoWith(
          showToast,
          async () => {
            putFields(before, undo);
            const back = await updateTodoAction({ id: before.id, ...undo }).catch(() => null);
            if (back?.success) keepCategory({ ...after, ...undo });
            else putFields(before, changed);
            return back;
          },
          (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
        ),
      });
    } else {
      const res = await addTodoAction({
        id,
        space,
        title,
        isRecurring: isDaily,
        recurrencePattern: isDaily ? "daily" : "none",
        dueDate: todayDate,
        reminderTime,
        category: isDaily ? categoryInput : "other",
      }).catch(() => null);
      if (!res?.success) return refused(res?.error ?? "Failed to save task");
      const created = res.todo;
      if (shows(created)) putBack(created);
      keepCategory(created);
      if (stillOpen()) closeForm();
      // A repeat of an add whose answer was lost adds nothing (D-040): the toast says so, without an Undo.
      showToast(
        res.repeated
          ? { message: `Already added "${created.title}"`, type: "success", touches: touches(created.id) }
          : {
              message: `Added "${created.title}"`,
              type: "success",
              touches: touches(created.id),
              onUndo: undoWith(
                showToast,
                async () => {
                  drop(created);
                  const back = await deleteTodoAction(created.id).catch(() => null);
                  if (!back?.success && shows(created)) putBack(created);
                  return back;
                },
                (back) => (back && !back.success ? back.error : "Failed to undo"),
              ),
            },
      );
    }
  };

  // `completedAt` is when the box last changed: ticked goes to the top of the done tasks, unticked to the bottom of the open ones.
  // Undo passes the time from before the change, so the task goes back to where it was; left out, it is now.
  // Answers the box as the screen held it before, filled in by the update, which React has run by the time the server answers.
  const setCompleted = (task: TodoItem, isCompleted: boolean, completedAt: Date | null = new Date()) => {
    const was = { isCompleted: task.isCompleted, completedAt: task.completedAt };
    updateList(task.space, (list) =>
      list
        .map((t) => {
          if (t.id !== task.id) return t;
          Object.assign(was, { isCompleted: t.isCompleted, completedAt: t.completedAt });
          return { ...t, isCompleted, completedAt };
        })
        .sort(compareTodos),
    );
    return was;
  };

  // A tick, or (withUndo false) its Undo, whose failure undoWith tells. Answers the server's answer.
  const toggle = async (
    todo: TodoItem,
    next: boolean,
    withUndo: boolean,
    completedAt?: Date | null,
  ): Promise<Awaited<ReturnType<typeof toggleTodoAction>> | null> => {
    const was = setCompleted(todo, next, completedAt);
    const saved = toggleTodoAction({ id: todo.id, isCompleted: next, completedAt }).catch(() => null);
    if (withUndo) {
      showToast({
        message: next ? `Completed "${todo.title}"` : `Marked "${todo.title}" not done`,
        touches: touches(todo.id),
        saved,
        onUndo: undoWith(
          showToast,
          () => toggle(todo, !next, false, todo.completedAt),
          (back) => (back && !back.success ? back.error : "Failed to undo"),
        ),
      });
    }
    const res = await saved;
    // A failed write puts the box back as it was; the refresh after an answer brings the rest (D-034).
    if (!res?.success) setCompleted(todo, was.isCompleted, was.completedAt);
    if (withUndo && !res?.success) warn(res?.error ?? "Failed to update task");
    return res;
  };

  const handleToggleTodo = (todo: TodoItem) => once(`todos:${todo.id}`, () => toggle(todo, !todo.isCompleted, true), tappedButton.current);

  // Back in the list where the server would sort it.
  const putBack = (task: TodoItem) =>
    updateList(task.space, (list) => (list.some((t) => t.id === task.id) ? list : [...list, task].sort(compareTodos)));

  // Puts these fields onto the task as the screen holds it now, so a change another tab made since stays on screen (a task
  // deleted meanwhile stays off); the D-034 refresh brings the rest.
  const putFields = (task: TodoItem, fields: Partial<TodoItem>) =>
    updateList(task.space, (list) => list.map((t) => (t.id === task.id ? { ...t, ...fields } : t)).sort(compareTodos));

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
          if ((await deleted) === "gone") return true; // deleted elsewhere: Undo must not bring it back
          // Only onto the list it was on, if that is still the one on screen.
          if (shows(target)) putBack(target);
          if (!(await deleted)) return true; // the delete never happened
          const back = await restoreTodoAction(snapshot(target)).catch(() => null);
          if (back?.success) keepCategory(target);
          else if (shows(target)) drop(target);
          return back;
        },
        (back) => (back && !back.success ? back.error : "Failed to restore task"),
      ),
    });
    void saved.then((res) => {
      if (res?.success) {
        if (!res.deleted) warn(`"${target.title}" was already removed`);
        return;
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
        touches: [`push_subscriptions:${res.subscription.id}`],
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
        canSubmit={!!titleInput.trim()}
      >
        <Field
          label="Title"
          type="text"
          required
          value={titleInput}
          onChange={(e) => {
            setTitleInput(e.target.value);
            setErrorMsg("");
          }}
          aria-invalid={errorMsg ? true : undefined}
          aria-describedby={errorMsg ? "task-title-error" : undefined}
        />
        {(editing ? editing.isRecurring : isDaily) && (
          <CategoryField categories={categories[editing?.space ?? space]} value={categoryInput} onChange={setCategoryInput} />
        )}
        {/* Without push there is nothing to remind with; an existing time stays untouched on save. */}
        {isPushEnabled() && (
          <Field label="Reminder (optional)" type="time" value={reminderTimeInput} onChange={(e) => setReminderTimeInput(e.target.value)} />
        )}
      </FormModal>
    </Page>
  );
}
