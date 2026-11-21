"use client";

import { toISODate, weekday } from "@/lib/format-date";
import type { MuscleGroupKey } from "@/lib/gym-muscles";
import { progressSets, type HistoryEntry } from "@/lib/gym-progress";
import { useMemo, useState } from "react";
import { Banner, Page, SmallButton } from "../components/blocks";
import { useFolded } from "../components/categories-card";
import { useServerState } from "../components/server-state";
import { ActiveWorkout } from "./active-workout";
import { CustomExercises, type CustomExercise } from "./custom-exercises";
import { DayEditor, type DiscardedEdit } from "./day-editor";
import { DeloadCard } from "./deload-card";
import { HistoryCard } from "./history-card";
import { MuscleExplorer } from "./muscle-map";
import { ProgressPanel } from "./progress-panel";
import { TrainingDays } from "./training-days";
import type { ActiveSessionData, DeloadInfo, LibraryExercise, SplitDay } from "./types";
import { formatClock, useWorkout } from "./use-workout";

interface GymClientProps {
  userName: string;
  split: {
    id: string;
    name: string;
    days: SplitDay[];
  } | null;
  deload: DeloadInfo;
  history: HistoryEntry[];
  exercises: LibraryExercise[];
  customExercises: CustomExercise[];
  openSession: ActiveSessionData | null;
}

export function GymClient({ userName, split, deload, history, exercises, customExercises, openSession }: GymClientProps) {
  const days = split?.days ?? [];
  const [selectedDayId, setSelectedDayId] = useState<string>(() => {
    const today = weekday(toISODate());
    const todayMatch = days.find((d) => d.dayOfWeek === today);
    return todayMatch ? todayMatch.id : days[0]?.id ?? "";
  });
  // Follows the server: a deload week saved for this week turns it on without a reload; a tap still sets it by hand.
  const [isDeloadMode, setIsDeloadMode] = useServerState(deload.isDeloadDue || deload.inDeloadWeek);
  const [busy, setBusy] = useState(false); // one saving flag: every control on the page waits for the same write
  // The day being edited, as it was when the editor opened, and the discarded edits an Undo reopens it with.
  const [editing, setEditing] = useState<{ day: SplitDay; resume?: DiscardedEdit } | null>(null);
  const [isFolded, toggleFolded] = useFolded("gym");
  const w = useWorkout({ openSession, days, isDeloadMode, setBusy, selectDay: setSelectedDayId });
  const { activeSession, paused } = w;

  // The Progress tab draws from what the page already holds (history plus the workout in hand): no load, no skeleton.
  const progress = useMemo(
    () => progressSets(history, activeSession ?? paused, new Map(exercises.map((e) => [e.id, e.name]))),
    [history, activeSession, paused, exercises],
  );

  const currentDay = days.find((d) => d.id === selectedDayId);
  // The muscles the day on screen trains: the muscle map starts with them picked (it compares by content, so a new array each render is fine).
  const dayGroups = [...new Set(currentDay?.exercises.map((e) => e.muscleGroup))] as MuscleGroupKey[];

  return (
    <Page userName={userName}>
      <DeloadCard deload={deload} isDeloadMode={isDeloadMode} onDeloadMode={setIsDeloadMode} busy={busy} setBusy={setBusy} />

      {activeSession ? (
        <ActiveWorkout w={w} day={days.find((d) => d.id === activeSession.splitDayId)} history={history} busy={busy} />
      ) : (
        <>
          {paused && (
            <Banner
              label="Workout in progress"
              className="resume-bar"
              title="Workout in progress"
              sub={`${paused.splitDayName || "Workout"} · ${paused.sets.length} ${paused.sets.length === 1 ? "set" : "sets"} logged · ${formatClock(w.clock)}`}
            >
              <SmallButton disabled={busy} onClick={w.resume}>Resume</SmallButton>
            </Banner>
          )}
          <TrainingDays
            days={days}
            selectedId={selectedDayId}
            onSelect={setSelectedDayId}
            busy={busy}
            hasPaused={Boolean(paused)}
            onStart={w.start}
            onEdit={(day) => setEditing({ day })}
          />
          <ProgressPanel sets={progress} />
          <MuscleExplorer dayGroups={dayGroups} planned={days.flatMap((d) => d.exercises.map((ex) => ({ ...ex, dayName: d.name })))} />
          <CustomExercises exercises={customExercises} fold={{ folded: isFolded("custom"), onToggle: () => toggleFolded("custom") }} />
          <HistoryCard history={history} />
        </>
      )}

      {editing && (
        <DayEditor
          key={editing.day.id}
          day={editing.day}
          resume={editing.resume}
          exercises={exercises}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setEditing(null)}
          onReopen={(resume) => setEditing({ day: days.find((d) => d.id === editing.day.id) ?? editing.day, resume })}
        />
      )}
    </Page>
  );
}
