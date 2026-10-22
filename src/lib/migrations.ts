// Postgres schema. Append-only: never edit a migration that has shipped; add a new one.
// Statements are separated by ";\n". Timestamps are ISO-8601 text (lexically sortable).
const TABLES = [
  "users", "sessions", "invites", "user_settings", "training_profiles", "exercise_prefs", "custom_exercises", "plans",
  "plan_versions", "workouts", "workout_exercises", "workout_sets", "food_products", "food_search_cache", "food_favorites",
  "recipes", "diary_entries", "diary_days", "calorie_targets", "bodyweight", "ai_suggestions", "login_attempts", "undo_buffer",
];

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_admin integer NOT NULL DEFAULT 0,
  locale text NOT NULL DEFAULT 'pl',
  created_at text NOT NULL
);
CREATE UNIQUE INDEX users_email ON users (lower(email));
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE invites (
  code_hash text PRIMARY KEY,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at text NOT NULL,
  expires_at text NOT NULL,
  used_by text REFERENCES users(id) ON DELETE SET NULL,
  used_at text
);
CREATE TABLE user_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data text NOT NULL DEFAULT '{}'
);
CREATE TABLE training_profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data text NOT NULL,
  updated_at text NOT NULL
);
CREATE TABLE exercise_prefs (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  pref text NOT NULL CHECK (pref IN ('favorite','like','neutral','dislike','exclude','pain')),
  updated_at text NOT NULL,
  PRIMARY KEY (user_id, exercise_id)
);
CREATE TABLE custom_exercises (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX custom_exercises_user ON custom_exercises(user_id);
CREATE TABLE plans (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','inactive','archived')),
  source text NOT NULL CHECK (source IN ('generated','manual','imported')),
  current_version integer NOT NULL DEFAULT 1,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX plans_user ON plans(user_id);
CREATE TABLE plan_versions (
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  version integer NOT NULL,
  data text NOT NULL,
  note text,
  created_at text NOT NULL,
  PRIMARY KEY (plan_id, version)
);
CREATE TABLE workouts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id text REFERENCES plans(id) ON DELETE SET NULL,
  plan_version integer,
  session_key text,
  name text NOT NULL,
  location_id text,
  mode text NOT NULL CHECK (mode IN ('simple','detailed')),
  status text NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
  started_at text NOT NULL,
  ended_at text,
  notes text,
  client_updated_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX workouts_user_started ON workouts(user_id, started_at);
CREATE TABLE workout_exercises (
  id text PRIMARY KEY,
  workout_id text NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  exercise_id text NOT NULL,
  exercise_name text NOT NULL,
  loading text NOT NULL,
  target text,
  completed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX workout_exercises_ex ON workout_exercises(exercise_id);
CREATE TABLE workout_sets (
  id text PRIMARY KEY,
  workout_exercise_id text NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position integer NOT NULL,
  set_type text NOT NULL DEFAULT 'working' CHECK (set_type IN ('warmup','working','drop','failure')),
  reps integer,
  weight_kg double precision,
  rir double precision,
  rpe double precision,
  duration_s integer,
  completed integer NOT NULL DEFAULT 0
);
CREATE INDEX workout_sets_we ON workout_sets(workout_exercise_id);
CREATE TABLE food_products (
  id text PRIMARY KEY,
  owner_user_id text REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('off','custom')),
  barcode text,
  name text NOT NULL,
  brand text,
  basis text NOT NULL CHECK (basis IN ('g','ml')),
  state text CHECK (state IN ('raw','cooked')),
  nutrients text NOT NULL,
  servings text NOT NULL DEFAULT '[]',
  fetched_at text,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX food_products_off_barcode ON food_products(barcode) WHERE source = 'off';
CREATE INDEX food_products_owner ON food_products(owner_user_id);
CREATE TABLE food_search_cache (
  query text PRIMARY KEY,
  barcodes text NOT NULL,
  fetched_at text NOT NULL
);
CREATE TABLE food_favorites (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES food_products(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE recipes (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ingredients text NOT NULL,
  cooked_yield_g double precision,
  servings double precision NOT NULL DEFAULT 1,
  is_meal integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX recipes_user ON recipes(user_id);
CREATE TABLE diary_entries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  meal text,
  product_id text REFERENCES food_products(id) ON DELETE SET NULL,
  recipe_id text REFERENCES recipes(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount double precision NOT NULL,
  basis text NOT NULL,
  nutrients text NOT NULL,
  kcal double precision,
  protein double precision,
  carbs double precision,
  fat double precision,
  fiber double precision,
  created_at text NOT NULL
);
CREATE INDEX diary_user_date ON diary_entries(user_id, date);
CREATE TABLE diary_days (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  complete integer NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE calorie_targets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kcal double precision,
  protein_g double precision,
  goal text,
  source text NOT NULL CHECK (source IN ('manual','estimate','suggestion')),
  created_at text NOT NULL
);
CREATE INDEX calorie_targets_user ON calorie_targets(user_id, created_at);
CREATE TABLE bodyweight (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  kg double precision NOT NULL CHECK (kg > 20 AND kg < 400),
  created_at text NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE ai_suggestions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload text NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','accepted','rejected')),
  created_at text NOT NULL
);
CREATE TABLE login_attempts (
  key text PRIMARY KEY,
  n integer NOT NULL,
  until_ms double precision NOT NULL
);
CREATE TABLE undo_buffer (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  row_data text NOT NULL,
  created_at text NOT NULL
);
${TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).join(";\n")}
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE progress_photos (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  pose text NOT NULL CHECK (pose IN ('front','side','back','other')),
  note text,
  mime text NOT NULL,
  data bytea NOT NULL,
  width integer,
  height integer,
  created_at text NOT NULL
);
CREATE INDEX progress_photos_user ON progress_photos(user_id, date);
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY
`,
  },
  {
    version: 3,
    sql: `
CREATE TABLE body_measurements (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date text NOT NULL,
  waist_cm double precision CHECK (waist_cm > 10 AND waist_cm < 300),
  hips_cm double precision CHECK (hips_cm > 10 AND hips_cm < 300),
  chest_cm double precision CHECK (chest_cm > 10 AND chest_cm < 300),
  arm_cm double precision CHECK (arm_cm > 10 AND arm_cm < 300),
  thigh_cm double precision CHECK (thigh_cm > 10 AND thigh_cm < 300),
  created_at text NOT NULL,
  updated_at text NOT NULL,
  PRIMARY KEY (user_id, date),
  CHECK (coalesce(waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm) IS NOT NULL)
);
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY
`,
  },
  {
    // The plan review used to mark every chosen alternative as a favorite. Remove exactly those automatic marks
    // (set within a minute after a "review" plan version); favorites the user set by hand stay.
    version: 4,
    sql: `
DELETE FROM exercise_prefs ep
WHERE ep.pref = 'favorite' AND EXISTS (
  SELECT 1 FROM plan_versions pv JOIN plans p ON p.id = pv.plan_id
  WHERE p.user_id = ep.user_id AND pv.note = 'review'
    AND ep.updated_at::timestamptz BETWEEN pv.created_at::timestamptz AND pv.created_at::timestamptz + interval '1 minute'
)
`,
  },
];
// Row Level Security is enabled with no policies: Supabase's public API keys can read nothing.
// The app connects as the database owner on the server and enforces per-user access in src/lib/data.ts.
