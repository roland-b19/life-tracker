import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toISODate } from "@/lib/format-date";
import { NOT_WHOLE } from "@/lib/number-format";
import {
  GOAL_RANGES,
  logMealSchema,
  mealAmounts,
  MEAL_CALORIES_NEGATIVE,
  MEAL_CALORIES_TOO_HIGH,
  MEAL_LIMITS,
  MEAL_MACROS_NEGATIVE,
  MEAL_MACROS_TOO_HIGH,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";

// Rules checked on the code itself; no test here opens the database. The Vitest setup still prepares the local one
// unless CI=1, so to run this file alone without Postgres use the command in conventions.md (Gotchas, Postgres for tests).
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

  it("refuses a negative meal value with words that name the field, and the form checks it with the schema itself", () => {
    expect(refusal({ ...meal, calories: -1 })).toBe(MEAL_CALORIES_NEGATIVE);
    for (const macro of ["protein", "carbs", "fat"]) expect(refusal({ ...meal, [macro]: -0.1 })).toBe(MEAL_MACROS_NEGATIVE);
    expect(MEAL_CALORIES_NEGATIVE).toBe("Calories can't be negative");
    expect(MEAL_MACROS_NEGATIVE).toBe("Protein, carbs and fat can't be negative");
    expect(foodClient).toContain("mealAmounts.safeParse(");
    expect(foodClient).not.toMatch(/MEAL_LIMITS\.\w+\)? return/);
  });

  // The form shows the schema's first refusal, so with several wrong values it names the same one the server would.
  it("names the first field the schema refuses, in the schema's order", () => {
    const wrong = { ...meal, calories: 5, protein: -1, carbs: 2000 };
    expect(refusal(wrong)).toBe(MEAL_MACROS_NEGATIVE);
    expect(mealAmounts.safeParse(wrong).error?.issues[0]?.message).toBe(MEAL_MACROS_NEGATIVE);
  });

  // Field messages end with no full stop ("Name is required", "Must be at least 0"); the messages this form took from
  // the schema and number-format follow them.
  it("ends the form's limit and number messages with no full stop, as every field message does", () => {
    for (const message of [MEAL_CALORIES_TOO_HIGH, MEAL_MACROS_TOO_HIGH, MEAL_CALORIES_NEGATIVE, MEAL_MACROS_NEGATIVE, NOT_WHOLE]) expect(message).not.toMatch(/\.$/);
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

// A field message (what a form shows under or next to a field) ends with no full stop; a state refusal (gone, changed
// elsewhere, signed out, already exists) is a sentence and keeps its full stop.
describe("field messages end with no full stop", () => {
  const validations = import.meta.glob("../src/lib/validations/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");
  const endingInFullStop = (text: string) => [...withoutComments(text).matchAll(/"([^"\n]*\.)"|'([^'\n]*\.)'|`([^`\n]*\.)`/g)].map(([, double, single, template]) => double ?? single ?? template);

  it("in src/lib/validations, only the state refusals end with one", () => {
    expect(Object.keys(validations).length).toBeGreaterThan(5);
    expect(Object.values(validations).flatMap(endingInFullStop).sort()).toEqual(
      [
        "Category not found.",
        "Only today and yesterday can be changed.",
        "This changed on another device. Check the new value and try again.",
        "This item is no longer on the list.",
        "This weigh-in was already deleted.",
        "These notes changed on another device. Check them and try again.",
        "This workout is already finished.",
        "Workout not found.",
        "This workout was finished or cancelled elsewhere.",
        "Set not found.",
        "Sets are logged; use Cancel workout instead.",
        "You're signed out. Sign in again.",
        '"${name}" already exists.',
        'Can\'t undo: "${name}" has changed since.',
        "This task no longer exists.",
        "This item no longer exists.",
      ].sort(),
    );
  });

  it("no form in app/ sets an error message ending with one", () => {
    const set = Object.entries(sources).flatMap(([file, text]) =>
      [...text.matchAll(/setErrorMsg\(\s*("[^"\n]*\."|'[^'\n]*\.'|`[^`\n]*\.`)\s*\)/g)].map(([, message]) => `${file}: ${message}`),
    );
    expect(set).toEqual([]);
  });
});

// D-047: FormModal owns each opening's saving state (Save says "Saving..." and the fields wait while the opening's save
// is out), so a migrated form passes no `busy` of its own. The forms not moved yet are listed in conventions.md (Busy flags).
describe("a migrated form leaves its saving state to FormModal [D-047]", () => {
  const migrated = ["../app/todos/todos-client.tsx", "../app/wishlist/wishlist-client.tsx", "../app/health/food-client.tsx"];
  const formModals = (text: string) => [...text.matchAll(/<FormModal\b([^>]*?(?:\{[^}]*\}[^>]*?)*)>/g)].map(([, props]) => props);

  it.each(migrated)("%s", (file) => {
    const props = formModals(sources[file]);
    expect(props.length).toBeGreaterThan(0);
    expect(props.length).toBe(sources[file].split("<FormModal").length - 1);
    expect(props.filter((p) => /\bbusy=/.test(p))).toEqual([]);
  });
});
