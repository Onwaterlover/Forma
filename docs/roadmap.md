# Status, known limitations and roadmap

## Phase 1: functional foundation (this delivery)

Done and tested:

- Local deployment (single Node process + SQLite), LAN and Tailscale access documented
- Invite-only multi-user accounts, sessions, strict per-user data separation, export, account deletion, backups and restore
- First-launch paths (create plan / I have a plan / just food) with modules that can be switched on later
- Progressive onboarding: goal, experience, frequency, time, multiple locations with editable equipment, per-weekday location availability, rest days, fixed or flexible schedule, style, excluded categories, muscle priorities, other sports, supersets, conditioning
- Exercise library (84 exercises, PL/EN/DE names, cues, safety notes, loading models) with preferences (favourite → pain) and custom exercises
- Deterministic generator + independent validator + time fitting + volume balancing + transparent trade-off messages
- Plan management: versions, restore, duplicate, archive, activate, rename, manual creation, editor (swap, add, remove, reorder, sets/reps/rest, move day/location with automatic adaptation, live validation)
- Import from pasted text, tables, CSV and .txt with a review screen, then save as is / analyse / optimise
- Workout logger: simple and detailed modes, pre-filled values, one-tap sets, swap, skip, notes, reorder, add/remove sets, optional rest timer (manual or automatic), change location, shorten to 15–45 min, finish/abandon, resume, "apply today's changes to the plan?", offline-tolerant autosave
- Workout history, progression suggestions, records (estimates labelled)
- Food diary: search (local, then explicit Open Food Facts), barcode scanning (EAN/UPC), recent (1-tap re-log), favourites, custom foods (raw/cooked), quick calories, saved meals, recipes with cooked yield and servings, copy yesterday, edit/delete with undo, optional meal categories, complete/incomplete days
- Optional calorie target: formula estimate (as a range), manual target, adaptive estimate with honest "not enough data", modest suggestions that are never auto-applied
- Bodyweight with smoothed trend, calorie history, workouts per week, short weekly review
- PWA (manifest, icons, service worker), light/dark themes, Polish default with English and German

## Known limitations

- **PDF and image import** need the optional AI assistant (Phase 3). Today the app says so and asks for pasted text or manual entry.
- **Body measurements and progress photos** are not built yet (Phase 2). The tables and a private-file design are planned (see architecture).
- **Exercise demonstrations** are text cues only. There is no licensed media yet; the data model has room for a media field.
- **Session time model** uses fixed constants. Calibrating it against logged workout durations is planned.
- **Deload / plateau detection** is limited to the per-exercise "sustained decline" suggestion. Week-level fatigue patterns are Phase 2.
- **Offline:** an open workout keeps working through connection drops. Starting a new workout, food search and barcode lookups need a connection. Fully offline diary logging isn't implemented.
- **Rate limits** for login and Open Food Facts are in-memory (single process). That's fine for a home server and resets when the app restarts.
- **Muscle map visualisation** isn't built. The weekly-sets list labels indirect volume as approximate instead.
- **German exercise cues** fall back to English.
- No automated browser end-to-end tests yet (manual checks are documented in `testing.md`).

## Phase 2: progress and adaptation

1. Body measurements and private progress photos (front/side/back, side-by-side comparison), stored outside `public/` and served only to their owner.
2. Calibrating session duration from logged workouts. Week-level fatigue and plateau patterns with conservative deload *suggestions*.
3. Richer analytics: per-exercise trend charts, muscle-group distribution from logged sets (direct vs indirect clearly separated).
4. Advanced scheduling: automatic re-planning when availability changes mid-week.
5. Playwright end-to-end tests at mobile and desktop sizes. Accessibility audit (axe).

## Phase 3: optional AI and refinement

1. Provider interface (`none` / Anthropic / OpenAI-compatible local server) configured server-side. Each request sends only the minimum data, after the user confirms.
2. Grounded assistant: explain a plan, summarise trends, "I have 25 minutes", "more shoulders, less legs". Answers use deterministic tools (the generator, validator, analytics) and cite the user's data.
3. PDF/image import through AI extraction feeding the same review screen.
4. All AI changes to plans or targets are proposals (`ai_suggestions`) that the user accepts or rejects.
