# Training engine

Location: `src/engine/`. Pure TypeScript and deterministic: the same input always produces the same plan. No LLM is involved in generating or validating a plan.

## Pipeline (`generator.ts`)

1. **Available days.** A day counts if it has at least one usable location and isn't marked as rest. If the user asks for more sessions than there are days, we plan for the available days and record `fewer_days_than_requested`. More than 6 sessions are capped at 6.
2. **Split** (`templates.ts → splitFor`). The split is chosen from the session count, goal, experience and muscle priorities. Beginners and general-health goals use full-body or upper/lower splits; split-vs-full-body evidence shows no meaningful difference when volume is equal (see evidence E2). Priority patterns: legs at maintenance plus upper body as priority gives U/L/U or U/L/U/arms; legs as priority gives L/U/L.
3. **Slots.** Each template is a list of movement-pattern slots with priority 1 (main), 2 (important) or 3 (optional). Muscle priorities adjust them: *high* promotes a slot and can add up to 2 extra slots; *low* demotes it; *maintain* keeps only the main movement. Frequent climbing makes direct biceps work optional. A conditioning goal adds a conditioning slot.
4. **Days, templates and locations** (`schedule.ts → assign`). This is an exhaustive search over day subsets × template orders (at most a few thousand combinations), minimising a transparent cost:
   - missing equipment (share of weighted slots that can't be filled at the best location that day) × 12
   - back-to-back sessions loading the same region (legs/pull/push) × 2.5, × 1.3 for beginners
   - uneven spacing (squared deviation from 7 / n)
   - sports overlap: a session that loads the sport's region on the day before a sport day (× 2), on the same day (× 1), or the day after (× 1), weighted by intensity
5. **Exercise choice** (`select.ts`). Hard filters come first: equipment at that location, excluded equipment categories, excluded exercises, **pain rule** and difficulty (no skill-3 lifts for beginners unless favourited). The remaining candidates are scored on preference (favourite +4 … dislike −6), style (machines / free / bodyweight / mixed), goal (barbell bonus for strength main lifts), experience, a progressable-loading bonus, stability for hypertrophy goals, and weekly variety (beginners get repetition, others variety). Ties break by library order for determinism.
6. **Prescription** (`prescribe.ts`). Sets, rep ranges, rest, effort guidance and progression model (see table below).
7. **Fit to time** (`fit.ts`). The time limit is a real constraint. Cuts happen in this order, each one reported: supersets of compatible pairs (beginners: after optional removal) → drop optional exercises → shorten rests to the minimum → reduce sets to 2 → drop important exercises → single sets → drop main exercises (keeping at least 2).
8. **Volume balancing** (`volume.ts`). Adds sets where a non-low-priority muscle is more than 15% under its weekly target, but only if the session still fits its time limit and the per-exercise cap (3 / 4 / 5 sets by experience) isn't exceeded.
9. **Validation** (`validate.ts`). An independent checker runs on every generated, imported or edited plan. Any hard-rule violation that is still present is removed and reported (`removed_invalid`); nothing is kept silently.

## Default prescriptions

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Sets per exercise | 2 | 2 (3 for main compounds) | 3 (2 for optional) |
| Max sets per exercise when balancing | 3 | 4 | 5 |
| Weekly target (direct-equivalent sets, normal priority) | 6 | 9 | 12 |

Weekly target multipliers: goal (muscle 1.0, strength 0.9, sport 0.8, conditioning/health/unsure 0.7, start 0.6) × priority (high 1.5, low 0.6, maintain 0.35) × small muscles (calves, abs, rear delts) 0.7. Counting: a set counts 1 for each primary muscle and 0.5 for each secondary muscle. This is a planning heuristic, shown as "approximate" in the UI.

Rep ranges: compound lifts 8–12 (heavy compounds 6–10), isolation 10–15, small isolation 12–20, general-health goals 8–12 / 12–15, strength main lifts 4–6 (beginners 6–8), bodyweight lifts 6–15 / 10–20 with progression to harder variants. Rest: heavy compounds 150 s (strength 180 s), other compounds 120 s, isolation 75 s, minimums 90/60 s.

Effort: beginners and "just start" users stop with 2–3 reps in reserve. Unstable or high-fatigue lifts stop with 1–3 in reserve. Stable machine, cable and isolation lifts may take the last set to technical failure. RIR is never required.

## Session time model (`duration.ts`)

Preparation 2 min + general warm-up 3 min + ramp-up sets (2 min before the first loaded compound, 1 min before later heavy compounds) + per set (reps × 3.5 s + 15 s set-up) + rest between sets + 60 s transition per exercise. Supersets alternate with a 15 s switch and take the longer rest per round. These constants are explicit so they can be calibrated against logged durations (Phase 2).

## Pain rule

If an exercise is marked *causes pain*, the generator does not automatically substitute **any other exercise with the same movement pattern that shares a primary muscle**. The slot is skipped and a note explains why. Manual swaps show a caution and suggest professional advice. This is deliberately conservative: a similar exercise is not assumed to be safe.

## Runtime adaptations (`adapt.ts`)

- `adaptToLocation`: swap only the exercises that aren't possible at the new place, using the best substitute (same pattern first, then a shared primary muscle).
- `moveSession`: move a session to another day. If its location isn't available that day, the location with the most exercises left unchanged is picked and the rest are adapted.
- `shortenSession`: "I only have N minutes" uses the same `fitToTime` cuts and never changes the stored plan.
- `nextSession`: today's scheduled session, otherwise the one after the last completed session, so a missed workout is offered next instead of being skipped.

## Progression (`progression.ts`)

Double progression. More load is suggested only when **every working set** reached the top of the rep range, in small equipment-aware steps (barbell 2.5 kg; dumbbells 1 kg under 10 kg and 2 kg above; machines 2.5 or 5 kg; never more than +10%). Bodyweight lifts progress through reps, then added weight or a harder variant. For assisted lifts, the assistance is reduced. A single bad session never triggers a reduction. A lighter load is only *suggested* after three consecutive sessions at the same load that are each below the range and declining. Workouts ticked off in simple mode are ignored because they carry no performance data. e1RM uses the Epley formula, only for sets of 1–12 reps, and is always labelled as an estimate.
