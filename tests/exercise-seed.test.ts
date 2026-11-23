import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_EXERCISES, ensureDefaultExercises } from "@/lib/gym-seed";
import { resetDb } from "./db";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
const insertDefault = (name: string) => admin.query("INSERT INTO exercises (name, muscle_group, equipment_type) VALUES ($1, 'chest', 'barbell')", [name]);

describe("default exercises", () => {
  afterAll(() => admin.end());

  it("are one row per name: another instance's insert is kept and a duplicate is refused", async () => {
    await resetDb(admin);
    await insertDefault(DEFAULT_EXERCISES[0].name); // seeded by another server instance a moment ago
    const ids = await ensureDefaultExercises();
    expect(ids.size).toBe(DEFAULT_EXERCISES.length);
    const { rows } = await admin.query("SELECT name, count(*)::int AS n FROM exercises WHERE user_id IS NULL GROUP BY name");
    expect(rows).toHaveLength(DEFAULT_EXERCISES.length);
    expect(rows.every((r) => r.n === 1)).toBe(true);
    await expect(insertDefault(DEFAULT_EXERCISES[0].name)).rejects.toThrow(/exercises_default_name_uniq/);
  });
});
