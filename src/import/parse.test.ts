import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/engine/exercises";
import { guessPattern, matchExercise, parseImport, parseLine } from "./parse";

describe("plan import", () => {
  it("parses a typical Polish text plan with headers", () => {
    const d = parseImport(
      `Dzień 1 - Push
Wyciskanie sztangi na ławce płaskiej 4x6-8
Wyciskanie hantli nad głowę 3 x 10
- Pompki na poręczach 3xAMRAP

Dzień 2 - Pull:
Podciąganie 4x5 @ 10kg
Wiosłowanie sztangą 3×8
To jest jakiś komentarz bez serii`,
      EXERCISES,
    );
    expect(d.sessions.map((s) => s.name)).toEqual(["Dzień 1 - Push", "Dzień 2 - Pull"]);
    const [a, b] = d.sessions;
    expect(a!.exercises[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 8, match: { exerciseId: "bench_press_bb" } });
    expect(a!.exercises[1]!.match?.exerciseId).toBe("db_shoulder_press");
    expect(a!.exercises[2]).toMatchObject({ sets: 3, repMin: 1, repMax: 20, match: { exerciseId: "dip" } });
    expect(b!.exercises[0]).toMatchObject({ sets: 4, repMin: 5, weightKg: 10 });
    expect(b!.exercises[0]!.match?.exerciseId).toMatch(/pull_up|chin_up|negative_pull_up|band_assisted_pull_up/);
    expect(b!.exercises[1]!.match?.exerciseId).toBe("barbell_row");
    expect(d.unparsed).toEqual(["To jest jakiś komentarz bez serii"]);
  });

  it("parses English and German set notation and timed sets", () => {
    expect(parseLine("Squat: 4 sets of 5", EXERCISES)).toMatchObject({ sets: 4, repMin: 5, repMax: 5, match: { exerciseId: "back_squat" } });
    expect(parseLine("Plank 3x30s", EXERCISES)).toMatchObject({ sets: 3, seconds: 30, match: { exerciseId: "plank" } });
    expect(parseLine("Kniebeuge 5x5", EXERCISES)!.match?.exerciseId).toBe("back_squat");
  });

  it("parses a pasted spreadsheet / CSV with headers", () => {
    const d = parseImport(
      `Day;Exercise;Sets;Reps;Weight
A;Lat pulldown;3;10-12;45
A;Leg press;3;12;120,5
B;"Cable fly, low to high";2;15;`,
      EXERCISES,
    );
    expect(d.sessions).toHaveLength(2);
    expect(d.sessions[0]!.exercises[1]).toMatchObject({ name: "Leg press", sets: 3, repMin: 12, repMax: 12, weightKg: 120.5, match: { exerciseId: "leg_press" } });
    expect(d.sessions[1]!.exercises[0]!.match?.exerciseId).toBe("cable_fly");
  });

  it("leaves unknown exercises unmatched but keeps them with a pattern guess", () => {
    const e = parseLine("Zercher deficit hackenschmidt thing 3x8", EXERCISES)!;
    expect(e.match).toBeNull();
    expect(parseLine("Spider curls 3x12", EXERCISES)!.guessedPattern).toBe("elbow_flex");
    expect(guessPattern("Wiosłowanie T-bar")).toBe("h_pull");
  });

  it("matches across languages and aliases", () => {
    expect(matchExercise("rdl", EXERCISES)?.exerciseId).toMatch(/romanian_deadlift/);
    expect(matchExercise("Latzug", EXERCISES)?.exerciseId).toBe("lat_pulldown");
    expect(matchExercise("xyz", EXERCISES)).toBeNull();
  });

  it("returns nothing for empty input", () => {
    expect(parseImport("   \n  ", EXERCISES)).toEqual({ sessions: [], unparsed: [] });
  });

  it("accepts a notebook plan without sets, with defaults to check", () => {
    const d = parseImport(`Trening A
Przysiad
Wyciskanie na ławce
Uginanie ramion z hantlami
Kupić nowe buty.

Trening B
Martwy ciąg 3x5`, EXERCISES);
    expect(d.sessions.map((s) => s.name)).toEqual(["Trening A", "Trening B"]);
    const a = d.sessions[0]!.exercises;
    expect(a).toHaveLength(3);
    expect(a[0]).toMatchObject({ sets: 3, repMin: 8, repMax: 12, noSets: true });
    expect(a[2]).toMatchObject({ repMin: 10, repMax: 15, noSets: true });
    expect(d.sessions[1]!.exercises[0]).toMatchObject({ sets: 3, repMin: 5 });
    expect(d.sessions[1]!.exercises[0]!.noSets).toBeUndefined();
    expect(d.unparsed).toEqual(["Kupić nowe buty."]);
  });

  it("reads a WhatsApp-style plan: *starred* / CAPS day names, (muscle notes), weights, glute machines", () => {
    const d = parseImport(`GÓRA** (2× w tygodniu)
1. Ściąganie drążka wyciągu górnego do klatki (plecy: najszerszy) 28.75 kg
2. Wiosłowanie siedząc na wyciągu (plecy: środek pleców, łopatki) 26,25 kg
3. Wyciskanie na maszynie na klatkę (klatka, trochę triceps i przód barków) 25kg
4. Unoszenie hantli bokiem (barki: boczny akton) 4kg
5. Prostowanie ramion na wyciągu (triceps) 8.75kg 
6. Uginanie ramion z hantlami (biceps) 6kg

*POŚLADKI A*
1. Hip thrust (pośladki)
2. Rumuński martwy ciąg (pośladki + tył uda)
3. Suwnica (przód uda + pośladki)
4. Odwodzenie nóg na maszynie (pośladki: boczna część)
5. Przywodzenie nóg na maszynie (wewnętrzna strona uda)

*NOGI + POŚLADKI B*
1. Suwnica (przód uda + pośladki) 70kg 
2. Uginanie nóg siedząc/leżąc (tył uda) 20kg 
3. Prostowanie nóg na maszynie (przód uda) 25kg
4. Hip thrust (pośladki) 60kg
5. Odwodzenie nóg na maszynie (pośladki: boczna część)
6. Przywodzenie nóg na maszynie (wewnętrzna strona uda)
7. Brzuch (mięśnie brzucha)

*TYDZIEŃ (4 treningi)*
Góra → Pośladki A → wolne → Góra → Nogi + pośladki B → wolne`, EXERCISES);
    expect(d.sessions.map((s) => s.name)).toEqual(["Góra", "Pośladki A", "Nogi + pośladki B"]);
    expect(d.sessions.map((s) => s.exercises.length)).toEqual([6, 5, 7]);
    const [up, a, b] = d.sessions;
    expect(up!.exercises.map((e) => e.match?.exerciseId)).toEqual(["lat_pulldown", "seated_cable_row", "machine_chest_press", "db_lateral_raise", "cable_pushdown", "db_curl"]);
    expect(up!.exercises[0]!.weightKg).toBe(28.75);
    expect(up!.exercises[1]!.weightKg).toBe(26.25);
    expect(a!.exercises[1]!.match?.exerciseId).toMatch(/^romanian_deadlift/);
    expect(a!.exercises.slice(3).map((e) => e.match?.exerciseId)).toEqual(["hip_abduction_machine", "hip_adduction_machine"]);
    expect(b!.exercises[3]).toMatchObject({ weightKg: 60, match: { exerciseId: "hip_thrust_bb" } });
    expect(d.unparsed).toHaveLength(1);
  });
});
