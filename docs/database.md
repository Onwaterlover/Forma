# Database schema

Postgres (Supabase in the cloud, PGlite locally), created by `src/lib/migrations.ts` (append-only; never edit a shipped migration). Foreign keys are enforced and `ON DELETE CASCADE` removes everything a user owns when the account is deleted. RLS is enabled on every table (no policies), so Supabase's REST API exposes nothing.

| Table | Purpose / notes |
|---|---|
| `users` | Email (unique, case-insensitive), name, scrypt password hash, `is_admin`, `locale`. |
| `sessions` | `id` = SHA-256 of the cookie token (the token itself is never stored), expiry. |
| `invites` | `code_hash` (SHA-256), creator, note, expiry, `used_by`/`used_at` (single use). |
| `user_settings` | JSON: theme, enabled modules, default logging mode, timers, effort tracking, fibre, weight goal. |
| `training_profiles` | JSON validated by zod (`src/engine/profile.ts`): goal, experience, frequency, session length, **per-weekday availability per location**, **locations with equipment lists**, style preference, excluded equipment categories, muscle priorities, other sports. Stored as one document because the engine consumes it as a unit. |
| `exercise_prefs` | `(user, exercise) → favorite / like / dislike / exclude / pain`. Neutral is the absence of a row. |
| `custom_exercises` | User-private exercises in the same shape as the built-in library. |
| `plans` | Name, status (active/inactive/archived), source (generated/manual/imported), `current_version`. One active plan per user. |
| `plan_versions` | Immutable JSON snapshot per version. Edits, regenerations, "apply today's workout" and restores all add a version, so nothing is silently overwritten. |
| `workouts` | Client-generated UUID (idempotent sync), plan/version/session it came from, location, mode (simple/detailed), status, timestamps, `client_updated_at` for conflict resolution. |
| `workout_exercises` | Exercise id **plus a name snapshot**, loading model, target, completed/skipped, notes. |
| `workout_sets` | Type (warm-up/working/drop/failure), reps, kg, optional RIR/RPE, duration, completed. |
| `food_products` | Shared cache of Open Food Facts products (`owner_user_id` NULL, unique barcode) and private custom foods (`owner_user_id` set). Nutrients per 100 g/ml as JSON; **missing = null**. `state` raw/cooked. |
| `food_search_cache` | Remote search query → barcodes, 24 h TTL. |
| `food_favorites` | Per-user favourites. |
| `recipes` | Ingredients with **nutrient snapshots**, optional cooked yield, servings, `is_meal` (saved meals). |
| `diary_entries` | Date, optional meal category, product/recipe reference, name, amount, **per-100 snapshot** and scaled values. Editing a product or recipe later never changes past entries. |
| `diary_days` | Optional "complete / incomplete" flag per day (used by the adaptive estimate). |
| `calorie_targets` | Append-only history of targets with source (manual / estimate / accepted suggestion). |
| `bodyweight` | One weigh-in per user per day (20–400 kg). |
| `ai_suggestions` | Reserved for Phase 3: proposals with pending/accepted/rejected state. |
| `progress_photos` | Private photos (bytea), date, pose (front/side/back), note, size. Served only via an authenticated route. |
| `login_attempts` | Login/registration throttle (works across serverless instances). |
| `undo_buffer` | Deleted diary entries kept ~10 minutes so “undo” restores the server's own copy. |

## Loading models

`workout_exercises.loading` records how a weight should be read: `total`, `per_dumbbell`, `per_side`, `bodyweight`, `bodyweight_plus`, `assisted` (more = easier) or `time`. Records and progress suggestions never compare across models.

## Export format

`GET /api/export` returns `{"format": "forma-export", "version": 1, …}` with one array per table, containing only the requesting user's rows (including plan versions, workout exercises/sets and custom foods).
