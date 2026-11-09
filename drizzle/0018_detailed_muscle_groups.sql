-- Splits the coarse muscle groups (back, legs, arms) into detailed ones. Known default exercises are mapped
-- by name; any custom exercise still on an old key falls back to the nearest new group.
UPDATE exercises SET muscle_group = CASE name
  WHEN 'Weighted pull-ups' THEN 'lats'
  WHEN 'Lat pulldown' THEN 'lats'
  WHEN 'Chest-supported row' THEN 'upper-back'
  WHEN 'Barbell deadlift' THEN 'lower-back'
  WHEN 'Seated/lying hamstring curl' THEN 'hamstrings'
  WHEN 'RDL (Romanian Deadlift)' THEN 'hamstrings'
  WHEN 'Barbell squat / Leg press' THEN 'quads'
  WHEN 'Leg extension' THEN 'quads'
  WHEN 'Abductors (outside)' THEN 'glutes'
  WHEN 'Hip thrust' THEN 'glutes'
  WHEN 'Adductors (inside)' THEN 'adductors'
  WHEN 'Cable overhead extension (high)' THEN 'triceps'
  WHEN 'Cable pushdown (low)' THEN 'triceps'
  WHEN 'Bayesian curl (high)' THEN 'biceps'
  WHEN 'Incline curl' THEN 'biceps'
  WHEN 'Dumbbell curl' THEN 'biceps'
  ELSE muscle_group
END
WHERE muscle_group IN ('back', 'legs', 'arms');--> statement-breakpoint
UPDATE exercises SET muscle_group = CASE muscle_group
  WHEN 'back' THEN 'upper-back'
  WHEN 'legs' THEN 'quads'
  WHEN 'arms' THEN 'biceps'
END
WHERE muscle_group IN ('back', 'legs', 'arms');
