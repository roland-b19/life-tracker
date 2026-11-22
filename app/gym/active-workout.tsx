"use client";

import type { HistoryEntry } from "@/lib/gym-progress";
import { GYM_LIMITS } from "@/lib/validations/gym";
import { Card, Field, SmallButton } from "../components/blocks";
import { ListBox } from "../components/lists";
import { emptyInput, ExerciseLogger } from "./exercise-logger";
import type { ExerciseItem, SplitDay, WorkoutSetData } from "./types";
import { formatClock, type useWorkout } from "./use-workout";

/**
 * The exercises of a workout with no day (older data), taken from its own sets, never from the day picked on the
 * page: each one's target is what was logged.
 */
export function setExercises(sets: WorkoutSetData[]): ExerciseItem[] {
  const ids = [...new Set(sets.map((s) => s.exerciseId))];
  return ids.map((exerciseId, orderIndex) => {
    const own = sets.filter((s) => s.exerciseId === exerciseId);
    const reps = own.map((s) => s.reps);
    return {
      id: exerciseId,
      exerciseId,
      exerciseName: own[0].exerciseName ?? "Exercise",
      muscleGroup: own[0].muscleGroup ?? "other",
      equipmentType: own[0].equipmentType ?? "barbell",
      targetSets: own.length,
      minReps: Math.min(...reps),
      maxReps: Math.max(...reps),
      orderIndex,
    };
  });
}

/**
 * Scrolls a control that has just appeared into view, clear of the phone's tab bar (its `scroll-margin-bottom`). One
 * function for every render, so React calls it when the control appears, not on each tick of the clock.
 */
const showAboveTabBar = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

/**
 * The workout in hand: its exercises with their set forms, the server's clock with Pause and Resume, the notes, and
 * Finish, Exit or Cancel. `day` is the workout's own day; a workout without one lists the exercises of its sets, and
 * so does an exercise left the day with sets logged in this workout (they stay on screen, deletable).
 */
export function ActiveWorkout({ w, day, history, busy }: { w: ReturnType<typeof useWorkout>; day: SplitDay | undefined; history: HistoryEntry[]; busy: boolean }) {
  const session = w.activeSession;
  if (!session) return null;
  const items = day
    ? [...day.exercises, ...setExercises(session.sets.filter((s) => !day.exercises.some((e) => e.exerciseId === s.exerciseId)))]
    : setExercises(session.sets);
  const running = session.timer.running;
  return (
    <Card
      id="active-session-title"
      title={session.splitDayName || "Workout session"}
      sub={session.isDeload ? "Deload" : undefined}
      actions={
        <>
          <span className={`session-timer number-tabular${running ? "" : " paused"}`} role="timer" aria-label="Workout time">
            {formatClock(w.clock)}
          </span>
          <SmallButton disabled={busy} onClick={(e) => w.toggleTimer(e.currentTarget)}>
            {running ? "Pause" : "Resume"}
          </SmallButton>
        </>
      }
    >
      <ListBox wash className="entries">
        {items.map((exercise) => {
          const id = exercise.exerciseId;
          const input = w.inputStates[id] || emptyInput(exercise);
          return (
            <ExerciseLogger
              key={exercise.id}
              exercise={exercise}
              session={session}
              history={history}
              input={input}
              open={w.openEx.includes(id)}
              busy={busy}
              onToggle={() => w.setOpenEx((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))}
              onPatch={(change) => w.setInputStates((prev) => ({ ...prev, [id]: { ...input, ...change } }))}
              onLog={(spot) => w.logSet(exercise, spot)}
              onDeleteSet={(set, spot) => w.deleteSet(set, spot)}
            />
          );
        })}
      </ListBox>

      <div className="session-footer">
        <Field
          label="Session notes (optional)"
          type="text"
          maxLength={GYM_LIMITS.sessionNotes}
          disabled={busy}
          value={w.sessionNotes}
          onChange={(e) => w.setSessionNotes(e.target.value)}
          onBlur={() => void w.saveNotes()}
        />
        <div className="session-actions">
          <button type="button" className="secondary" disabled={busy} onClick={(e) => w.finish(e.currentTarget)}>
            Finish workout
          </button>
          {w.confirmCancel ? (
            <>
              <span className="muted">Delete this workout and its sets?</span>
              <button type="button" className="secondary" disabled={busy} onClick={() => w.setConfirmCancel(false)}>
                Keep
              </button>
              <button ref={showAboveTabBar} type="button" className="danger" disabled={busy} onClick={(e) => w.cancel(e.currentTarget)}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={(e) => w.exit(e.currentTarget)}>
                Exit, finish later
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => w.setConfirmCancel(true)}>
                Cancel workout
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
