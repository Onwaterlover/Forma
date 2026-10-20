// Append-only. Never edit a migration that has shipped; add a new one.
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  locale TEXT NOT NULL DEFAULT 'pl',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,            -- sha256 of the cookie token, never the token itself
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at TEXT
);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}'
);

-- Validated by zod (src/engine/profile.ts): goal, schedule, locations + equipment, sports, priorities.
CREATE TABLE training_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE exercise_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  pref TEXT NOT NULL CHECK (pref IN ('favorite','like','neutral','dislike','exclude','pain')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, exercise_id)
);

CREATE TABLE custom_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX custom_exercises_user ON custom_exercises(user_id);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','inactive','archived')),
  source TEXT NOT NULL CHECK (source IN ('generated','manual','imported')),
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX plans_user ON plans(user_id);

-- Every edit creates a new version, so old versions can be reviewed and restored.
CREATE TABLE plan_versions (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, version)
);

CREATE TABLE workouts (
  id TEXT PRIMARY KEY,            -- generated on the client so offline sync is idempotent
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  plan_version INTEGER,
  session_key TEXT,
  name TEXT NOT NULL,
  location_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('simple','detailed')),
  status TEXT NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT,
  client_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX workouts_user_started ON workouts(user_id, started_at);

CREATE TABLE workout_exercises (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,     -- snapshot so renames don't rewrite history
  loading TEXT NOT NULL,
  target TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX workout_exercises_ex ON workout_exercises(exercise_id);

CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'working' CHECK (set_type IN ('warmup','working','drop','failure')),
  reps INTEGER,
  weight_kg REAL,
  rir REAL,
  rpe REAL,
  duration_s INTEGER,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX workout_sets_we ON workout_sets(workout_exercise_id);

-- Shared cache of external products (owner NULL) plus private custom foods (owner set).
CREATE TABLE food_products (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('off','custom')),
  barcode TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  basis TEXT NOT NULL CHECK (basis IN ('g','ml')),
  state TEXT CHECK (state IN ('raw','cooked')),
  nutrients TEXT NOT NULL,         -- per 100 g/ml; missing values are null, never 0
  servings TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX food_products_off_barcode ON food_products(barcode) WHERE source = 'off';
CREATE INDEX food_products_owner ON food_products(owner_user_id);

CREATE TABLE food_search_cache (
  query TEXT PRIMARY KEY,
  barcodes TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE food_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES food_products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ingredients TEXT NOT NULL,       -- [{productId, name, grams, nutrients(snapshot)}]
  cooked_yield_g REAL,
  servings REAL NOT NULL DEFAULT 1,
  is_meal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX recipes_user ON recipes(user_id);

CREATE TABLE diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal TEXT,
  product_id TEXT REFERENCES food_products(id) ON DELETE SET NULL,
  recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,            -- grams/ml eaten
  basis TEXT NOT NULL,
  nutrients TEXT NOT NULL,         -- snapshot per 100 at log time
  kcal REAL,
  protein REAL,
  carbs REAL,
  fat REAL,
  fiber REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX diary_user_date ON diary_entries(user_id, date);

CREATE TABLE diary_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  complete INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE calorie_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kcal REAL,
  protein_g REAL,
  goal TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual','estimate','suggestion')),
  created_at TEXT NOT NULL
);
CREATE INDEX calorie_targets_user ON calorie_targets(user_id, created_at);

CREATE TABLE bodyweight (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kg REAL NOT NULL CHECK (kg > 20 AND kg < 400),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE ai_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL
);
`,
  },
];
