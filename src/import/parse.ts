import type { Exercise, Pattern } from "@/engine/types";

// Deterministic import of plain text / pasted tables / CSV. Nothing here guesses silently:
// every line either becomes a structured row, or is listed in `unparsed` for the user to review.

export interface DraftExercise {
  raw: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  seconds?: number;
  weightKg?: number;
  match: { exerciseId: string; confidence: number } | null;
  guessedPattern: Pattern | null;
  /** No sets/reps in the source: defaults were filled in for the user to adjust. */
  noSets?: boolean;
}

export interface DraftSession {
  name: string;
  exercises: DraftExercise[];
}

export interface ImportDraft {
  sessions: DraftSession[];
  unparsed: string[];
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string) => new Set(normalize(s).split(" ").filter((t) => t.length > 1));

export function matchExercise(name: string, library: Exercise[]): { exerciseId: string; confidence: number } | null {
  const q = normalize(name);
  if (!q) return null;
  const qt = tokens(name);
  let best: { exerciseId: string; confidence: number } | null = null;
  for (const ex of library) {
    for (const cand of [ex.name.pl, ex.name.en, ex.name.de, ...(ex.aliases ?? [])]) {
      const c = normalize(cand);
      let score: number;
      if (c === q) score = 1;
      else {
        const ct = tokens(cand);
        const inter = [...qt].filter((t) => ct.has(t) || [...ct].some((x) => x.length > 3 && (x.startsWith(t) || t.startsWith(x)))).length;
        const union = new Set([...qt, ...ct]).size;
        score = union ? inter / union : 0;
        // Substring match, stronger when the lengths are similar ("pompki" vs "pompki na poreczach dipy").
        if (c.includes(q) || q.includes(c)) score = Math.max(score, 0.5 + 0.5 * (Math.min(c.length, q.length) / Math.max(c.length, q.length)));
        // Every word of the note appears in this exercise, in any order ("Rumuński martwy ciąg" → the Romanian
        // deadlift, not the plain deadlift whose name it merely contains).
        if (qt.size > 1 && inter === qt.size) score = Math.max(score, 0.7 + 0.3 * (qt.size / ct.size));
      }
      if (!best || score > best.confidence) best = { exerciseId: ex.id, confidence: Math.round(score * 100) / 100 };
    }
  }
  return best && best.confidence >= 0.5 ? best : null;
}

const KEYWORDS: [RegExp, Pattern][] = [
  [/curl|ugin.*ram|biceps|bizeps/, "elbow_flex"],
  [/triceps|trizeps|pushdown|francus|skull|extension.*(arm|tri)/, "elbow_ext"],
  [/leg curl|uginanie nog|beinbeuger/, "knee_flex"],
  [/leg ext|prostowanie nog|beinstrecker/, "knee_ext"],
  [/calf|lydk|waden/, "calf"],
  [/lateral|bokiem|seitheb/, "lateral_raise"],
  [/rear|face pull|odwrotn/, "rear_delt"],
  [/fly|rozpietk|butterfly|fliegend/, "chest_fly"],
  [/pull ?up|chin|podciag|klimmzug|pulldown|sciagan|latzug/, "v_pull"],
  [/row|wioslow|rudern/, "h_pull"],
  [/overhead|shoulder press|nad glowe|ohp|military|schulterdr/, "v_push"],
  [/bench|press|wyciskan|push ?up|pompk|dip|bankdr/, "h_push"],
  [/deadlift|martwy|rdl|hinge|kreuzheb|good morning|swing/, "hinge"],
  [/lunge|wykrok|split|step|bulgar|ausfall/, "single_leg"],
  [/squat|przysiad|kniebeug|leg press|suwnic/, "squat"],
  [/hip thrust|bridge|most|glute/, "hip_ext"],
  [/plank|deska|crunch|brzuch|ab |abs|core|dead bug/, "core"],
];

export function guessPattern(name: string): Pattern | null {
  const n = ` ${normalize(name)} `;
  for (const [re, p] of KEYWORDS) if (re.test(n)) return p;
  return null;
}

// "3x8", "3 x 8-10", "3×10", "4 sets of 5", "4 serie po 8", "3x30s", "3xAMRAP", "3x8 @ 60kg"
const SETS_REPS = /(\d{1,2})\s*(?:x|×|\*|sets? of|serie(?: po)?|satze? (?:a|à)?|sätze? (?:a|à)?)\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(s|sek|sec|min)?\b|(\d{1,2})\s*(?:x|×)\s*(amrap|max)/i;
const WEIGHT = /@?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*kg/i;

/** Exercise name from a line: without numbering, bullets, markdown stars, weights and "(muscle notes)". */
function cleanName(s: string): string {
  return s
    .replace(WEIGHT, " ")
    .replace(/\([^)]*\)?/g, " ")
    .replace(/\*+/g, " ")
    .replace(/^[\s\-–•\d.)]+/, "")
    .replace(/[:;,|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLine(line: string, library: Exercise[]): DraftExercise | null {
  const m = SETS_REPS.exec(line);
  if (!m) return null;
  const name = cleanName(line.replace(m[0], " "));
  if (!name) return null;
  let sets: number;
  let repMin = 0;
  let repMax = 0;
  let seconds: number | undefined;
  if (m[5]) {
    sets = Number(m[5]);
    repMin = 1;
    repMax = 20; // AMRAP: no fixed target, shown as an open range
  } else {
    sets = Number(m[1]);
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    if (m[4]) seconds = m[4].toLowerCase() === "min" ? a * 60 : a;
    else {
      repMin = Math.min(a, b);
      repMax = Math.max(a, b);
    }
  }
  if (sets < 1 || sets > 12) return null;
  const w = WEIGHT.exec(line);
  return {
    raw: line.trim(), name, sets, repMin, repMax, seconds,
    weightKg: w ? Number(w[1]!.replace(",", ".")) : undefined,
    match: matchExercise(name, library),
    guessedPattern: guessPattern(name),
  };
}

const ISOLATION: Pattern[] = ["elbow_flex", "elbow_ext", "lateral_raise", "rear_delt", "chest_fly", "calf", "knee_ext", "knee_flex", "core"];

/**
 * A line that is only an exercise name (plans kept in a notebook, sets "in the head"). Accepted only when
 * it is short and recognisably an exercise; it gets usual defaults (3 × 8–12, isolation 3 × 10–15) marked
 * `noSets` so the review asks the user to check them. Anything else stays in `unparsed`.
 */
export function parseNameOnly(line: string, library: Exercise[]): DraftExercise | null {
  const name = cleanName(line);
  if (!name || name.length > 60 || name.split(" ").length > 8 || /[.!?→]/.test(name)) return null;
  const match = matchExercise(name, library);
  const known = match ? library.find((e) => e.id === match.exerciseId) : undefined;
  const pattern = known?.pattern || guessPattern(name);
  if (!match && !pattern) return null;
  const iso = known ? known.mechanics === "isolation" : !!pattern && ISOLATION.includes(pattern);
  const w = WEIGHT.exec(line);
  return {
    raw: line.trim(), name, sets: 3, repMin: iso ? 10 : 8, repMax: iso ? 15 : 12, match, guessedPattern: guessPattern(name), noSets: true,
    weightKg: w ? Number(w[1]!.replace(",", ".")) : undefined,
  };
}

const WEEKDAY_WORDS = /(poniedzialek|wtorek|sroda|czwartek|piatek|sobota|niedziela|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|push|pull|legs|nogi|upper|lower|gora|dol|full ?body|fbw)/;

function isHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60 || SETS_REPS.test(t) || /^\d+[.)]/.test(t)) return false;
  const n = normalize(t);
  if (t.endsWith(":") || t.startsWith("#") || /^[A-Z]$/.test(t)) return true;
  // Markdown/WhatsApp emphasis (*Pośladki A*, GÓRA**) or a short line in capitals marks a day.
  if (/\*/.test(t) && !/\d\s*kg/i.test(t)) return true;
  const letters = t.replace(/\([^)]*\)/g, "").replace(/[^\p{L}]/gu, "");
  if (letters.length >= 3 && letters === letters.toUpperCase() && n.split(" ").length <= 5) return true;
  if (/^(day|dzien|tag|trening|training|workout|sesja|session)\b/.test(n)) return true;
  return WEEKDAY_WORDS.test(n) && n.split(" ").length <= 5;
}

/** "*NOGI + POŚLADKI B*" → "Nogi + pośladki B"; "GÓRA** (2× w tygodniu)" → "Góra". */
function headerName(line: string): string {
  const s = line.replace(/^#+\s*/, "").replace(/\([^)]*\)/g, " ").replace(/\*+/g, " ").replace(/:\s*$/, "").replace(/\s+/g, " ").trim() || line.trim();
  if (s !== s.toUpperCase()) return s;
  // Single letters/short codes (A, B, FBW) stay in capitals.
  return s.toLowerCase().replace(/^\p{L}/u, (c) => c.toUpperCase()).replace(/(^|\s)(\p{L})(?=\s|$)/gu, (m) => m.toUpperCase());
}

function splitRow(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseTable(lines: string[], library: Exercise[]): ImportDraft | null {
  const delim = ["\t", ";", ","].find((d) => lines[0]!.includes(d));
  if (!delim) return null;
  const head = splitRow(lines[0]!, delim).map(normalize);
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iEx = col(/exercise|cwiczeni|ubung|uebung|name|nazwa/);
  const iSets = col(/sets?|serie|satz|satze|saetze/);
  const iReps = col(/reps?|powtorz|wiederh|zakres/);
  const iDay = col(/day|dzien|tag|session|trening|workout/);
  const iW = col(/weight|kg|ciezar|gewicht|load/);
  if (iEx < 0 || iSets < 0) return null;

  const sessions = new Map<string, DraftSession>();
  const unparsed: string[] = [];
  for (const line of lines.slice(1)) {
    const c = splitRow(line, delim);
    const name = c[iEx] ?? "";
    const sets = Number(c[iSets]);
    const reps = (iReps >= 0 ? c[iReps] : "") ?? "";
    const rm = /(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(s|sek|sec)?/i.exec(reps);
    if (!name || !Number.isInteger(sets) || sets < 1 || sets > 12) {
      if (line.trim()) unparsed.push(line);
      continue;
    }
    const day = (iDay >= 0 ? c[iDay] : "") || "1";
    if (!sessions.has(day)) sessions.set(day, { name: day, exercises: [] });
    const a = rm ? Number(rm[1]) : 0;
    const b = rm?.[2] ? Number(rm[2]) : a;
    const seconds = rm?.[3] ? a : undefined;
    const weight = iW >= 0 ? Number((c[iW] ?? "").replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
    sessions.get(day)!.exercises.push({
      raw: line, name, sets,
      repMin: seconds ? 0 : a || 8, repMax: seconds ? 0 : b || a || 12, seconds,
      weightKg: Number.isFinite(weight) && weight > 0 ? weight : undefined,
      match: matchExercise(name, library), guessedPattern: guessPattern(name),
    });
  }
  return { sessions: [...sessions.values()], unparsed };
}

export function parseImport(text: string, library: Exercise[]): ImportDraft {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { sessions: [], unparsed: [] };
  const table = parseTable(lines, library);
  if (table && table.sessions.length) return table;

  const sessions: DraftSession[] = [];
  const unparsed: string[] = [];
  let current: DraftSession | null = null;
  for (const line of lines) {
    const ex = parseLine(line, library);
    if (ex) {
      if (!current) sessions.push((current = { name: "1", exercises: [] }));
      current.exercises.push(ex);
    } else if (isHeader(line)) {
      sessions.push((current = { name: headerName(line), exercises: [] }));
    } else {
      const bare = parseNameOnly(line, library);
      if (!bare) unparsed.push(line);
      else {
        if (!current) sessions.push((current = { name: "1", exercises: [] }));
        current.exercises.push(bare);
      }
    }
  }
  return { sessions: sessions.filter((s) => s.exercises.length > 0), unparsed };
}
