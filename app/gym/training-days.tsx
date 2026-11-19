"use client";

import { toISODate, weekday } from "@/lib/format-date";
import { Badge, Card, Dashboard, DashboardAside, DashboardMain, EmptyNote, SmallButton } from "../components/blocks";
import { useFolded } from "../components/categories-card";
import { PencilIcon } from "../components/icons";
import { ListBox } from "../components/lists";
import { DAY_NAMES, type SplitDay } from "./types";
import { MuscleTag } from "./muscle-tag";

/** The week's training days (pick one, or Start it) and, beside them, the picked day's routine with Edit and Start. */
export function TrainingDays({
  days,
  selectedId,
  onSelect,
  busy,
  hasPaused,
  onStart,
  onEdit,
}: {
  days: SplitDay[];
  selectedId: string;
  onSelect: (id: string) => void;
  busy: boolean;
  hasPaused: boolean; // a workout left open: starting another waits until it is resumed or finished
  onStart: (day: SplitDay) => void;
  onEdit: (day: SplitDay) => void;
}) {
  const [isFolded, toggleFolded] = useFolded("gym");
  const todayDayOfWeek = weekday(toISODate()); // 0 = Sun, 1 = Mon, ..., in the app timezone
  return (
    <Dashboard>
      <DashboardMain>
        <Card id="split-title" title="Training days" fold={{ folded: isFolded("split"), onToggle: () => toggleFolded("split") }}>
          <ListBox className="split-day-list">
            {days.map((day) => {
              const isToday = day.dayOfWeek === todayDayOfWeek;
              const isSelected = day.id === selectedId;
              return (
                <div key={day.id} className={`split-day-card${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}>
                  <button type="button" className="split-day-select" aria-pressed={isSelected} onClick={() => onSelect(day.id)}>
                    <span className="split-day-title">
                      <strong>{DAY_NAMES[day.dayOfWeek]}</strong>
                      {isToday && <Badge kind="info">Today</Badge>}
                      {day.isRest ? <Badge kind="rest">Rest</Badge> : <Badge kind="info" className="number-tabular">{day.exercises.length}</Badge>}
                    </span>
                    <span className="muted split-day-sub">{day.name}</span>
                  </button>
                  {!day.isRest && day.exercises.length > 0 && (
                    <SmallButton
                      aria-label={`Start ${day.name}`}
                      disabled={busy || hasPaused}
                      onClick={() => {
                        onSelect(day.id);
                        onStart(day);
                      }}
                    >
                      Start
                    </SmallButton>
                  )}
                </div>
              );
            })}
          </ListBox>
        </Card>
      </DashboardMain>

      {/* Training days is above everything that changes size, so picking a day never moves the buttons */}
      <DashboardAside>
        {days
          .filter((day) => day.id === selectedId)
          .map((day) => (
            <Card
              key={day.id}
              id="preview-title"
              title={day.isRest ? "Rest day" : day.name}
              sub={DAY_NAMES[day.dayOfWeek]}
              below
              actions={
                <>
                  <SmallButton icon={<PencilIcon size={14} />} aria-label={`Edit ${day.name}`} onClick={() => onEdit(day)}>
                    Edit
                  </SmallButton>
                  {!day.isRest && (
                    <SmallButton
                      aria-label={`Start ${day.name}`}
                      disabled={busy || hasPaused || day.exercises.length === 0}
                      onClick={() => onStart(day)}
                    >
                      Start
                    </SmallButton>
                  )}
                </>
              }
            >
              {!day.isRest && (
                <ListBox wash className="entries">
                  {day.exercises.length > 0 ? (
                    day.exercises.map((ex, idx) => (
                      <div key={ex.id} className="entry-row">
                        <div className="entry-main entry-stack">
                          <strong>
                            {idx + 1}. {ex.exerciseName}
                          </strong>
                          <MuscleTag group={ex.muscleGroup} />
                        </div>
                        <span className="muted number-tabular entry-side">
                          {ex.targetSets} × {ex.minReps} – {ex.maxReps}
                        </span>
                      </div>
                    ))
                  ) : (
                    <EmptyNote>No exercises yet.</EmptyNote>
                  )}
                </ListBox>
              )}
            </Card>
          ))}
      </DashboardAside>
    </Dashboard>
  );
}
