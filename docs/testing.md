# Testing

```bash
npm test
```
```bash
npm run typecheck
```

Vitest runs 96 tests in about 2 seconds.

| Suite | File | Covers |
|---|---|---|
| Workout generator | `src/engine/generator.test.ts` | Beginner 2×30 min, advanced 5 days, upper-body specialisation with leg maintenance, balanced full body, home dumbbells only, park calisthenics, no equipment at all, machines vs free weights preference, mixed/no preference, gym only on some weekdays, multiple locations per day, moving a gym session to a home-only day, switching location on the fly, two weekly climbing sessions, hard cycling plus legs, exclusions, dislikes, conservative pain handling, one short session per week, 20-minute limit, missing gym machines, excluded equipment category, strength goal, custom exercises, conflicting requirements (5 sessions / 3 days), no available days, rest days, schedule changes, missed sessions, shortening today's workout, determinism, no duplicate exercises, and **a fuzz test of 150 random profiles that must never violate a hard constraint**. |
| Progression and records | `src/engine/progression.test.ts` | No suggestions without logged sets, load increases only at the top of the range, small increments, no reaction to one bad session, sustained decline gives a suggestion only, bodyweight/assisted progressions, record types, e1RM labelled as an estimate. |
| Nutrition | `src/nutrition/nutrition.test.ts` | Decimal input (`12,5`, `1 234,5`, `1.234,5`, `1,234.5`), gram scaling, missing values stay missing, raw vs cooked, recipes with cooked yield and servings, incomplete-ingredient flags, invalid external data, energy/macro mismatch, Open Food Facts mapping (kJ fallback, liquids, missing data, localised names), barcode check digits and UPC-E expansion, weight trend with gaps, adaptive TDEE refusing insufficient data, ignoring incomplete days, on-track means no change, modest suggestions, initial estimate range. |
| Import | `src/import/parse.test.ts` | Polish text plans with day headers, English/German set notation, timed sets, AMRAP, weights, CSV and pasted spreadsheets, unknown exercises kept with a pattern guess, cross-language matching, empty input. |
| Security and integrity | `src/lib/security.test.ts` | Password hashing, single-use and expiring invites stored only as hashes, login throttling, **account separation** (plans, workouts, diary, custom foods, recipes, export), stale offline copies never overwriting newer data, idempotent sync, product corrections not rewriting history, missing nutrients in totals, account deletion cascade, **backup and restore** through the real scripts. |

## Manual end-to-end checks performed

On a separate dev database (`DATA_DIR=./data-dev`, dev account from `scripts/dev-seed.mjs`), in the browser at desktop width and at 375 px mobile width, in light and dark mode:

1. Login → first-launch choice → setup wizard (goal, experience, 4×60 min, gym + home dumbbells, gym Mon/Thu/Fri and home Wed, climbing Saturday) → generated plan (home session uses only home equipment).
2. Start a workout → log a set with one tap (reps pre-filled, weight carried to the next sets) → server autosave confirmed → "I have less time: 20 min" → finish.
3. Second workout → swap an exercise (only home-equipment alternatives offered) → finish → "save changes to plan?" → new plan version contains the swap.
4. Barcode lookup (Open Food Facts) → local search → amount picker → diary totals → delete + undo.
5. Progress, targets (adaptive estimate correctly refuses with too little data), settings, history.

## Usability targets (goals, not proven measurements)

- Initial plan in about 2 minutes for a straightforward profile: 6 short steps, with advanced options collapsed.
- Saved meal in 1–2 taps (Meals tab → +). Recent food in 1 tap (+ uses the last amount).
- Logging a set with 1 tap when values are pre-filled.
- Swapping an exercise in 2 taps.

## Not yet automated

UI component tests and browser end-to-end tests (Playwright) are planned. See the [roadmap](roadmap.md).
