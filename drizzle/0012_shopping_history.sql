ALTER TABLE "shopping_items" ADD COLUMN "cleared_at" timestamp with time zone;--> statement-breakpoint
-- Merge duplicate list items (same name and unit) into the oldest one, adding the amounts.
WITH ranked AS (
  SELECT id, user_id, lower(name) AS n, lower(unit) AS u,
    first_value(id) OVER (PARTITION BY user_id, lower(name), lower(unit) ORDER BY created_at, id) AS keep_id
  FROM "shopping_items"
), totals AS (
  SELECT r.keep_id, least(9999.99, sum(s.amount)) AS amount, bool_and(s.is_bought) AS is_bought, count(*) AS c
  FROM ranked r JOIN "shopping_items" s ON s.id = r.id
  GROUP BY r.keep_id
)
UPDATE "shopping_items" s SET amount = t.amount, is_bought = t.is_bought
FROM totals t WHERE s.id = t.keep_id AND t.c > 1;--> statement-breakpoint
DELETE FROM "shopping_items" s USING (
  SELECT id, first_value(id) OVER (PARTITION BY user_id, lower(name), lower(unit) ORDER BY created_at, id) AS keep_id
  FROM "shopping_items"
) r WHERE s.id = r.id AND r.id <> r.keep_id;
