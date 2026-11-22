"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Card, ChartCaption, ChartControls, ChartNote, EmptyNote, Field, FormModal, SelectField } from "../components/blocks";
import { LineChart } from "../components/charts";
import { useFolded } from "../components/categories-card";
import { useDeviceState } from "../components/device-state";
import { EditButton } from "../components/lists";
import { Segmented } from "../components/segmented";
import { useServerState } from "../components/server-state";
import { undoWith, useToast } from "../components/toast";
import { savePlateWeightAction } from "@/actions/gym";
import { addDays } from "@/lib/format-date";
import { deloadWeeksIn, exerciseMeasure, exerciseSeries, weekStart, type Measure, type PlateWeights } from "@/lib/gym-progress";
import type { HistorySet } from "@/lib/gym";
import { formatAmount } from "@/lib/number-format";
import { AT_MOST_PLATE_KG, GYM_LIMITS, MORE_THAN_ZERO, TWO_DECIMALS, twoDecimals } from "@/lib/validations/gym";

type Range = "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = (["30", "90", "180", "360"] as const).map((d) => ({ value: d, label: `${d}D` }));
type BodyweightChart = "reps" | "added";
const BODYWEIGHT_CHARTS: { value: BodyweightChart; label: string }[] = [
  { value: "reps", label: "Reps" },
  { value: "added", label: "Added weight" },
];
// The controls this device remembers (D-041); each fallback is a constant, as useDeviceState asks.
const FIRST_EXERCISE: string = "";
const DEFAULT_RANGE: string = "90";
const DEFAULT_BODYWEIGHT: string = "reps";

const WHAT: Record<Measure, string> = {
  kg: "Heaviest load (kg) of each workout",
  plates: "Heaviest load (plates) of each workout",
  reps: "Most reps of each workout",
  added: "Most added weight (kg) of each workout",
};

const dm = (iso: string) => iso.slice(5).split("-").reverse().join(".");

/**
 * What stops a plate weight from being saved, in the server's own words ("" when nothing does); the limits are the
 * server's. Text that is not a number is the number field's own error.
 */
export function plateKgProblem(kg: string) {
  const n = Number(kg);
  if (kg === "" || !Number.isFinite(n)) return "";
  if (n <= 0) return MORE_THAN_ZERO;
  if (n > GYM_LIMITS.plateKg) return AT_MOST_PLATE_KG;
  if (!twoDecimals(n)) return TWO_DECIMALS;
  return "";
}
const kgText = (kg: number) => `${formatAmount(kg, 2)} kg`;

/**
 * One exercise's best per workout over a period (D-038): kg, plates until 1 plate has a weight, or a bodyweight
 * exercise's reps or added kg; deload weeks are left out. `today` is the server's day, so the server and the browser
 * draw the same period.
 */
export function ProgressPanel({
  today,
  sets,
  deloadWeeks,
  plateWeights,
}: {
  today: string;
  sets: HistorySet[];
  deloadWeeks: string[];
  plateWeights: PlateWeights;
}) {
  const [exerciseId, setExerciseId] = useDeviceState("lt-gym-progress-exercise", FIRST_EXERCISE);
  const [storedRange, setRange] = useDeviceState("lt-gym-progress-range", DEFAULT_RANGE);
  const [storedBodyweight, setBodyweight] = useDeviceState("lt-gym-progress-bodyweight", DEFAULT_BODYWEIGHT);
  const range = RANGES.find((r) => r.value === storedRange)?.value ?? "90";
  const bodyweight: BodyweightChart = storedBodyweight === "added" ? "added" : "reps";
  const [isFolded, toggleFolded] = useFolded("gym");
  const [plates, setPlates] = useServerState(plateWeights);
  const [editing, setEditing] = useState<{ exerciseId: string; name: string; kg: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const exercises = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of sets) names.set(s.exerciseId, s.exerciseName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sets]);
  const deload = useMemo(() => deloadWeeksIn(deloadWeeks, sets), [deloadWeeks, sets]);

  const fold = { folded: isFolded("progress"), onToggle: () => toggleFolded("progress") };
  if (!sets.length) {
    return (
      <Card id="ex-progress-title" title="Exercise progress" className="gym-progress" fold={fold}>
        <EmptyNote>Log a workout to see your progress.</EmptyNote>
      </Card>
    );
  }

  const [chosen, name] = exercises.find(([id]) => id === exerciseId) ?? exercises[0];
  const rules = { plates, deload };
  const measure = exerciseMeasure(sets, chosen, rules, bodyweight);
  const since = addDays(today, 1 - Number(range));
  const all = measure ? exerciseSeries(sets, chosen, measure, rules) : [];
  const series = all.filter((p) => p.date >= since);
  const plateKg = plates[chosen];
  const plateProblem = plateKgProblem(editing?.kg ?? "");
  const usesPlates = sets.some((s) => s.exerciseId === chosen && s.loadType === "plates");
  const platesLeftOut = measure === "kg" && !plateKg && sets.some((s) => s.exerciseId === chosen && s.loadType === "plates" && !deload.has(weekStart(s.date)));

  /** Puts one exercise's plate weight on the screen (null: none). */
  const showPlate = (id: string, kg: number | null) =>
    setPlates((now) => {
      const next = { ...now };
      delete next[id];
      if (kg !== null) next[id] = kg;
      return next;
    });

  /** Saves "1 plate = X kg"; Undo writes the old value back (none before: the plate weight goes again). */
  async function savePlate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const { exerciseId: id, name: exercise } = editing;
    const kg = Number(editing.kg);
    setErrorMsg("");
    setSaving(true);
    try {
      const saved = await savePlateWeightAction({ exerciseId: id, kg });
      if (!saved.success) {
        setErrorMsg(saved.error);
        return;
      }
      const { previous } = saved;
      showPlate(id, kg);
      setEditing(null);
      showToast({
        message: `1 plate of ${exercise} = ${kgText(kg)}`,
        type: "success",
        touches: [`exercise_plate_weights:${id}`],
        onUndo: undoWith(
          showToast,
          async () => {
            showPlate(id, previous);
            const back = await savePlateWeightAction({ exerciseId: id, kg: previous }).catch(() => null);
            if (!back?.success) showPlate(id, kg);
            return back;
          },
          (back) => (back && !back.success ? back.error : "Failed to undo the plate weight"),
        ),
      });
    } catch {
      setErrorMsg("Failed to save the plate weight");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card
        id="ex-progress-title"
        title="Exercise progress"
        className="gym-progress"
        fold={fold}
        sub={usesPlates ? (plateKg ? `1 plate = ${kgText(plateKg)}` : "1 plate: no weight yet") : undefined}
        end={
          usesPlates && (
            <EditButton
              label={`Edit 1 plate of ${name} in kg`}
              onClick={() => {
                setErrorMsg("");
                setEditing({ exerciseId: chosen, name, kg: plateKg ? String(plateKg) : "" });
              }}
            />
          )
        }
      >
        <SelectField
          label="Exercise"
          value={chosen}
          onChange={(e) => setExerciseId(e.target.value)}
          options={exercises.map(([id, label]) => ({ value: id, label }))}
        />
        <ChartControls>
          <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
          {(measure === "reps" || measure === "added") && (
            <Segmented label="Bodyweight chart" value={bodyweight} options={BODYWEIGHT_CHARTS} onChange={setBodyweight} />
          )}
        </ChartControls>
        <LineChart
          points={series.map((p) => ({ label: dm(p.date), value: p.value, at: Date.parse(`${p.date}T00:00:00Z`) / 86_400_000 }))}
          summary={`${measure ? WHAT[measure] : "Best"} over the last ${range} days`}
        />
        {!measure ? (
          <ChartNote>Done only in deload weeks, which are left out of progress.</ChartNote>
        ) : measure === "added" && all.length === 0 ? (
          <ChartNote>No added weight yet.</ChartNote>
        ) : (
          series.length < 2 && <ChartNote>Not enough workouts in the last {range} days.</ChartNote>
        )}
        {platesLeftOut && <ChartNote>Plate sets show here in kg once 1 plate has a weight.</ChartNote>}
        {measure && series.length > 0 && <ChartCaption>{WHAT[measure]}; deload weeks are left out.</ChartCaption>}
      </Card>

      <FormModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Plate weight"
        onSubmit={savePlate}
        error={plateProblem || errorMsg}
        busy={saving}
        canSubmit={!!editing?.kg && !Number.isNaN(Number(editing.kg)) && !plateProblem}
      >
        <Field
          label={`1 plate of ${editing?.name ?? name} (kg)`}
          type="number"
          inputMode="decimal"
          disabled={saving}
          value={editing?.kg ?? ""}
          onChange={(e) => {
            // A changed value makes the server's last refusal stale
            setErrorMsg("");
            setEditing((now) => now && { ...now, kg: e.target.value });
          }}
          required
        />
      </FormModal>
    </>
  );
}
