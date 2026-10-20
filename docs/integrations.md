# Integrations

## Open Food Facts

- Docs: <https://openfoodfacts.github.io/openfoodfacts-server/api/>. Licence and reuse: <https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/>.
- **Licence:** product data is ODbL. The app shows "Product data: Open Food Facts (ODbL)" wherever products are added and in Settings → About. Cached product data stays under the same licence.
- **User-Agent:** every request sends `Forma/0.1 (private self-hosted app; <OFF_CONTACT>)`. Set `OFF_CONTACT` to your email.
- **Rate limits** (documented: 15 product reads/min/IP, 10 searches/min/IP; exceeding them can lead to an IP ban). All users share the server's IP, so `src/lib/off.ts` keeps its own budgets below those limits (12 reads/min, 8 searches/min).
- **No search on keystrokes.** Typing searches only the local database (your foods, favourites, recents, cached products). The remote search runs only when the user presses *Search Open Food Facts*.
- **Caching:** products are cached for 30 days (the cached copy is used if OFF is unavailable or rate-limited). Search results are cached for 24 h.
- **Data quality:** `mapOffProduct` takes kcal from the label, falls back to kJ ÷ 4.184, and treats missing nutrients as `null`. Impossible values (negative, more than 100 g per 100 g, more than 950 kcal per 100 g, sugar above carbs) are dropped. A label whose energy doesn't match 4/4/9 (+2 for fibre) by more than 25% gets a visible warning, and the label value is kept. Products without any nutrition data are excluded from search results.
- **History safety:** diary entries store a nutrient snapshot, so later corrections in OFF or by the user never rewrite past days.
- **Replacing or adding databases:** `mapOffProduct` returns a source-agnostic `ProductDraft`. A second source only needs a mapper and a `source` value.

## Barcodes

- Formats: EAN-13, EAN-8, UPC-A, UPC-E (`src/nutrition/barcode.ts`). Check digits are validated. UPC-E is expanded to UPC-A, and UPC-A is normalised to 13 digits as OFF stores it.
- Scanner: ZXing (`@zxing/browser`) in the browser, which works in iOS Safari (including installed PWAs), Android Chrome and desktop browsers. It does not rely on the experimental `BarcodeDetector` API.
- The camera needs a **secure context** (HTTPS or `localhost`). Over plain LAN HTTP the scanner says so and offers manual entry. See the README for Tailscale HTTPS.
- Fallbacks: manual code entry, product search, and creating a custom product with the scanned code pre-filled when a product isn't found.

## Optional AI assistant (Claude)

- **Off unless configured and chosen.** The assistant exists only when the server has `ANTHROPIC_API_KEY`, and each user must switch it on (Settings → AI assistant, or the consent screen the first time they open it). Every core feature works without it.
- **Where it runs:** inside the same Next.js app (`src/lib/assistant.ts`, server actions in `src/app/actions/assistant.ts`). The key stays on the server and is never sent to the browser. Model: `AI_MODEL` (default `claude-opus-5-5`; `claude-haiku-5-5` is much cheaper). Requests use low effort, prompt caching and the server-side refusal fallback (`fallbacks: "default"`).
- **What is sent:** the user's message, the earlier messages of that chat, and only the data the section needs. In Training that is the profile summary, the active plan, exercise preferences and the last 8 workouts. In Food it is the diary for the shown date, the calorie target, the latest weight and recently used products. Photos, passwords and other users' data are never sent.
- **Tools:** read tools run on the server (`find_substitutes` uses the same engine as the swap sheet; `search_food` uses the local database, then Open Food Facts). Write tools (`propose_swap`, `propose_plan_change`, `propose_exercise_pref`, `propose_add_food`, `propose_quick_entry`) only store a row in `ai_suggestions` and show a card. Nothing changes until the user taps **Apply**, which runs the same server actions as the normal UI (with their validation). A proposal can be applied once and expires after a day.
- **No invented nutrition:** food is added only from database products with values per 100 g. Quick entries are proposed only with calories the user stated.
- **Limits:** 40 questions per user per day (`DAILY_LIMIT` in `src/app/actions/assistant.ts`). Set a monthly spend limit in the Anthropic Console as well.
- **Tests:** `src/lib/assistant.test.ts` checks the tools against an in-memory database (valid ids only, values from the database, other users can't use a proposal, a proposal applies once). It makes no API calls.
