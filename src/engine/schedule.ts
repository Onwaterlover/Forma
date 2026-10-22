import { TEMPLATES, type Region, type Template } from "./templates";
import type { Equipment, Location, Sport, SportDemand, TrainingProfile, Weekday } from "./types";

export interface Assignment {
  template: string;
  day: Weekday;
  locationId: string;
}

export const SPORT_DEMANDS: Record<Sport["type"], SportDemand[]> = {
  climbing: ["pull", "grip"],
  bouldering: ["pull", "grip"],
  cycling: ["legs"],
  running: ["legs"],
  football: ["legs"],
  swimming: ["pull", "push"],
  martial_arts: ["full"],
  tennis: ["push", "legs"],
  other: [],
};

const INTENSITY = { easy: 0.5, moderate: 1, hard: 1.5 };

export function sportDemands(s: Sport): SportDemand[] {
  return s.type === "other" ? s.demands ?? [] : SPORT_DEMANDS[s.type];
}

export function availableDays(p: TrainingProfile): Weekday[] {
  return p.week.flatMap((d, i) => (!d.rest && d.locations.length > 0 ? [i as Weekday] : []));
}

function overlap(t: Template, demands: SportDemand[]): number {
  let o = 0;
  for (const d of demands) {
    if (d === "full") o += Math.max(...Object.values(t.load), 0);
    else o += t.load[d as Region] ?? 0;
  }
  return o;
}

function sharedLoad(a: Template, b: Template): number {
  let o = 0;
  for (const r of ["legs", "pull", "push"] as Region[]) o += Math.min(a.load[r] ?? 0, b.load[r] ?? 0);
  return o;
}

function* combinations<T>(arr: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]!);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

function uniquePermutations(items: string[]): string[][] {
  const out: string[][] = [];
  const sorted = [...items].sort();
  const used = sorted.map(() => false);
  const cur: string[] = [];
  const rec = () => {
    if (cur.length === sorted.length) {
      out.push([...cur]);
      return;
    }
    for (let i = 0; i < sorted.length; i++) {
      if (used[i] || (i > 0 && sorted[i] === sorted[i - 1] && !used[i - 1])) continue;
      used[i] = true;
      cur.push(sorted[i]!);
      rec();
      cur.pop();
      used[i] = false;
    }
  };
  rec();
  return out;
}

/**
 * Picks training days and maps session templates to them, minimising a transparent cost:
 * missing equipment, back-to-back sessions hitting the same region, uneven spacing,
 * and heavy overlap with the user's other sports around their sport days.
 * `coverage(templateId, equipment)` returns 0..1 = share of important slots that can be filled.
 */
export function assign(
  p: TrainingProfile,
  templates: string[],
  coverage: (templateId: string, equipment: Equipment[]) => number,
  startDay?: Weekday,
): Assignment[] {
  const days = availableDays(p);
  const n = Math.min(templates.length, days.length);
  if (n === 0) return [];
  const used = templates.slice(0, n);
  const locById = new Map<string, Location>(p.locations.map((l) => [l.id, l]));

  // Best location (and its coverage) for each template on each day.
  const best = new Map<string, { locationId: string; cov: number }>();
  for (const t of new Set(used)) {
    for (const d of days) {
      let top = { locationId: "", cov: -1 };
      for (const lid of p.week[d]!.locations) {
        const loc = locById.get(lid);
        if (!loc) continue;
        const cov = coverage(t, loc.equipment);
        if (cov > top.cov) top = { locationId: lid, cov };
      }
      best.set(`${t}@${d}`, top);
    }
  }

  const beginnerFactor = p.experience === "beginner" ? 1.3 : 1;
  const ideal = 7 / n;
  let bestCost = Infinity;
  let bestAssign: Assignment[] = [];
  const perms = uniquePermutations(used);

  for (const daySet of combinations(days, n)) {
    for (const perm of perms) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const d = daySet[i]!;
        const t = TEMPLATES[perm[i]!]!;
        const b = best.get(`${perm[i]}@${d}`)!;
        cost += (1 - Math.max(b.cov, 0)) * 12;
        for (const s of p.sports) {
          const o = overlap(t, sportDemands(s)) * INTENSITY[s.intensity ?? "moderate"];
          for (const e of s.days) {
            if (e === d) cost += o + 0.5;
            if (e === (d + 1) % 7) cost += 2 * o;
            if ((e + 1) % 7 === d) cost += o;
          }
        }
      }
      if (n >= 2) {
        for (let i = 0; i < n; i++) {
          const a = daySet[i]!;
          const b = daySet[(i + 1) % n]!;
          const gap = (b - a + 7) % 7 || 7;
          cost += 0.25 * (gap - ideal) ** 2;
          if (gap === 1) cost += 2.5 * beginnerFactor * sharedLoad(TEMPLATES[perm[i]!]!, TEMPLATES[perm[(i + 1) % n]!]!);
        }
      }
      // Tiny tie-break only: among equally good day sets, one that includes today lets you start right away.
      if (startDay !== undefined && !daySet.includes(startDay)) cost += 0.05;
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        bestAssign = daySet.map((d, i) => ({ template: perm[i]!, day: d, locationId: best.get(`${perm[i]}@${d}`)!.locationId }));
      }
    }
  }
  return bestAssign;
}
