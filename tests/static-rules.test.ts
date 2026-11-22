import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toISODate } from "@/lib/format-date";
import { NOT_WHOLE } from "@/lib/number-format";
import {
  GOAL_RANGES,
  logMealSchema,
  MEAL_CALORIES_TOO_HIGH,
  MEAL_LIMITS,
  MEAL_MACROS_TOO_HIGH,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";

// Rules checked on the code itself, with no database, so they run without Postgres.
const sources = import.meta.glob("../app/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const foodClient = sources["../app/health/food-client.tsx"];

it("finds the sources", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(30);
  expect(foodClient).toContain("export function");
});

// conventions.md, Form error state (D-009): `const [errorMsg, setErrorMsg] = useState("")` on every page, never null.
describe("every form's error state starts as an empty string [D-009]", () => {
  it.each(Object.entries(sources))("%s", (_file, text) => {
    const states = [...text.matchAll(/\[errorMsg, setErrorMsg\] = useState(<[^>]*>)?\(([^)]*)\)/g)];
    expect(states.filter(([, typed, initial]) => typed || ["", "null", "undefined"].includes(initial.trim())).map(([line]) => line)).toEqual([]);
  });
});

describe("the Health form's limits and words are the schema's [U5]", () => {
  const meal = { id: randomUUID(), date: toISODate(), name: "Meal", calories: 100, protein: 0, carbs: 0, fat: 0 };
  const refusal = (input: object) => logMealSchema.safeParse(input).error?.issues[0]?.message;

  it("refuses a meal over a limit with the message the form shows", () => {
    expect(refusal({ ...meal, calories: MEAL_LIMITS.calories })).toBeUndefined();
    expect(refusal({ ...meal, calories: MEAL_LIMITS.calories + 1 })).toBe(MEAL_CALORIES_TOO_HIGH);
    for (const macro of ["protein", "carbs", "fat"]) {
      expect(refusal({ ...meal, [macro]: MEAL_LIMITS.macroGrams })).toBeUndefined();
      expect(refusal({ ...meal, [macro]: MEAL_LIMITS.macroGrams + 0.1 })).toBe(MEAL_MACROS_TOO_HIGH);
    }
    expect(MEAL_CALORIES_TOO_HIGH).toBe("Calories must be 10.000 or less");
    expect(MEAL_MACROS_TOO_HIGH).toBe("Protein, carbs and fat must each be 1.000 g or less");
  });

  // Most field messages in src/lib/validations end with no full stop ("Name is required", "Must be at least 0"); the
  // messages this form took from the schema and number-format follow them.
  it("ends the form's limit and number messages with no full stop, as most field messages do", () => {
    for (const message of [MEAL_CALORIES_TOO_HIGH, MEAL_MACROS_TOO_HIGH, NOT_WHOLE]) expect(message).not.toMatch(/\.$/);
    expect(foodClient).toContain("`The total must be between 0 and ${formatNumber(METRIC_MAX[metric])}`");
  });

  it("takes each goal's range from GOAL_RANGES", () => {
    for (const [key, { min, max }] of Object.entries(GOAL_RANGES)) {
      const goal = (to: number) => updateNutritionTargetsSchema.safeParse({ [key]: { from: min, to } }).success;
      expect([goal(min - 1), goal(min), goal(max), goal(max + 1)], key).toEqual([false, true, true, false]);
    }
  });

  it("food-client writes no limit or number message of its own", () => {
    // A limit written out: a range bound ("min: 500") or a comparison with a number ("> 10000")
    expect(foodClient).not.toMatch(/\b(min|max): \d|[<>]=? *\d{2,}/);
    expect(foodClient).not.toContain("Please enter a whole number");
    expect(foodClient).toMatch(/import \{[^}]*\bNOT_WHOLE\b[^}]*\} from "@\/lib\/number-format"/);
  });
});
