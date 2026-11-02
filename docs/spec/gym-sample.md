# Gym sample data (from the user, 2026-11-02)

Real example of the plan and the log format the Gym module must support. Use as seed/test data; not a template to hard-code.

## Rules the user trains by (plan context)

Deload week every 5 weeks. Every set to true failure (0 RIR), slow and controlled, rest until ready, 5 s max rest inside a working set, partial reps at the end. Nutrition and daily targets (protein 170 g, 3350 kcal, 300+ g carbs, 10k steps, 3 L water) belong to the Food/Health modules.

## Split: Upper/Lower, 5 days (as written by the user)

- Sunday, Upper (chest): incline barbell press 2x5-8; cable fly (push down) 2x8-10; weighted pull-ups 2x5-8; lateral raise (high) 2x8-12; chest-supported row 2x5-8; cable overhead extension (high) 2x8-10; Bayesian curl (high) 2x5-8.
- Monday, Legs (hamstrings): seated/lying hamstring curl 2x5-8; leg press / barbell squat (mid-high) 2x5-8; RDL 2x5-8; leg extension 2x8-10; abductors (outside) 2x8-10; standing calf raise 2x8-10.
- Tuesday: rest.
- Wednesday, Upper (back): same exercises as Sunday, Bayesian curl 2x8-10.
- Thursday (written as "Tuesday"), Legs (quads): seated/lying hamstring curl 2x5-8; barbell squat / leg press (low-mid) 2x5-8; hip thrust 2x8-10; leg extension 2x8-10; adductors (inside) 2x8-10; standing calf raise 2x8-10.
- Friday, Arms: incline curl 2x8-10; dumbbell curl 2x8-10; cable pushdown (low) 2x8-10; cable overhead extension (high) 2x8-10; overhead press 2x8-10; lateral raise (high) 2x8-12.
- Saturday: rest.

## Log format example: 29 October, Upper (back)

- Incline barbell press (2x5-8): 10 x 40 kg; 3 x 60 kg `!!`
- Cable fly (push down) (2x8-10): 12 x 4 plates; 9 x 5 plates
- Weighted pull-ups (2x5-8): 5 x bodyweight; 5 x bodyweight
- Lateral raise (high) (2x8-12): 13 x 2 plates; 12 x 2 plates + 1.25 kg
- Chest-supported row (2x5-8): 7 x 45 kg; 7 x 45 kg
- Cable overhead extension (high) (2x8-10): 10 x 5 plates; 10 x 5 plates + 2.5 kg
- Bayesian curl (high) (2x8-10): 11 x 5 plates; 7 x 5 plates + 1.25 kg

The user's note: a `!!` means something was not right.
