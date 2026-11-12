import { sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { toISODate } from "@/lib/format-date";

// Everything one user owns, as plain text. Dates and times are cast to text so no timezone shifts them.
// Left out on purpose: the Claude token (a secret) and the push-notification subscriptions (device keys).
const sections = (u: string): [string, SQL][] => [
  ["Account", sql`SELECT created_at::text AS "signed up" FROM users WHERE id = ${u}::uuid`],
  [
    "Tasks",
    sql`SELECT space, title, CASE WHEN is_recurring THEN recurrence_pattern ELSE 'one-off' END AS repeats, due_date::text AS "first day",
               category, reminder_time::text AS reminder, is_completed AS done, completed_at::text AS "done at",
               is_carried_over AS "carried over", created_at::text AS created, placed_at::text AS "placed at"
          FROM todos WHERE user_id = ${u}::uuid ORDER BY space, created_at`,
  ],
  ["Categories", sql`SELECT scope AS list, name, sort_order AS position FROM item_categories WHERE user_id = ${u}::uuid ORDER BY scope, sort_order`],
  [
    "Wishlist",
    sql`SELECT name, estimated_price AS price, priority, category, url, created_at::text AS created FROM wishlist_items WHERE user_id = ${u}::uuid ORDER BY created_at DESC`,
  ],
  ["Weight", sql`SELECT date::text AS day, kilograms, created_at::text AS logged FROM weight_entries WHERE user_id = ${u}::uuid ORDER BY date`],
  ["Water and steps", sql`SELECT date::text AS day, water_ml AS "water (ml)", steps, notes, created_at::text AS logged FROM daily_metrics WHERE user_id = ${u}::uuid ORDER BY date`],
  [
    "Meals",
    sql`SELECT date::text AS day, name, calories AS kcal, protein, carbs, fat, is_estimated AS estimated, forgotten, created_at::text AS logged
          FROM meals WHERE user_id = ${u}::uuid ORDER BY date, created_at`,
  ],
  [
    "Nutrition goals",
    sql`SELECT calories AS kcal, protein_grams AS protein, carbs_grams AS carbs, fat_grams AS fat, water_ml AS "water (ml)", steps FROM nutrition_targets WHERE user_id = ${u}::uuid`,
  ],
  [
    "Recipes",
    sql`SELECT r.name, r.description, r.calories AS kcal, r.protein, r.carbs, r.fat, r.is_estimated AS estimated, r.created_at::text AS created,
               (SELECT string_agg(i.amount || ' ' || i.unit || ' ' || i.name || ' (' || i.category || ')', ', ' ORDER BY i.name) FROM recipe_ingredients i WHERE i."recipeId" = r.id) AS ingredients
          FROM recipes r WHERE r.user_id = ${u}::uuid ORDER BY r.created_at`,
  ],
  ["Shopping sections", sql`SELECT name, sort_order AS position FROM shopping_categories WHERE user_id = ${u}::uuid ORDER BY sort_order`],
  ["Shopping units", sql`SELECT name, sort_order AS position FROM shopping_units WHERE user_id = ${u}::uuid ORDER BY sort_order`],
  [
    "Shopping list",
    sql`SELECT name, amount, unit, category, is_bought AS bought, checked_at::text AS "checked at", cleared_at::text AS "cleared at", created_at::text AS created
          FROM shopping_items WHERE user_id = ${u}::uuid ORDER BY created_at`,
  ],
  ["Exercises", sql`SELECT name, muscle_group AS muscle, equipment_type AS equipment, is_custom AS custom, created_at::text AS created FROM exercises WHERE user_id = ${u}::uuid ORDER BY name`],
  [
    "Training routine",
    sql`SELECT s.name AS routine, s.is_active AS active, d.day_of_week AS weekday, d.name AS day, d.is_rest AS rest, e.name AS exercise, x.target_sets AS sets, x.min_reps AS "min reps", x.max_reps AS "max reps"
          FROM workout_splits s JOIN workout_split_days d ON d.split_id = s.id
          LEFT JOIN workout_split_day_exercises x ON x.split_day_id = d.id LEFT JOIN exercises e ON e.id = x.exercise_id
         WHERE s.user_id = ${u}::uuid ORDER BY d.order_index, x.order_index`,
  ],
  [
    "Workout sets",
    sql`SELECT w.date::text AS day, d.name AS "training day", w.is_deload AS deload, w.duration_minutes AS minutes, w.notes AS "workout notes", w.created_at::text AS started, e.name AS exercise, t.set_order AS "set", t.reps,
               t.load_type AS "load type", t.load_value AS "load", t.extra_kg AS "extra kg", t.is_failure AS failure, t.is_partial AS partial, t.flag_anomaly AS anomaly, t.anomaly_reason AS "anomaly reason", t.notes, t.created_at::text AS logged
          FROM workout_sessions w LEFT JOIN workout_split_days d ON d.id = w.split_day_id
          LEFT JOIN workout_sets t ON t.session_id = w.id LEFT JOIN exercises e ON e.id = t.exercise_id
         WHERE w.user_id = ${u}::uuid ORDER BY w.date, t.set_order`,
  ],
];

export async function buildExport(userId: string) {
  const parts = sections(userId);
  const results = await Promise.all(parts.map(([, query]) => db.execute(query)));
  const lines = ["Life Tracker: all your data", `Exported ${new Date().toISOString()}`];
  parts.forEach(([title], i) => {
    const { rows } = results[i];
    lines.push("", `== ${title} (${rows.length}) ==`);
    for (const row of rows) {
      const fields = Object.entries(row).filter(([, value]) => value !== null && value !== "");
      lines.push(fields.map(([key, value]) => `${key}: ${String(value).replace(/\s*\n\s*/g, " ")}`).join(" | "));
    }
  });
  return { filename: `life-tracker-export-${toISODate()}.txt`, text: `${lines.join("\n")}\n` };
}
