"use client";

import { formatDMY } from "@/lib/format-date";
import { kgDelta, type HistoryEntry } from "@/lib/gym-progress";
import { useState } from "react";
import { Badge, Card, EmptyNote } from "../components/blocks";
import { useFolded } from "../components/categories-card";
import { ChevronRightIcon } from "../components/icons";
import { ListBox, useMore } from "../components/lists";
import { setText } from "./types";

/** Finished workouts, newest first, each opening into its exercises and sets. */
export function HistoryCard({ history }: { history: HistoryEntry[] }) {
  const [isFolded, toggleFolded] = useFolded("gym");
  const [shown, more] = useMore(history);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card
      id="history-title"
      title="History"
      className="gym-history"
      fold={{ folded: isFolded("history"), onToggle: () => toggleFolded("history") }}
      end={
        <span className="muted number-tabular">
          {history.length} {history.length === 1 ? "workout" : "workouts"}
        </span>
      }
    >
      <ListBox wash className="entries">
        {history.length > 0 ? (
          <>
            {shown.map((h) => {
              const open = openId === h.id;
              return (
                <div key={h.id} className={`entry-row history-entry${open ? " open" : ""}`}>
                  <button
                    type="button"
                    className="history-toggle"
                    aria-expanded={open}
                    aria-controls={`history-${h.id}`}
                    onClick={() => setOpenId(open ? null : h.id)}
                  >
                    <span className="history-entry-head">
                      <strong>{h.dayName ?? "Workout"}</strong>
                      {h.isDeload && <Badge kind="rest">Deload</Badge>}
                      <span className="muted number-tabular history-entry-side">{formatDMY(h.date)}</span>
                      <ChevronRightIcon size={14} className="history-chevron" aria-hidden />
                    </span>
                    <span className="muted number-tabular history-progress">
                      {h.progress !== null ? `Weight ${kgDelta(h.progress)} vs the week before` : "Nothing to compare with yet"}
                    </span>
                  </button>
                  {open && (
                    <div id={`history-${h.id}`} className="history-details">
                      {h.durationMinutes ? <div className="muted number-tabular history-duration">{h.durationMinutes} min</div> : null}
                      {h.exercises.map((ex) => (
                        <p key={ex.id} className="history-exercise">
                          <strong>{ex.name}</strong>
                          <span className="muted number-tabular">{ex.sets.map(setText).join("  ·  ")}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {more}
          </>
        ) : (
          <EmptyNote>No finished workouts yet.</EmptyNote>
        )}
      </ListBox>
    </Card>
  );
}
