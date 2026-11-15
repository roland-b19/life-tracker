"use client";

import type { HistoryEntry } from "@/lib/gym-progress";
import { GYM_LIMITS } from "@/lib/validations/gym";
import { Card, Field, TintButton } from "../components/blocks";
import { ListBox } from "../components/lists";
import { emptyInput, ExerciseLogger } from "./exercise-logger";
import type { SplitDay } from "./types";
import type { useWorkout } from "./use-workout";
import { formatClock } from "./workout-timer";

/** The workout in hand: its exercises with their set forms, the notes, and Finish, Exit or Cancel. */
export function ActiveWorkout({ w, day, history, busy }: { w: ReturnType<typeof useWorkout>; day: SplitDay | undefined; history: HistoryEntry[]; busy: boolean }) {
  const session = w.activeSession;
  if (!session) return null;
  return (
    <Card
      id="active-session-title"
      title={session.splitDayName || "Workout session"}
      sub={session.isDeload ? "Deload" : undefined}
      actions={
        <>
          <span className={`session-timer number-tabular${w.timerPaused ? " paused" : ""}`} role="timer" aria-label="Workout time">
            {formatClock(w.timer.shown)}
          </span>
          <TintButton onClick={() => w.setTimerPaused((p) => !p)}>{w.timerPaused ? "Resume" : "Pause"}</TintButton>
        </>
      }
    >
      <ListBox wash className="entries">
        {day?.exercises.map((exercise) => {
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
              onLog={() => void w.logSet(exercise)}
              onDeleteSet={w.deleteSet}
            />
          );
        })}
      </ListBox>

      <div className="session-footer">
        <Field
          label="Session notes (optional)"
          type="text"
          maxLength={GYM_LIMITS.notes}
          disabled={busy}
          value={w.sessionNotes}
          onChange={(e) => w.setSessionNotes(e.target.value)}
        />
        <div className="session-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => void w.finish()}>
            Finish workout
          </button>
          {w.confirmCancel ? (
            <>
              <span className="muted">Delete this workout and its sets?</span>
              <button type="button" className="secondary" disabled={busy} onClick={() => w.setConfirmCancel(false)}>
                Keep
              </button>
              <button type="button" className="danger" disabled={busy} onClick={() => void w.cancel()}>
                Delete
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={w.exit}>
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
