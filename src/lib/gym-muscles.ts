/** Muscle groups an exercise can train: one list for the zod schema, the seed, the forms and the 3D map. */
export const MUSCLE_GROUP_LABEL = {
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  traps: "Traps",
  lats: "Lats",
  "upper-back": "Upper back",
  "lower-back": "Lower back",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  calves: "Calves",
} as const;

export type MuscleGroupKey = keyof typeof MUSCLE_GROUP_LABEL;

export const MUSCLE_GROUP_KEYS = Object.keys(MUSCLE_GROUP_LABEL) as MuscleGroupKey[];

/** Label for any stored value; "other" and unknown values (older rows) read as plain text. */
export const muscleLabel = (key: string): string =>
  (MUSCLE_GROUP_LABEL as Record<string, string>)[key] ?? key[0].toUpperCase() + key.slice(1);
