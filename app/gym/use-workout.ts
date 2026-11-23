"use client";

import { toISODate } from "@/lib/format-date";
import {
  NOTES_CHANGED,
  SET_GONE,
  SETS_LOGGED,
  sessionNote,
  WORKOUT_ENDED_ELSEWHERE,
  WORKOUT_FINISHED,
  WORKOUT_GONE,
  type RestoreSessionInput,
} from "@/lib/validations/gym";
import type { Answer } from "@/lib/validations/result";
import { useEffect, useRef, useState } from "react";
import { useOnce } from "../components/once";
import { useRefreshesSent } from "../providers";
import { useServerState } from "../components/server-state";
import { undoWith, useToast } from "../components/toast";
import { emptyInput, canLog, UNCHECKED, type SetInput } from "./exercise-logger";
import type { ActiveSessionData, ExerciseItem, SplitDay, WorkoutSetData, WorkoutTimer } from "./types";
import {
  cancelSessionAction,
  deleteSetAction,
  finishSessionAction,
  addSetAction,
  pauseSessionAction,
  reopenSessionAction,
  restoreSessionAction,
  resumeSessionAction,
  saveSessionNotesAction,
  addSessionAction,
} from "@/actions/gym";

type AnomalyReason = RestoreSessionInput["sets"][number]["anomalyReason"];

/** What an Undo toast of the workout touches (D-040): the workout's row, and the rows of the sets it names. */
const touchesOf = (sessionId: string, sets: { id: string }[] = []) => [`workout_sessions:${sessionId}`, ...sets.map((s) => `workout_sets:${s.id}`)];

/** 7:05 or 1:02:09. */
export function formatClock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * The seconds a workout's clock shows: the server's count (D-039) plus the time since it answered, ticking while the
 * timer runs. Every device asks the same row, so they show the same time.
 */
function useClock(timer: WorkoutTimer | undefined) {
  const [shown, setShown] = useState(timer?.seconds ?? 0);
  useEffect(() => {
    if (!timer) return;
    const from = Date.now();
    const show = () => setShown(timer.seconds + (timer.running ? Math.floor((Date.now() - from) / 1000) : 0));
    show();
    if (!timer.running) return;
    const tick = setInterval(show, 1000);
    return () => clearInterval(tick);
  }, [timer]);
  return shown;
}

/**
 * The workout in hand: starting, logging, pausing, leaving, resuming, finishing and cancelling it, each with its Undo.
 * The timer is the server's (D-039). `busy` is the page's one saving flag, so every control on the page waits for the
 * same write; every write button also acts once per tap burst (D-043).
 */
export function useWorkout({
  openSession,
  refresh,
  days,
  isDeloadMode,
  setBusy,
  selectDay,
}: {
  openSession: ActiveSessionData | null;
  refresh: number;
  days: SplitDay[];
  isDeloadMode: boolean;
  setBusy: (busy: boolean) => void;
  selectDay: (id: string) => void;
}) {
  const { showToast } = useToast();
  const once = useOnce();
  const refreshesSent = useRefreshesSent();
  const warn = (message: string) => showToast({ message, type: "warning" });
  // A server value rendered for a refresh sent before the answer of the last write that put a workout in hand (`take`)
  // may be from before that write, and Next can apply it after the write's change: it is set aside, and the page keeps
  // the last later one (`server`), until a refresh sent after the answer (one always follows a write) brings a newer one.
  const [floor, setFloor] = useState(-1);
  const fresh = refresh > floor;
  const [server, setServer] = useState(openSession);
  if (fresh && server !== openSession) setServer(openSession);
  // The open workout is the server's (D-034): a refresh replaces it (its timer and sets, paused or logged on another
  // device). `handId` says it is the workout in hand; otherwise it is the banner's, left without finishing (Exit, or a
  // reload), whose sets stay saved and which Resume brings back.
  const [open, setOpen] = useServerState(server);
  const [handId, setHandId] = useState<string | null>(null);
  const activeSession = open && open.id === handId ? open : null;
  const paused = open && open.id !== handId ? open : null;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  /** Puts the workout in hand, after its write's answer: server values rendered before now are set aside (above). */
  const take = (id: string) => {
    setHandId(id);
    setFloor(refreshesSent());
  };
  // A workout in hand that the server no longer has open (finished or cancelled elsewhere) leaves the screen,
  // and a toast says so; as in `useServerState`, the state changes while rendering and the toast follows. A later server
  // value without it ends it too when the one before had none either (no change for `useServerState`).
  const [ended, setEnded] = useState<{ id: string } | null>(null);
  if (handId && (open?.id !== handId || (fresh && openSession?.id !== handId))) {
    if (fresh) setOpen(openSession);
    setHandId(null);
    setConfirmCancel(false);
    setSessionNotes("");
    setEnded({ id: handId });
  }
  const live = useRef<ActiveSessionData | null>(null); // the workout in hand, for an Undo that comes back later
  useEffect(() => {
    live.current = activeSession ?? paused;
  });
  const toldEnded = useRef(ended);
  useEffect(() => {
    if (!ended || toldEnded.current === ended) return;
    toldEnded.current = ended;
    showToast({ message: WORKOUT_ENDED_ELSEWHERE, type: "warning" });
  }, [ended, showToast]);
  /**
   * Says why a write of the workout `id` was refused. A workout that ended elsewhere (`WORKOUT_FINISHED`,
   * `WORKOUT_GONE`) leaves the screen at once, with the one toast a refresh would show; it is no longer in hand then, so
   * that refresh shows none.
   */
  const refused = (id: string, error: string) => {
    if (error !== WORKOUT_FINISHED && error !== WORKOUT_GONE) return warn(error);
    // At once, not at the next render: a write already waiting on this one (a notes save of newer text, behind the save
    // the tap's blur sent) then sends nothing, so it is not refused and told a second time.
    if (live.current?.id === id) live.current = null;
    setOpen((o) => (o?.id === id ? null : o));
    setHandId((hand) => (hand === id ? null : hand));
    setConfirmCancel(false);
    setSessionNotes("");
    warn(WORKOUT_ENDED_ELSEWHERE);
  };
  // The notes as the server holds them, and the last save (with the workout and text it sends while it is in flight): a
  // save sends only the change from them (D-040).
  const savedNotes = useRef("");
  const notesSave = useRef<{ run: Promise<boolean>; id?: string; text?: string }>({ run: Promise.resolve(true) });
  // Exercises opened in the workout; they start collapsed and are not kept between workouts.
  const [openEx, setOpenEx] = useState<string[]>([]);
  // Per-exercise quick log input state
  const [inputStates, setInputStates] = useState<Record<string, SetInput>>({});
  const clock = useClock((activeSession ?? paused)?.timer);
  // After a NOTES_CHANGED refusal, the page's next server data (every answer brings a refresh, D-034) gives the notes the
  // next save changes from, so the device is not refused again. The field shows the server's notes, then what was typed
  // (D-047; a space between them, as the field is one line), unless it holds them already, where this merge puts them
  // (the whole field, or its start before a space; not anywhere inside it, so short notes such as "5" are not taken as
  // held by "Bench 5x5"): the next save keeps the other device's notes and nothing typed is lost. As in `useServerState`, the field changes while rendering and the effect
  // then sets what saves change from.
  const [notesStale, setNotesStale] = useState(false);
  /** Every notes write (a save, its Undo) calls this with its answer: a NOTES_CHANGED refusal marks the notes stale. */
  const notesAnswered = (res: Answer | null) => {
    if (res && !res.success && res.error === NOTES_CHANGED) setNotesStale(true);
  };
  const [notesSeen, setNotesSeen] = useState(server);
  const [theirNotes, setTheirNotes] = useState<{ text: string } | null>(null);
  if (notesSeen !== server) {
    setNotesSeen(server);
    if (notesStale && server && server.id === (activeSession ?? paused)?.id) {
      const theirs = server.notes ?? "";
      setNotesStale(false);
      setTheirNotes({ text: theirs });
      const holds = (typed: string) => typed === theirs || typed.startsWith(`${theirs} `);
      if (theirs) setSessionNotes((typed) => (holds(typed) ? typed : typed ? `${theirs} ${typed}` : theirs));
    }
  }
  useEffect(() => {
    if (theirNotes) savedNotes.current = theirNotes.text;
  }, [theirNotes]);

  const dropSet = (id: string) => setOpen((prev) => prev && { ...prev, sets: prev.sets.filter((s) => s.id !== id) });
  const putBackSet = (set: WorkoutSetData) => {
    setOpen((prev) =>
      prev && { ...prev, sets: [...prev.sets.filter((s) => s.id !== set.id), set].sort((a, b) => a.setOrder - b.setOrder) },
    );
  };
  const setTimer = (id: string, timer: WorkoutTimer) => {
    setOpen((prev) => (prev?.id === id ? { ...prev, timer } : prev));
  };
  // Selects the workout's own day on the page, when the routine still has it.
  const showDay = (dayId: string | null | undefined) => {
    if (dayId && days.some((d) => d.id === dayId)) selectDay(dayId);
  };
  // A write of the workout's own (Start, Pause or Resume, Finish, Exit): one at a time, with the page's saving flag.
  const write = (run: () => Promise<void>, failed: string, spot?: Element | null) =>
    once(
      "workout",
      async () => {
        setBusy(true);
        try {
          await run();
        } catch {
          warn(failed);
        } finally {
          setBusy(false);
        }
      },
      spot,
    );

  // Start on a day that already has a workout gets that one back (D-039); `from` says how, and Undo reverses just that.
  // The screen shows the workout the server answered (its day and sets), never just the day that was tapped.
  function start(day: SplitDay, spot?: Element | null) {
    if (day.isRest) return;
    write(async () => {
      const res = await addSessionAction({ id: crypto.randomUUID(), date: toISODate(), splitDayId: day.id, isDeload: isDeloadMode });
      if (!res.success) return warn(res.error);
      const { session, sets, timer, from, splitDayName: name } = res;
      const started: ActiveSessionData = {
        id: session.id,
        timer,
        createdAt: session.createdAt,
        date: session.date,
        isDeload: session.isDeload,
        splitDayId: session.splitDayId,
        splitDayName: name,
        notes: session.notes,
        sets,
      };
      showDay(session.splitDayId);
      setOpen(started);
      take(started.id);
      showNotes(session.notes);
      const touches = touchesOf(session.id);
      if (from === "running") return showToast({ message: `"${name}" is already under way`, type: "success" });
      if (from === "paused") {
        return showToast({
          message: `Resumed "${name}"`,
          type: "success",
          touches,
          onUndo: undoWith(showToast, async () => {
            const res = await pauseSessionAction({ id: session.id });
            if (res.success) setTimer(session.id, res.timer);
            return res;
          }),
        });
      }
      if (from === "finished") {
        return showToast({
          message: `Reopened "${name}"`,
          type: "success",
          touches,
          onUndo: undoWith(showToast, async () => {
            if (live.current?.id !== session.id) {
              warn("Finish or leave the current workout first");
              return true;
            }
            const res = await finishSessionAction({ id: session.id });
            if (res.success) {
              setOpen((o) => (o?.id === session.id ? null : o));
              setHandId(null);
              setSessionNotes("");
            }
            return res;
          }),
        });
      }
      showToast({
        message: `Started "${name}"`,
        type: "success",
        touches,
        // Only while nothing is logged: Undo must not delete sets. The server checks too (`onlyEmpty`), so a set logged
        // on another device is never deleted; its refusal shows in the toast (D-040).
        onUndo: undoWith(
          showToast,
          async () => {
            const now = live.current;
            if (now?.id !== session.id || now.sets.length > 0) {
              warn(SETS_LOGGED);
              return true;
            }
            const gone = await cancelSessionAction({ id: session.id, onlyEmpty: true }).catch(() => null);
            if (gone?.success) {
              setConfirmCancel(false);
              setOpen((o) => (o?.id === session.id ? null : o));
              setHandId(null);
              setSessionNotes("");
            }
            return gone;
          },
          (back) => (back && !back.success ? back.error : "Failed to undo"),
        ),
      });
    }, "Failed to start workout", spot);
  }

  /** The Pause and Resume button: the server stops or restarts the workout's timer, and Undo turns it back. */
  function toggleTimer(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    const run = !session.timer.running;
    const turn = async (on: boolean) => {
      const res = on ? await resumeSessionAction({ id: session.id }) : await pauseSessionAction({ id: session.id });
      if (res.success) setTimer(session.id, res.timer);
      return res;
    };
    write(async () => {
      const res = await turn(run);
      if (!res.success) return refused(session.id, res.error);
      showToast({
        message: run ? "Resumed the timer" : "Paused the timer",
        type: "success",
        touches: touchesOf(session.id),
        onUndo: undoWith(showToast, () => turn(!run)),
      });
    }, run ? "Failed to resume the timer" : "Failed to pause the timer", spot);
  }

  // The server numbers the set (D-040): two pages logging into one workout never repeat a number. The checks go back to
  // unchecked for the next set (D-039); reps and value stay, for straight sets.
  function logSet(exercise: ExerciseItem, spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    const state = inputStates[exercise.exerciseId] || emptyInput(exercise);
    if (!canLog(state)) return; // the button stays disabled until the set is complete
    write(async () => {
      // The id is made here (D-040), so a set sent twice is one set.
      const res = await addSetAction({
        id: crypto.randomUUID(),
        sessionId: session.id,
        exerciseId: exercise.exerciseId,
        reps: Number(state.reps),
        loadType: state.loadType,
        loadValue: Number(state.loadValue || 0),
        isFailure: state.isFailure,
        isPartial: state.isPartial,
        isGoodForm: state.isGoodForm,
        notes: state.notes || undefined,
      });
      if (!res.success) return refused(session.id, res.error);
      const logged: WorkoutSetData = {
        id: res.set.id,
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        muscleGroup: exercise.muscleGroup,
        equipmentType: exercise.equipmentType,
        setOrder: res.set.setOrder,
        reps: res.set.reps,
        loadType: res.set.loadType,
        loadValue: res.set.loadValue,
        extraKg: res.set.extraKg,
        isFailure: res.set.isFailure,
        isPartial: res.set.isPartial,
        isGoodForm: res.set.isGoodForm,
        flagAnomaly: res.set.flagAnomaly,
        anomalyReason: res.set.anomalyReason,
        notes: res.set.notes,
        createdAt: res.set.createdAt,
      };
      setOpen((prev) => (prev?.id === session.id ? { ...prev, sets: [...prev.sets, logged] } : prev));
      setInputStates((prev) => ({ ...prev, [exercise.exerciseId]: { ...state, ...UNCHECKED } }));
      showToast({
        message: res.set.flagAnomaly
          ? `Added set ${logged.setOrder} (below the ${exercise.minReps} – ${exercise.maxReps} target)`
          : `Added set ${logged.setOrder}`,
        type: res.set.flagAnomaly ? "warning" : "success",
        touches: [`workout_sets:${logged.id}`],
        // A set already deleted (elsewhere) leaves nothing to undo, and never a row that is not saved.
        onUndo: undoWith(
          showToast,
          async () => {
            dropSet(logged.id);
            const gone = await deleteSetAction(logged.id).catch(() => null);
            if (gone?.success || (gone && gone.error === SET_GONE)) return true;
            putBackSet(logged);
            return gone;
          },
          (back) => (back && !back.success ? back.error : "Failed to undo"),
        ),
      });
    }, "Failed to add set", spot);
  }

  // Nothing waits on the network: the row leaves and the toast shows at once (D-047); a refused delete, or one with no
  // answer, puts the row back, takes the toast away and says why (a finished workout keeps its sets).
  function deleteSet(set: WorkoutSetData, spot?: Element | null) {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    once(
      `workout_sets:${set.id}`,
      () => {
        const deleted = deleteSetAction(set.id).catch(() => null);
        dropSet(set.id);
        showToast({
          message: `Removed set ${set.setOrder}`,
          touches: [`workout_sets:${set.id}`],
          // A set already gone counts as removed (D-046, D-047): the toast stays.
          saved: deleted.then((res) => (res && !res.success && res.error === SET_GONE ? { success: true as const } : res)),
          onUndo: undoWith(showToast, async () => {
            if (!(await deleted)?.success) return true; // the refusal below put it back, or it was gone already
            const res = await addSetAction({
              id: set.id,
              createdAt: set.createdAt,
              sessionId,
              exerciseId: set.exerciseId,
              setOrder: set.setOrder,
              reps: set.reps,
              loadType: set.loadType,
              loadValue: Number(set.loadValue),
              extraKg: Number(set.extraKg),
              isFailure: set.isFailure,
              isPartial: set.isPartial,
              isGoodForm: set.isGoodForm,
              flagAnomaly: set.flagAnomaly,
              anomalyReason: set.anomalyReason as AnomalyReason,
              notes: set.notes || undefined,
            }).catch(() => null);
            // A set logged meanwhile may have taken its number: the server gives it the next one.
            if (res?.success) putBackSet({ ...set, setOrder: res.set.setOrder });
            return res;
          }, (back) => (back && !back.success ? back.error : "Failed to restore set")),
        });
        return deleted.then((res) => {
          if (res?.success || res?.error === SET_GONE) return;
          putBackSet(set);
          if (res) refused(sessionId, res.error);
          else warn("Failed to remove set");
        });
      },
      spot,
    );
  }

  /** Shows the notes the server holds: the field's text and what the next save changes from. */
  function showNotes(notes: string | null | undefined) {
    savedNotes.current = notes ?? "";
    setSessionNotes(notes ?? "");
  }

  /**
   * Saves the notes field when the server would save it as other notes than it holds (D-040: the change only, refused
   * when they changed elsewhere), after any save in flight. Answers false when the save was refused or failed; it says why.
   * A workout no longer in hand once that save has answered (it ended elsewhere, and that refusal said so) sends nothing.
   * The same text for the same workout as the save in flight (Exit's or Finish's save after the tap's blur sent one)
   * answers with that save, so a refusal is not sent and told twice.
   */
  function saveNotes(text = sessionNotes): Promise<boolean> {
    const session = activeSession;
    const last = notesSave.current;
    if (!session || (last.id === session.id && last.text === text)) return last.run;
    const run = last.run.then(async () => {
      if (live.current?.id !== session.id) return false;
      const from = savedNotes.current;
      // Compared as the server saves it (trimmed, invisible-only is none); too long text goes, for the server's reason.
      const to = sessionNote.safeParse(text);
      if (to.success && (to.data ?? "") === from) return true;
      const res = await saveSessionNotesAction({ id: session.id, notes: { from: from || null, to: text } }).catch(() => null);
      notesAnswered(res);
      if (!res?.success) {
        if (res) refused(session.id, res.error);
        else warn("Failed to save the notes");
        return false;
      }
      savedNotes.current = res.notes ?? "";
      showToast({
        message: "Saved the notes",
        type: "success",
        touches: touchesOf(session.id),
        onUndo: undoWith(
          showToast,
          async () => {
            const back = await saveSessionNotesAction({ id: session.id, notes: { from: res.notes, to: from || null } });
            notesAnswered(back);
            if (back.success && live.current?.id === session.id) showNotes(back.notes);
            return back;
          },
          (back) => (back && !back.success ? back.error : "Failed to restore the notes"),
        ),
      });
      return true;
    });
    const save = { run, id: session.id, text };
    notesSave.current = save;
    const settled = () => {
      if (notesSave.current === save) notesSave.current = { run };
    };
    run.then(settled, settled);
    return run;
  }

  // Exit pauses the timer: a workout left for later does not count the time away. Resume (the banner) runs it again.
  // Notes typed and not saved yet are saved first.
  function exit(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    write(async () => {
      if (!(await saveNotes())) return;
      const res = await pauseSessionAction({ id: session.id });
      if (!res.success) return refused(session.id, res.error);
      setOpen({ ...session, timer: res.timer, notes: savedNotes.current || null });
      setConfirmCancel(false);
      setHandId(null);
    }, "Failed to leave the workout", spot);
  }

  function resume(spot?: Element | null) {
    const session = paused;
    if (!session) return;
    write(async () => {
      const res = await resumeSessionAction({ id: session.id });
      if (!res.success) return warn(res.error);
      showDay(session.splitDayId);
      setOpen({ ...session, timer: res.timer });
      take(session.id);
      showNotes(session.notes);
    }, "Failed to resume the workout", spot);
  }

  // Undo hands a workout back as it was, unless another one was started in the meantime. A refusal shows the server's
  // own words (D-040); `failed` only when no answer came.
  function takeBack(back: () => Promise<Answer<{ session: ActiveSessionData }>>, failed: string) {
    return undoWith(
      showToast,
      async () => {
        if (live.current) {
          warn("Finish or leave the current workout first");
          return true;
        }
        const res = await back();
        if (!res.success) return res;
        showDay(res.session.splitDayId);
        showNotes(res.session.notes);
        setOpen(res.session);
        take(res.session.id);
        return res;
      },
      (back) => (back && !back.success ? back.error : failed),
    );
  }

  /** Undo of Cancel, and of a Finish that deleted an empty workout: the workout comes back with its ids, sets and timer. */
  function restore(snap: ActiveSessionData, timer: WorkoutTimer) {
    return async (): Promise<Answer<{ session: ActiveSessionData }>> => {
      const res = await restoreSessionAction({
        id: snap.id,
        createdAt: snap.createdAt,
        date: snap.date,
        splitDayId: snap.splitDayId,
        isDeload: snap.isDeload,
        notes: snap.notes ?? null,
        timerSeconds: timer.seconds,
        timerRunning: timer.running,
        sets: snap.sets.map((x) => ({
          id: x.id,
          createdAt: x.createdAt,
          exerciseId: x.exerciseId,
          setOrder: x.setOrder,
          reps: x.reps,
          loadType: x.loadType as "kg" | "plates" | "bodyweight",
          loadValue: Number(x.loadValue),
          extraKg: Number(x.extraKg),
          isFailure: x.isFailure,
          isPartial: x.isPartial,
          isGoodForm: x.isGoodForm,
          flagAnomaly: x.flagAnomaly,
          anomalyReason: x.anomalyReason as AnomalyReason,
          notes: x.notes,
        })),
      });
      if (!res.success) return res;
      const { session, sets } = res.details;
      return {
        success: true,
        session: {
          id: session.id,
          timer: res.details.timer,
          createdAt: session.createdAt,
          date: session.date,
          isDeload: session.isDeload,
          splitDayId: session.splitDayId,
          splitDayName: snap.splitDayName,
          notes: session.notes,
          sets,
        },
      };
    };
  }

  // The notes are saved first, so the Undo brings them back too.
  function cancel(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    write(async () => {
      // A refusal (of the notes or of the Cancel) closes the Keep/Delete question too: the toast says why.
      if (!(await saveNotes())) return setConfirmCancel(false);
      const snap = { ...session, notes: savedNotes.current || null };
      const res = await cancelSessionAction({ id: session.id });
      setConfirmCancel(false);
      if (!res.success) return refused(session.id, res.error);
      setOpen(null);
      setHandId(null);
      setSessionNotes("");
      showToast({
        message: "Cancelled the workout",
        type: "success",
        touches: touchesOf(snap.id, snap.sets),
        onUndo: takeBack(restore(snap, res.timer), "Failed to restore the workout"),
      });
    }, "Failed to cancel workout", spot);
  }

  // The server counts the duration (D-039); a workout with no sets is deleted, and Undo brings it back open. Notes typed
  // and not saved yet are saved first.
  function finish(spot?: Element | null) {
    const session = activeSession;
    if (!session) return;
    write(async () => {
      if (!(await saveNotes())) return;
      const snap = { ...session, notes: savedNotes.current || null };
      const done = await finishSessionAction({ id: session.id });
      if (!done.success) return refused(session.id, done.error);
      setOpen(null);
      setHandId(null);
      setSessionNotes("");
      // The sets too: a set's Undo after Finish would take a set out of a finished workout.
      const touches = touchesOf(session.id, session.sets);
      if (done.deleted) {
        return showToast({
          message: "No sets logged: the workout was removed",
          type: "success",
          touches,
          // The server found no sets: sets this page still showed were deleted elsewhere and stay deleted.
          onUndo: takeBack(restore({ ...snap, sets: [] }, done.timer), "Failed to restore the workout"),
        });
      }
      showToast({
        message: `Finished the workout · ${done.session.durationMinutes} min`,
        type: "success",
        touches,
        onUndo: takeBack(
          async () => {
            const res = await reopenSessionAction({ id: session.id });
            return res.success ? { success: true, session: { ...snap, timer: res.timer } } : res;
          },
          "Failed to reopen the workout",
        ),
      });
    }, "Failed to finish workout", spot);
  }

  return {
    activeSession,
    paused,
    confirmCancel,
    setConfirmCancel,
    sessionNotes,
    setSessionNotes,
    saveNotes,
    openEx,
    setOpenEx,
    inputStates,
    setInputStates,
    clock,
    start,
    toggleTimer,
    logSet,
    deleteSet,
    exit,
    resume,
    cancel,
    finish,
  };
}
