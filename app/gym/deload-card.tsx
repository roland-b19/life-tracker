"use client";

import { addDays, formatDMY } from "@/lib/format-date";
import { weekStart } from "@/lib/gym-progress";
import { useState } from "react";
import { Card, FormModal, SelectField, Toggle } from "../components/blocks";
import { EditButton } from "../components/lists";
import { undoWith, useToast } from "../components/toast";
import type { DeloadInfo } from "./types";
import { restoreDeloadWeeksAction, saveDeloadWeeksAction } from "@/actions/gym";

/**
 * The 10 weeks a deload select lists, from this week forward (step 1) or back (step -1), plus the week already chosen if
 * it is outside them. `today` is the server's day, so the server and the browser list the same weeks.
 */
function deloadOptions(today: string, step: 1 | -1, current: string, none: string) {
  const first = weekStart(today);
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(first, 7 * step * i));
  if (current && !weeks.includes(current)) weeks.push(current);
  weeks.sort();
  return [{ value: "", label: none }, ...weeks.map((w) => ({ value: w, label: `${formatDMY(w)} - ${formatDMY(addDays(w, 6))}${w === first ? " (this week)" : ""}` }))];
}

/** Where the deload cycle stands, the "Deload session" switch, and the dialog that sets the last and next deload week. */
export function DeloadCard({
  today,
  deload,
  isDeloadMode,
  onDeloadMode,
  busy,
  setBusy,
}: {
  today: string; // the server's day
  deload: DeloadInfo;
  isDeloadMode: boolean;
  onDeloadMode: (on: boolean) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const { showToast } = useToast();
  // Last and next deload week being edited (Sundays, "" for none), null while the dialog is closed.
  const [draft, setDraft] = useState<{ last: string; next: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (draft.last && draft.next && draft.next <= draft.last) {
      setErrorMsg("The next deload must come after the last one");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await saveDeloadWeeksAction({ last: draft.last || null, next: draft.next || null });
      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setDraft(null);
      const { last, added, removed } = res;
      showToast({
        // Past deload weeks are history and stay: a Last cleared or moved earlier leaves the latest of them as Last.
        message: last && last !== (draft.last || null) && last !== draft.next ? `Saved. Past deload weeks stay: the last is ${formatDMY(last)}.` : "Saved deload weeks",
        type: "success",
        touches: [...added, ...removed].map((w) => `deload_weeks:${w}`),
        // Exactly the weeks that save removed come back and the ones it added go.
        onUndo: undoWith(
          showToast,
          () => restoreDeloadWeeksAction({ add: removed, remove: added }),
          (back) => (back && !back.success ? back.error : "Failed to undo the edit"),
        ),
      });
    } catch {
      setErrorMsg("Failed to save deload weeks");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        id="deload-title"
        className="deload-card"
        title={deload.inDeloadWeek ? "Deload week chosen" : deload.isDeloadDue ? "Deload week due" : `Week ${deload.cycleWeek} of ${deload.cycleLength}`}
        sub={
          deload.inDeloadWeek || deload.isDeloadDue
            ? // D-038: the whole week, not only its deload workouts, is left out of progress.
              "Deload weeks stay out of the progress chart and the week-before comparisons."
            : deload.nextDeloadWeek
              ? `Deload starts ${formatDMY(deload.nextDeloadWeek)}.`
              : `${deload.cycleLength + 1 - deload.cycleWeek} ${deload.cycleLength + 1 - deload.cycleWeek === 1 ? "week" : "weeks"} until deload.`
        }
        end={
          <EditButton
            label="Edit deload weeks"
            disabled={busy}
            onClick={() => {
              setErrorMsg("");
              setDraft({ last: deload.lastDeloadWeek ?? "", next: deload.nextDeloadWeek ?? "" });
            }}
          />
        }
      >
        <Toggle label="Deload session" checked={isDeloadMode} disabled={busy} onChange={(e) => onDeloadMode(e.target.checked)} />
      </Card>
      <FormModal isOpen={draft !== null} onClose={() => setDraft(null)} title="Deload weeks" onSubmit={save} error={errorMsg} busy={busy}>
        <p className="muted move-hint">Weeks run Sunday to Saturday. Week x of y counts from the last deload to the next one; with no next deload it counts 5 weeks.</p>
        <SelectField
          label="Last deload"
          disabled={busy}
          value={draft?.last ?? ""}
          options={deloadOptions(today, -1, draft?.last ?? "", "Not set")}
          onChange={(e) => setDraft((d) => d && { ...d, last: e.target.value })}
        />
        <SelectField
          label="Next deload"
          disabled={busy}
          value={draft?.next ?? ""}
          options={deloadOptions(today, 1, draft?.next ?? "", "Not chosen")}
          onChange={(e) => setDraft((d) => d && { ...d, next: e.target.value })}
        />
      </FormModal>
    </>
  );
}
