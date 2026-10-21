// Optional body circumferences (cm). Pure helpers shared by the data layer, the server action and the UI.

export const MEASUREMENT_SITES = ["waist", "hips", "chest", "arm", "thigh"] as const;
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number];

/** One row per user per day; any site may be left out. */
export type Measurement = { date: string } & Record<MeasurementSite, number | null>;

/** Plausible range for any circumference; matches the database CHECK constraints. */
export const MEASUREMENT_MIN_CM = 10;
export const MEASUREMENT_MAX_CM = 300;

export const emptyMeasurement = (date: string): Measurement => ({ date, waist: null, hips: null, chest: null, arm: null, thigh: null });

export interface SiteTrend {
  site: MeasurementSite;
  /** Oldest first. */
  points: { date: string; cm: number }[];
  latest: { date: string; cm: number };
  first: { date: string; cm: number };
  /** latest − first, or null with a single reading. */
  change: number | null;
}

/**
 * Per-site readings over time, for the sites that have at least one value. No smoothing: circumferences are
 * measured rarely (every few weeks), so each reading is shown as it is.
 */
export function measurementTrends(rows: Measurement[]): SiteTrend[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const out: SiteTrend[] = [];
  for (const site of MEASUREMENT_SITES) {
    const points = sorted.flatMap((r) => {
      const cm = r[site];
      return cm === null ? [] : [{ date: r.date, cm }];
    });
    if (!points.length) continue;
    const first = points[0]!;
    const latest = points.at(-1)!;
    out.push({ site, points, first, latest, change: points.length > 1 ? Math.round((latest.cm - first.cm) * 10) / 10 : null });
  }
  return out;
}
