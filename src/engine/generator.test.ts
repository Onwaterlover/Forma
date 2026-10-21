import { describe, expect, it } from "vitest";
import { moveSession, nextSession, shortenSession, adaptToLocation } from "./adapt";
import { estimateMinutes } from "./duration";
import { isPossible, LOCATION_PRESETS } from "./equipment";
import { EXERCISES, EXERCISE_BY_ID } from "./exercises";
import { generatePlan, rebuildSession } from "./generator";
import { defaultProfile, parseProfile } from "./profile";
import { validatePlan } from "./validate";
import type { Equipment, Exercise, ExercisePref, Location, Plan, TrainingProfile, Weekday } from "./types";

const gym = (): Location => ({ id: "gym", name: "Gym", kind: "gym", equipment: [...LOCATION_PRESETS.commercial_gym!.equipment] });
const home = (eq: Equipment[] = LOCATION_PRESETS.home_dumbbells!.equipment): Location => ({ id: "home", name: "Home", kind: "home", equipment: [...eq] });
const park = (): Location => ({ id: "park", name: "Park", kind: "park", equipment: [...LOCATION_PRESETS.calisthenics_park!.equipment] });

function week(map: Partial<Record<Weekday, string[]>>) {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ locations: map[d as Weekday] ?? [] }));
}

function profile(over: Partial<TrainingProfile> = {}): TrainingProfile {
  return parseProfile({ ...defaultProfile(), ...over });
}

const lookup = (lib: Exercise[]) => {
  const m = new Map(lib.map((e) => [e.id, e]));
  return (id: string) => m.get(id)!;
};

function gen(p: TrainingProfile, prefs: Record<string, ExercisePref> = {}, library: Exercise[] = EXERCISES) {
  const plan = generatePlan({ profile: p, prefs, library });
  const issues = validatePlan({ plan, profile: p, prefs, library });
  const errors = issues.filter((i) => i.severity === "error");
  expect(errors, JSON.stringify(errors)).toEqual([]);
  return { plan, issues };
}

const allExercises = (plan: Plan) => plan.sessions.flatMap((s) => s.exercises.map((e) => EXERCISE_BY_ID.get(e.exerciseId)!));
const share = (plan: Plan, pred: (e: Exercise) => boolean) => {
  const xs = allExercises(plan).filter((e) => e.pattern !== "core" && e.pattern !== "conditioning");
  return xs.filter(pred).length / xs.length;
};
const fitsTime = (plan: Plan, limit: number) =>
  plan.sessions.every((s) => estimateMinutes(s.exercises, lookup(EXERCISES)) <= limit * 1.1 + 1);

describe("workout generator", () => {
  it("beginner, two 30-minute sessions", () => {
    const p = profile({ experience: "beginner", goal: "start", sessionsPerWeek: 2, sessionMinutes: 30, week: week({ 0: ["gym"], 3: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(plan.sessions).toHaveLength(2);
    expect(fitsTime(plan, 30)).toBe(true);
    expect(allExercises(plan).every((e) => e.skill < 3)).toBe(true);
    expect(plan.sessions.every((s) => s.exercises.length >= 3)).toBe(true);
    expect(plan.notes.some((n) => n.code === "beginner_effort")).toBe(true);
  });

  it("experienced user, five training days, 60 minutes", () => {
    const p = profile({ experience: "advanced", goal: "muscle", sessionsPerWeek: 5, sessionMinutes: 60, week: week({ 0: ["gym"], 1: ["gym"], 2: ["gym"], 3: ["gym"], 4: ["gym"], 5: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(plan.sessions).toHaveLength(5);
    expect(plan.split).toBe("upper_lower_ppl");
    expect(fitsTime(plan, 60)).toBe(true);
    for (const m of ["chest", "lats", "quads", "hamstrings"] as const) expect(plan.weeklySets[m] ?? 0).toBeGreaterThanOrEqual(6);
    for (const m of ["chest", "quads"] as const) expect(plan.weeklySets[m] ?? 0).toBeLessThanOrEqual(25);
  });

  it("upper-body specialisation with little leg training", () => {
    const p = profile({
      experience: "intermediate", goal: "muscle", sessionsPerWeek: 4, sessionMinutes: 60, locations: [gym()],
      week: week({ 0: ["gym"], 1: ["gym"], 3: ["gym"], 4: ["gym"] }),
      priorities: { lats: "high", side_delts: "high", upper_back: "high", quads: "maintain", hamstrings: "maintain", glutes: "maintain", calves: "maintain" },
    });
    const { plan, issues } = gen(p);
    const legs = (plan.weeklySets.quads ?? 0) + (plan.weeklySets.hamstrings ?? 0);
    expect(plan.weeklySets.side_delts ?? 0).toBeGreaterThan(plan.weeklySets.quads ?? 0);
    expect(plan.weeklySets.lats ?? 0).toBeGreaterThan(legs / 2);
    expect(legs).toBeGreaterThan(0); // maintenance, not zero
    expect(plan.tradeoffs.some((t) => t.code === "reduced_volume_muscles")).toBe(true);
    expect(issues.filter((i) => i.code === "priority_not_met")).toEqual([]);
  });

  it("balanced full body, three days", () => {
    const p = profile({ experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan, issues } = gen(p);
    expect(plan.split).toBe("full_body");
    expect(issues.filter((i) => i.code === "muscle_untrained")).toEqual([]);
    expect(plan.sessions.map((s) => s.day)).toEqual([0, 2, 4]);
  });

  it("home dumbbells only", () => {
    const p = profile({ sessionsPerWeek: 3, sessionMinutes: 45, week: week({ 0: ["home"], 2: ["home"], 4: ["home"] }), locations: [home()] });
    const { plan } = gen(p);
    for (const e of allExercises(plan)) expect(isPossible(e, home().equipment)).toBe(true);
    expect(allExercises(plan).some((e) => e.kind === "dumbbell")).toBe(true);
  });

  it("bodyweight calisthenics in a park", () => {
    const p = profile({ styles: ["bodyweight"], sessionsPerWeek: 3, sessionMinutes: 45, week: week({ 1: ["park"], 3: ["park"], 5: ["park"] }), locations: [park()] });
    const { plan } = gen(p);
    for (const e of allExercises(plan)) expect(["bodyweight", "cardio"]).toContain(e.kind);
    expect(allExercises(plan).some((e) => e.pattern === "v_pull")).toBe(true);
  });

  it("a bodyweight preference at a gym keeps dips, push-ups and pull-ups but loads rows and legs", () => {
    const p = profile({ styles: ["bodyweight"], experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    const all = allExercises(plan);
    const upper = all.filter((e) => ["h_push", "v_pull"].includes(e.pattern));
    const legs = all.filter((e) => ["squat", "hinge", "single_leg", "h_pull"].includes(e.pattern));
    expect(upper.some((e) => e.kind === "bodyweight")).toBe(true);
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.every((e) => e.kind !== "bodyweight")).toBe(true);
  });

  it("matches bodyweight exercises to experience: push-ups for beginners, dips and pull-ups later", () => {
    const pick = (experience: "beginner" | "advanced") => {
      const p = profile({ styles: ["bodyweight"], experience, goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
      return allExercises(gen(p).plan).filter((e) => e.pattern === "h_push" || e.pattern === "v_pull").map((e) => e.id);
    };
    expect(pick("beginner")).toContain("push_up");
    const advanced = pick("advanced");
    expect(advanced).not.toContain("push_up");
    expect(advanced).toContain("dip");
    expect(advanced).toContain("pull_up");
  });

  it("bodyweight only at home with no equipment at all", () => {
    const p = profile({ sessionsPerWeek: 2, sessionMinutes: 30, week: week({ 1: ["bw"], 4: ["bw"] }), locations: [{ id: "bw", name: "Flat", kind: "home", equipment: [] }] });
    const { plan } = gen(p);
    expect(plan.sessions.every((s) => s.exercises.length >= 3)).toBe(true);
    for (const e of allExercises(plan)) expect(e.equipment.length + (e.equipmentAnyOf?.length ?? 0)).toBe(0);
  });

  it.each([
    ["machines", (e: Exercise) => ["machine", "cable", "smith"].includes(e.kind)],
    ["free", (e: Exercise) => ["barbell", "dumbbell", "kettlebell"].includes(e.kind)],
  ] as const)("style preference %s dominates exercise choice", (style, pred) => {
    const p = profile({ styles: [style], experience: "intermediate", goal: "muscle", sessionsPerWeek: 4, sessionMinutes: 60, week: week({ 0: ["gym"], 1: ["gym"], 3: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(share(plan, pred)).toBeGreaterThanOrEqual(0.6);
  });

  it.each([[["machines", "free"]], [[]]] as const)("styles %j produce a valid varied plan", (styles) => {
    const p = profile({ styles: [...styles], experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    const kinds = new Set(allExercises(plan).map((e) => e.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(2);
  });

  it("gym only on certain weekdays, home on others", () => {
    const p = profile({
      experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym(), home()],
      week: week({ 0: ["gym"], 2: ["home"], 4: ["gym"] }),
    });
    const { plan } = gen(p);
    const wed = plan.sessions.find((s) => s.day === 2)!;
    expect(wed.locationId).toBe("home");
    for (const pe of wed.exercises) expect(isPossible(EXERCISE_BY_ID.get(pe.exerciseId)!, home().equipment)).toBe(true);
    expect(plan.sessions.filter((s) => s.locationId === "gym").map((s) => s.day)).toEqual([0, 4]);
  });

  it("multiple locations on one day picks the better-equipped one", () => {
    const p = profile({ sessionsPerWeek: 2, sessionMinutes: 45, locations: [home(), gym()], week: week({ 1: ["home", "gym"], 4: ["home"] }) });
    const { plan } = gen(p);
    expect(plan.sessions.find((s) => s.day === 1)!.locationId).toBe("gym");
  });

  it("moving a gym session to a home-only day adapts the exercises", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 2, sessionMinutes: 60, locations: [gym(), home()], week: week({ 0: ["gym"], 3: ["gym"], 5: ["home"] }) });
    const { plan } = gen(p);
    const moved = moveSession(plan.sessions[0]!, 5, { profile: p, prefs: {}, library: EXERCISES });
    expect(moved.session.locationId).toBe("home");
    for (const pe of moved.session.exercises) expect(isPossible(EXERCISE_BY_ID.get(pe.exerciseId)!, home().equipment)).toBe(true);
    const newPlan = { ...plan, sessions: [moved.session, ...plan.sessions.slice(1)] };
    expect(validatePlan({ plan: newPlan, profile: p, prefs: {}, library: EXERCISES }).filter((i) => i.severity === "error")).toEqual([]);
    expect(moveSession(plan.sessions[0]!, 6, { profile: p, prefs: {}, library: EXERCISES }).changes[0]!.code).toBe("day_unavailable");
  });

  it("gym unavailable today: change location on the fly", () => {
    const p = profile({ sessionsPerWeek: 2, sessionMinutes: 45, locations: [gym(), park()], week: week({ 0: ["gym"], 3: ["gym", "park"] }) });
    const { plan } = gen(p);
    const r = adaptToLocation(plan.sessions[0]!, "park", { profile: p, prefs: {}, library: EXERCISES });
    for (const pe of r.session.exercises) expect(isPossible(EXERCISE_BY_ID.get(pe.exerciseId)!, park().equipment)).toBe(true);
    expect(r.changes.length).toBeGreaterThan(0);
  });

  it("two weekly climbing sessions: pull work kept away from the day before", () => {
    const p = profile({
      experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym()],
      week: week({ 0: ["gym"], 1: ["gym"], 2: ["gym"], 3: ["gym"], 4: ["gym"], 5: ["gym"] }),
      sports: [{ id: "c", type: "climbing", days: [2, 5], perWeek: 2, intensity: "hard" }],
    });
    const { plan, issues } = gen(p);
    expect(issues.filter((i) => i.code === "sport_conflict")).toEqual([]);
    expect(plan.notes.some((n) => n.code === "sport_pull_overlap")).toBe(true);
    // Sessions are never on the day before climbing when other days exist.
    for (const s of plan.sessions) expect([1, 4]).not.toContain(s.day);
  });

  it("hard cycling plus leg training", () => {
    const p = profile({
      experience: "intermediate", sessionsPerWeek: 4, sessionMinutes: 60, locations: [gym()],
      week: week({ 0: ["gym"], 1: ["gym"], 2: ["gym"], 3: ["gym"], 4: ["gym"], 5: ["gym"] }),
      sports: [{ id: "b", type: "cycling", days: [5], perWeek: 1, intensity: "hard", minutes: 120 }],
    });
    const { plan, issues } = gen(p);
    expect(issues.filter((i) => i.code === "sport_conflict")).toEqual([]);
    const friday = plan.sessions.find((s) => s.day === 4);
    if (friday) expect(["UPPER_A", "UPPER_B"]).toContain(friday.template);
  });

  it("excluded exercises never appear", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 4, sessionMinutes: 60, locations: [gym()], week: week({ 0: ["gym"], 1: ["gym"], 3: ["gym"], 4: ["gym"] }) });
    const first = gen(p).plan;
    const excluded = Object.fromEntries(allExercises(first).slice(0, 6).map((e) => [e.id, "exclude" as const]));
    const { plan } = gen(p, excluded);
    for (const e of allExercises(plan)) expect(excluded[e.id]).toBeUndefined();
  });

  it("disliked exercises are replaced when an alternative exists", () => {
    const p = profile({ sessionsPerWeek: 3, sessionMinutes: 45, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) });
    const first = gen(p).plan;
    const disliked = allExercises(first)[0]!.id;
    const { plan } = gen(p, { [disliked]: "dislike" });
    expect(allExercises(plan).map((e) => e.id)).not.toContain(disliked);
  });

  it("pain restrictions are conservative: no automatic look-alike substitutes", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) });
    const { plan } = gen(p, { overhead_press_bb: "pain", db_shoulder_press: "pain" });
    expect(allExercises(plan).some((e) => e.pattern === "v_push")).toBe(false);
    expect(plan.notes.some((n) => n.code === "pain_pattern_skipped")).toBe(true);
  });

  it("one short session per week", () => {
    const p = profile({ sessionsPerWeek: 1, sessionMinutes: 30, week: week({ 5: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(plan.sessions).toHaveLength(1);
    expect(fitsTime(plan, 30)).toBe(true);
    const patterns = new Set(plan.sessions[0]!.exercises.map((e) => e.pattern));
    expect(patterns.has("squat") || patterns.has("hinge")).toBe(true);
    expect(patterns.has("h_push")).toBe(true);
  });

  it("twenty-minute time limit is respected and cuts are explained", () => {
    const p = profile({ experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 20, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(fitsTime(plan, 20)).toBe(true);
    expect(plan.tradeoffs.length).toBeGreaterThan(0);
    expect(plan.sessions.every((s) => s.exercises.length >= 2)).toBe(true);
  });

  it("unavailable gym equipment is never used", () => {
    const missing: Equipment[] = ["leg_press", "smith", "chest_press", "pec_deck", "leg_extension"];
    const loc = { ...gym(), equipment: gym().equipment.filter((e) => !missing.includes(e)) };
    const p = profile({ styles: ["machines"], sessionsPerWeek: 4, sessionMinutes: 60, locations: [loc], week: week({ 0: ["gym"], 1: ["gym"], 3: ["gym"], 4: ["gym"] }) });
    const { plan } = gen(p);
    for (const e of allExercises(plan)) for (const req of e.equipment) expect(missing).not.toContain(req);
  });

  it("explicitly excluded equipment category is a hard constraint", () => {
    const p = profile({ excludedKinds: ["barbell"], goal: "strength", experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) });
    const { plan } = gen(p);
    expect(allExercises(plan).some((e) => e.kind === "barbell")).toBe(false);
  });

  it("strength goal favours barbell main lifts for experienced users", () => {
    const p = profile({ goal: "strength", experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 75, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) });
    const { plan } = gen(p);
    const main = plan.sessions.flatMap((s) => s.exercises.filter((e) => e.priority === 1));
    expect(main.some((e) => EXERCISE_BY_ID.get(e.exerciseId)!.kind === "barbell")).toBe(true);
    expect(main.some((e) => e.repMax <= 6)).toBe(true);
  });

  it("custom exercises are used when they fit", () => {
    const custom: Exercise = {
      ...EXERCISE_BY_ID.get("db_curl")!, id: "custom_spider_curl", custom: true,
      name: { pl: "Spider curl", en: "Spider curl", de: "Spider curl" },
    };
    const library = [...EXERCISES, custom];
    const p = profile({ sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) });
    const { plan } = gen(p, { custom_spider_curl: "favorite" }, library);
    expect(plan.sessions.some((s) => s.exercises.some((e) => e.exerciseId === "custom_spider_curl"))).toBe(true);
  });

  it("conflicting requirements: five sessions requested but three days available", () => {
    const p = profile({ sessionsPerWeek: 5, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    expect(plan.sessions).toHaveLength(3);
    expect(plan.tradeoffs[0]).toEqual({ code: "fewer_days_than_requested", params: { requested: 5, available: 3 } });
  });

  it("no available days yields an empty plan with an explanation", () => {
    const p = profile({ week: week({}), locations: [gym()] });
    const plan = generatePlan({ profile: p });
    expect(plan.sessions).toEqual([]);
    expect(plan.tradeoffs[0]!.code).toBe("no_days_available");
  });

  it("rest days are never used", () => {
    const w = week({ 0: ["gym"], 1: ["gym"], 2: ["gym"] });
    w[1] = { locations: ["gym"], rest: true } as never;
    const p = profile({ sessionsPerWeek: 3, week: w, locations: [gym()] });
    const { plan } = gen(p);
    expect(plan.sessions.map((s) => s.day)).not.toContain(1);
  });

  it("changing the schedule regenerates a valid plan", () => {
    const base = { experience: "intermediate" as const, sessionsPerWeek: 3, sessionMinutes: 60, locations: [gym(), home()] };
    gen(profile({ ...base, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }) }));
    const { plan } = gen(profile({ ...base, week: week({ 1: ["home"], 3: ["gym"], 6: ["home"] }) }));
    expect(plan.sessions.map((s) => s.day)).toEqual([1, 3, 6]);
  });

  it("missed sessions are offered next rather than skipped", () => {
    const p = profile({ sessionsPerWeek: 3, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    // Monday's A was done, Wednesday's B was missed; on Thursday we offer B.
    expect(nextSession(plan.sessions, 3, "A")!.key).toBe("B");
    expect(nextSession(plan.sessions, 4, "A")!.key).toBe("C"); // Friday has its own scheduled session
  });

  it("shortening today's session keeps the most important exercises", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 75, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    const s = plan.sessions[0]!;
    const short = shortenSession(s, 20, { profile: p, prefs: {}, library: EXERCISES });
    expect(short.session.estimatedMinutes).toBeLessThanOrEqual(22);
    const keptMain = s.exercises.filter((e) => e.priority === 1).filter((e) => short.session.exercises.some((x) => x.exerciseId === e.exerciseId));
    expect(keptMain.length).toBeGreaterThanOrEqual(2);
  });

  it("prefers a two-sided row (chest-supported) over a one-arm row to save time", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 2, sessionMinutes: 45, week: week({ 0: ["home"], 3: ["home"] }), locations: [home()] });
    const { plan } = gen(p);
    const rows = allExercises(plan).filter((e) => e.pattern === "h_pull").map((e) => e.id);
    expect(rows).toContain("chest_supported_db_row");
    expect(rows).not.toContain("one_arm_db_row");
  });

  it("counts one-side-at-a-time exercises as slower", () => {
    const lk = lookup(EXERCISES);
    const pe = (id: string) => ({ exerciseId: id, sets: 3, repMin: 8, repMax: 12, restSec: 90, effort: "leave_0_2" as const, progression: "double" as const, pattern: "h_pull" as const, priority: 1 as const });
    expect(estimateMinutes([pe("one_arm_db_row")], lk)).toBeGreaterThan(estimateMinutes([pe("chest_supported_db_row")], lk));
  });

  it("rows and pulldowns carry a default grip the user can change", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    const pulls = plan.sessions.flatMap((s) => s.exercises).filter((e) => EXERCISE_BY_ID.get(e.exerciseId)!.grips);
    expect(pulls.length).toBeGreaterThan(0);
    for (const e of pulls) expect(EXERCISE_BY_ID.get(e.exerciseId)!.grips).toContain(e.grip);
  });

  it("sports given only as times per week (no fixed days) are supported", () => {
    const p = profile({ sessionsPerWeek: 3, sessionMinutes: 45, locations: [gym()], week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), sports: [{ id: "c", type: "climbing", days: [], perWeek: 2 }] });
    const { plan } = gen(p);
    expect(plan.notes.some((n) => n.code === "sport_pull_overlap")).toBe(true);
  });

  it("reads profiles saved with the old single style field", () => {
    const legacy = { ...defaultProfile(), styles: undefined, style: "mixed" } as unknown as TrainingProfile;
    delete (legacy as unknown as Record<string, unknown>).styles;
    expect(parseProfile(legacy).styles).toEqual(["machines", "free"]);
  });

  it("no gym today: rebuilding a gym session without equipment keeps its purpose", () => {
    const p = profile({ experience: "intermediate", goal: "muscle", sessionsPerWeek: 3, sessionMinutes: 60, week: week({ 0: ["gym"], 2: ["gym"], 4: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    for (const s of plan.sessions) {
      const r = rebuildSession(p, s, [], { prefs: {}, library: EXERCISES })!;
      const ex = r.session.exercises.map((e) => EXERCISE_BY_ID.get(e.exerciseId)!);
      for (const e of ex) expect(isPossible(e, [])).toBe(true);
      expect(ex.length).toBeGreaterThanOrEqual(4);
      // Same main movement patterns as the gym version where a bodyweight option exists.
      const gymMain = s.exercises.filter((e) => e.priority === 1).map((e) => e.pattern).filter((pt) => pt !== "v_pull");
      for (const pt of gymMain) expect(r.session.exercises.map((e) => e.pattern)).toContain(pt);
      expect(r.session.estimatedMinutes).toBeLessThanOrEqual(66);
    }
  });

  it("rebuilding for less time and another place respects both", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 2, sessionMinutes: 75, week: week({ 0: ["gym"], 3: ["gym"] }), locations: [gym(), home()] });
    const { plan } = gen(p);
    const r = rebuildSession(p, plan.sessions[0]!, home().equipment, { prefs: {}, library: EXERCISES, minutes: 25 })!;
    expect(r.session.estimatedMinutes).toBeLessThanOrEqual(28);
    for (const pe of r.session.exercises) expect(isPossible(EXERCISE_BY_ID.get(pe.exerciseId)!, home().equipment)).toBe(true);
  });

  it("is deterministic", () => {
    const p = profile({ experience: "intermediate", sessionsPerWeek: 4, week: week({ 0: ["gym"], 1: ["gym"], 3: ["gym"], 4: ["gym"] }), locations: [gym()] });
    expect(JSON.stringify(generatePlan({ profile: p }))).toBe(JSON.stringify(generatePlan({ profile: p })));
  });

  it("never schedules duplicate exercises within a session", () => {
    const p = profile({ experience: "advanced", sessionsPerWeek: 6, sessionMinutes: 90, week: week({ 0: ["gym"], 1: ["gym"], 2: ["gym"], 3: ["gym"], 4: ["gym"], 5: ["gym"] }), locations: [gym()] });
    const { plan } = gen(p);
    for (const s of plan.sessions) expect(new Set(s.exercises.map((e) => e.exerciseId)).size).toBe(s.exercises.length);
  });

  it("random profiles never violate hard constraints (fuzz)", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pickOne = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
    const presets = Object.values(LOCATION_PRESETS);
    for (let i = 0; i < 150; i++) {
      const locs: Location[] = [0, 1].map((k) => ({ id: `l${k}`, name: `L${k}`, kind: "other", equipment: [...pickOne(presets).equipment] }));
      const w = [0, 1, 2, 3, 4, 5, 6].map(() => ({ locations: rnd() < 0.5 ? [] : rnd() < 0.5 ? ["l0"] : rnd() < 0.5 ? ["l1"] : ["l0", "l1"] }));
      const prefs: Record<string, ExercisePref> = {};
      for (let k = 0; k < 6; k++) prefs[pickOne(EXERCISES).id] = pickOne(["favorite", "like", "dislike", "exclude", "pain"] as const);
      const p = profile({
        goal: pickOne(["muscle", "strength", "health", "conditioning", "sport", "start", "unsure"] as const),
        experience: pickOne(["beginner", "intermediate", "advanced"] as const),
        sessionsPerWeek: 1 + Math.floor(rnd() * 7),
        sessionMinutes: pickOne([20, 30, 45, 60, 75, 90]),
        styles: (["machines", "free", "bodyweight"] as const).filter(() => rnd() < 0.4),
        excludedKinds: rnd() < 0.2 ? [pickOne(["barbell", "machine", "dumbbell"] as const)] : [],
        supersets: rnd() < 0.5 ? "allow" : "avoid",
        priorities: rnd() < 0.5 ? { [pickOne(["chest", "quads", "lats", "side_delts", "biceps"] as const)]: pickOne(["high", "low", "maintain"] as const) } : {},
        sports: rnd() < 0.3 ? [{ id: "s", type: pickOne(["climbing", "running", "football", "cycling"] as const), days: [Math.floor(rnd() * 7) as Weekday], perWeek: 1, intensity: "hard" }] : [],
        locations: locs,
        week: w,
      });
      gen(p, prefs);
    }
  });
});
