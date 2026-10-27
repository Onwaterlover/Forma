import type { Exercise } from "./types";

// Original exercise library. Cues are short, written for this app; German falls back to English cues.
// Substitutions are computed from pattern + muscles + equipment (see substitutes()), not hard-coded.

type Def = Omit<Exercise, "id" | "name" | "cue" | "safety"> & {
  pl: string; en: string; de: string;
  cuePl: string; cueEn: string;
  safetyPl?: string; safetyEn?: string;
};

function ex(id: string, d: Def): Exercise {
  const { pl, en, de, cuePl, cueEn, safetyPl, safetyEn, ...rest } = d;
  return {
    id,
    name: { pl, en, de },
    cue: { pl: cuePl, en: cueEn },
    ...(safetyPl ? { safety: { pl: safetyPl, en: safetyEn } } : {}),
    ...rest,
  };
}

const DB = ["dumbbells"] as const;

export const EXERCISES: Exercise[] = [
  // ── Squat / knee-dominant ─────────────────────────────────────────────
  ex("back_squat", {
    pl: "Przysiad ze sztangą", en: "Barbell back squat", de: "Kniebeuge mit Langhantel", aliases: ["squat", "przysiad", "back squat", "kniebeuge"],
    primary: ["quads", "glutes"], secondary: ["lower_back"],
    pattern: "squat", equipment: ["barbell", "rack"], kind: "barbell", mechanics: "compound", skill: 3, fatigue: "high", stable: false, loading: "total",
    cuePl: "Stopy na szerokość bioder, klatka w górę, zejdź kontrolowanie tak nisko, jak pozwala technika.",
    cueEn: "Feet about hip width, chest up, descend under control as deep as good form allows.",
    safetyPl: "Ustaw zabezpieczenia stojaka. Nie trenuj do upadku mięśniowego.", safetyEn: "Set the rack safeties. Avoid grinding to failure.",
  }),
  ex("goblet_squat", {
    pl: "Przysiad goblet", en: "Goblet squat", de: "Goblet Squat", aliases: ["goblet"],
    primary: ["quads", "glutes"], secondary: ["abs"], pattern: "squat", equipment: [], equipmentAnyOf: [...DB, "kettlebell"],
    kind: "dumbbell", mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Trzymaj ciężar przy klatce, łokcie między kolanami, plecy proste.", cueEn: "Hold the weight at your chest, elbows inside the knees, back straight.",
  }),
  ex("leg_press", {
    pl: "Wypychanie nogami na suwnicy", en: "Leg press", de: "Beinpresse", aliases: ["suwnica", "leg press", "beinpresse"],
    primary: ["quads", "glutes"], secondary: [], pattern: "squat", equipment: ["leg_press"], kind: "machine", machineType: "plate_loaded",
    mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Dolna część pleców przyklejona do oparcia, kolana podążają za palcami stóp.", cueEn: "Keep your lower back on the pad; knees track over your toes.",
  }),
  ex("smith_squat", {
    pl: "Przysiad na suwnicy Smitha", en: "Smith machine squat", de: "Kniebeuge an der Multipresse",
    primary: ["quads", "glutes"], secondary: [], pattern: "squat", equipment: ["smith"], kind: "smith", mechanics: "compound", skill: 1,
    fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Stopy lekko przed sztangą, schodź płynnie, tułów stabilny.", cueEn: "Feet slightly in front of the bar, smooth descent, braced torso.",
  }),
  ex("bodyweight_squat", {
    pl: "Przysiad bez obciążenia", en: "Bodyweight squat", de: "Kniebeuge ohne Gewicht", aliases: ["air squat"],
    primary: ["quads", "glutes"], secondary: [], pattern: "squat", equipment: [], kind: "bodyweight", mechanics: "compound", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Usiądź biodrami w tył i w dół, pięty na podłodze.", cueEn: "Sit hips back and down, heels on the floor.",
  }),

  // ── Single-leg ────────────────────────────────────────────────────────
  ex("bulgarian_split_squat_db", {
    unilateral: true,
    pl: "Bułgarski przysiad z hantlami", en: "Dumbbell Bulgarian split squat", de: "Bulgarische Kniebeuge mit Kurzhanteln", aliases: ["bulgarian", "bss"],
    primary: ["quads", "glutes"], secondary: [], pattern: "single_leg", equipment: [...DB, "bench"], kind: "dumbbell", mechanics: "compound",
    skill: 2, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Tylna stopa na ławce, schodź pionowo, przednia stopa cała na podłodze.", cueEn: "Rear foot on the bench, drop straight down, front foot flat.",
  }),
  ex("bulgarian_split_squat_bw", {
    unilateral: true,
    pl: "Bułgarski przysiad bez obciążenia", en: "Bodyweight Bulgarian split squat", de: "Bulgarische Kniebeuge ohne Gewicht",
    primary: ["quads", "glutes"], secondary: [], pattern: "single_leg", equipment: [], kind: "bodyweight", mechanics: "compound", skill: 2,
    fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Tylna stopa na krześle lub kanapie, kontrolowane zejście.", cueEn: "Rear foot on a chair or sofa, controlled descent.",
  }),
  ex("walking_lunge_db", {
    unilateral: true,
    pl: "Wykroki chodzone z hantlami", en: "Dumbbell walking lunge", de: "Ausfallschritte mit Kurzhanteln", aliases: ["lunges", "wykroki"],
    primary: ["quads", "glutes"], secondary: [], pattern: "single_leg", equipment: [...DB], kind: "dumbbell", mechanics: "compound", skill: 2,
    fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Długi krok, tylne kolano prawie dotyka podłogi.", cueEn: "Long step, back knee nearly touches the floor.",
  }),
  ex("reverse_lunge_bw", {
    unilateral: true,
    pl: "Wykroki w tył", en: "Reverse lunge", de: "Ausfallschritt rückwärts",
    primary: ["quads", "glutes"], secondary: [], pattern: "single_leg", equipment: [], kind: "bodyweight", mechanics: "compound", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Krok w tył, tułów prosto, odepchnij się przednią nogą.", cueEn: "Step back, torso tall, drive up through the front leg.",
  }),
  ex("step_up_db", {
    unilateral: true,
    pl: "Wejścia na ławkę z hantlami", en: "Dumbbell step-up", de: "Step-ups mit Kurzhanteln",
    primary: ["quads", "glutes"], secondary: [], pattern: "single_leg", equipment: [...DB, "bench"], kind: "dumbbell", mechanics: "compound",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell",
    cuePl: "Cała stopa na ławce, wejdź siłą przedniej nogi bez odbijania tylnej.", cueEn: "Whole foot on the bench; drive with the top leg, don't bounce off the back one.",
  }),

  // ── Hinge ─────────────────────────────────────────────────────────────
  ex("romanian_deadlift_bb", {
    pl: "Martwy ciąg rumuński ze sztangą", en: "Barbell Romanian deadlift", de: "Rumänisches Kreuzheben mit Langhantel", aliases: ["rdl"],
    primary: ["hamstrings", "glutes"], secondary: ["lower_back", "forearms"], pattern: "hinge", equipment: ["barbell"], kind: "barbell",
    mechanics: "compound", skill: 2, fatigue: "high", stable: false, loading: "total",
    cuePl: "Biodra w tył, sztanga blisko nóg, plecy neutralne, zatrzymaj się, gdy czujesz rozciąganie.", cueEn: "Hips back, bar close to the legs, neutral back; stop when you feel the stretch.",
    safetyPl: "Nie zaokrąglaj pleców; zostaw zapas powtórzeń.", safetyEn: "Don't round your back; keep reps in reserve.",
  }),
  ex("romanian_deadlift_db", {
    pl: "Martwy ciąg rumuński z hantlami", en: "Dumbbell Romanian deadlift", de: "Rumänisches Kreuzheben mit Kurzhanteln",
    primary: ["hamstrings", "glutes"], secondary: ["lower_back", "forearms"], pattern: "hinge", equipment: [], equipmentAnyOf: [...DB, "kettlebell"],
    kind: "dumbbell", mechanics: "compound", skill: 2, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Hantle przesuwają się wzdłuż ud, biodra w tył, kolana lekko ugięte.", cueEn: "Dumbbells slide along the thighs, hips back, soft knees.",
  }),
  ex("deadlift", {
    pl: "Martwy ciąg klasyczny", en: "Conventional deadlift", de: "Kreuzheben", aliases: ["deadlift", "martwy ciąg"],
    primary: ["glutes", "hamstrings", "lower_back"], secondary: ["quads", "upper_back", "forearms"], pattern: "hinge", equipment: ["barbell"],
    kind: "barbell", mechanics: "compound", skill: 3, fatigue: "high", stable: false, loading: "total",
    cuePl: "Sztanga nad środkiem stopy, napnij plecy, pchaj podłogę nogami.", cueEn: "Bar over mid-foot, brace, push the floor away.",
    safetyPl: "Bardzo męczące ćwiczenie — nie wykonuj serii do upadku.", safetyEn: "Very fatiguing — avoid sets to failure.",
  }),
  ex("kettlebell_swing", {
    pl: "Swing kettlebell", en: "Kettlebell swing", de: "Kettlebell Swing",
    primary: ["glutes", "hamstrings"], secondary: ["lower_back", "forearms"], pattern: "hinge", equipment: ["kettlebell"], kind: "kettlebell",
    mechanics: "compound", skill: 2, fatigue: "moderate", stable: false, loading: "per_dumbbell",
    cuePl: "Ruch z bioder, nie z ramion; mocny wyprost bioder na górze.", cueEn: "Power from the hips, not the arms; snap the hips at the top.",
  }),
  ex("back_extension", {
    pl: "Wyprosty tułowia na ławce rzymskiej", en: "Back extension", de: "Rückenstrecker", aliases: ["hyperextension"],
    primary: ["glutes", "hamstrings"], secondary: ["lower_back"], pattern: "hinge", equipment: ["back_extension"], kind: "machine",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Zginaj się w biodrach, wracaj do linii prostej bez przeprostu.", cueEn: "Hinge at the hips, return to a straight line without overextending.",
  }),
  ex("cable_pull_through", {
    pl: "Przeciąganie linki między nogami", en: "Cable pull-through", de: "Cable Pull-Through",
    primary: ["glutes", "hamstrings"], secondary: [], pattern: "hinge", equipment: ["cable"], kind: "cable", mechanics: "compound", skill: 1,
    fatigue: "low", stable: true, loading: "total",
    cuePl: "Tyłem do wyciągu, biodra w tył, wyprost bioder pośladkami.", cueEn: "Back to the cable, hips back, stand up by squeezing the glutes.",
  }),
  ex("single_leg_rdl_bw", {
    unilateral: true,
    pl: "Martwy ciąg na jednej nodze", en: "Single-leg Romanian deadlift", de: "Einbeiniges Kreuzheben",
    primary: ["hamstrings", "glutes"], secondary: [], pattern: "hinge", equipment: [], kind: "bodyweight", mechanics: "compound", skill: 2,
    fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Pochyl się na jednej nodze, druga noga idzie w tył w linii z tułowiem.", cueEn: "Tip forward on one leg; the other leg travels back in line with your torso.",
  }),

  // ── Knee flexion / extension, hips, calves ────────────────────────────
  ex("leg_curl", {
    pl: "Uginanie nóg na maszynie", en: "Machine leg curl", de: "Beinbeuger an der Maschine", aliases: ["leg curl", "uginanie nóg"],
    primary: ["hamstrings"], secondary: ["calves"], pattern: "knee_flex", equipment: ["leg_curl"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Biodra przyciśnięte, pełen zakres, powolny powrót.", cueEn: "Hips pinned, full range, slow return.",
  }),
  ex("sliding_leg_curl", {
    pl: "Uginanie nóg ślizgiem", en: "Sliding leg curl", de: "Beinbeuger mit Gleitpads",
    primary: ["hamstrings"], secondary: ["glutes"], pattern: "knee_flex", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 2,
    fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Leżąc na plecach, pięty na ręczniku na gładkiej podłodze; unieś biodra i przyciągaj pięty.", cueEn: "Lying on your back, heels on a towel on a smooth floor; lift hips and pull the heels in.",
  }),
  ex("nordic_curl", {
    pl: "Nordic curl", en: "Nordic curl", de: "Nordic Curl",
    primary: ["hamstrings"], secondary: [], pattern: "knee_flex", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 3,
    fatigue: "moderate", stable: false, loading: "bodyweight",
    cuePl: "Zablokuj pięty, opadaj do przodu jak najwolniej.", cueEn: "Anchor your heels and lower yourself as slowly as you can.",
    safetyPl: "Bardzo wymagające; zacznij od krótkiego zakresu.", safetyEn: "Very demanding; start with a partial range.",
  }),
  ex("leg_extension", {
    pl: "Prostowanie nóg na maszynie", en: "Leg extension", de: "Beinstrecker", aliases: ["leg extension", "prostowanie nóg"],
    primary: ["quads"], secondary: [], pattern: "knee_ext", equipment: ["leg_extension"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Kolana w osi maszyny, krótka pauza na górze.", cueEn: "Knees aligned with the pivot, brief pause at the top.",
  }),
  ex("hip_thrust_bb", {
    pl: "Hip thrust ze sztangą", en: "Barbell hip thrust", de: "Hip Thrust mit Langhantel", aliases: ["hip thrust"],
    primary: ["glutes"], secondary: ["hamstrings"], pattern: "hip_ext", equipment: ["barbell", "bench"], kind: "barbell", mechanics: "compound",
    skill: 2, fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Łopatki na ławce, broda lekko przy klatce, wyprost bioder bez przeprostu lędźwi.", cueEn: "Shoulder blades on the bench, chin tucked, extend the hips without arching.",
  }),
  ex("hip_thrust_db", {
    pl: "Hip thrust z hantlem", en: "Dumbbell hip thrust", de: "Hip Thrust mit Kurzhantel", aliases: ["hip thrust z hantlą", "hip thrust hantel", "dumbbell hip thrust", "db hip thrust"],
    primary: ["glutes"], secondary: ["hamstrings"], pattern: "hip_ext", equipment: [...DB, "bench"], kind: "dumbbell", mechanics: "compound",
    skill: 1, fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Łopatki na ławce, hantel trzymany oburącz na biodrach, wyprost bioder bez przeprostu lędźwi.", cueEn: "Shoulder blades on the bench, hold the dumbbell on the hips with both hands, extend the hips without arching.",
  }),
  ex("hip_thrust_machine", {
    pl: "Hip thrust na maszynie", en: "Machine hip thrust", de: "Hip Thrust an der Maschine", aliases: ["hip thrust maszyna", "hip thrust na maszynie", "glute drive", "machine hip thrust"],
    primary: ["glutes"], secondary: ["hamstrings"], pattern: "hip_ext", equipment: ["glute_machines"], kind: "machine", machineType: "plate_loaded",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Pas na biodrach, broda lekko przy klatce, pauza na górze z napiętymi pośladkami.", cueEn: "Pad on the hips, chin tucked, pause at the top squeezing the glutes.",
  }),
  ex("hip_abduction_machine", {
    pl: "Odwodzenie nóg na maszynie", en: "Hip abduction machine", de: "Abduktorenmaschine", aliases: ["odwodzenie nóg", "odwodzenie", "abduktory", "abduction", "abduktoren"],
    primary: ["glutes"], secondary: [], pattern: "hip_ext", equipment: ["glute_machines"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true, accessoryOnly: true,
    cuePl: "Plecy przy oparciu, rozsuwaj nogi spokojnie, bez odbijania.", cueEn: "Back against the pad, push the knees apart smoothly, no bouncing.",
  }),
  ex("hip_adduction_machine", {
    pl: "Przywodzenie nóg na maszynie", en: "Hip adduction machine", de: "Adduktorenmaschine", aliases: ["przywodzenie nóg", "przywodzenie", "przywodziciele", "adduction", "adduktoren"],
    primary: ["adductors"], secondary: [], pattern: "hip_ext", equipment: ["glute_machines"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true, accessoryOnly: true,
    cuePl: "Ściągaj nogi do środka kontrolowanie, nie puszczaj ciężaru w rozciągnięciu.", cueEn: "Bring the legs together under control; don't let the weight drop in the stretch.",
  }),
  ex("glute_bridge", {
    pl: "Most biodrowy", en: "Glute bridge", de: "Glute Bridge",
    primary: ["glutes"], secondary: ["hamstrings"], pattern: "hip_ext", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Leżąc, unieś biodra napinając pośladki; wersja jednonóż jest trudniejsza.", cueEn: "Lying down, lift the hips by squeezing the glutes; single-leg is harder.",
  }),
  ex("cable_kickback", {
    unilateral: true,
    pl: "Odwodzenie nogi w tył na wyciągu", en: "Cable glute kickback", de: "Kickback am Kabelzug",
    primary: ["glutes"], secondary: [], pattern: "hip_ext", equipment: ["cable"], kind: "cable", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total",
    cuePl: "Tułów stabilny, ruch tylko w biodrze.", cueEn: "Torso still, move only at the hip.",
  }),
  ex("calf_raise_machine", {
    pl: "Wspięcia na palce na maszynie", en: "Machine calf raise", de: "Wadenheben an der Maschine", aliases: ["calf raise", "łydki"],
    primary: ["calves"], secondary: [], pattern: "calf", equipment: ["calf_machine"], kind: "machine", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Pełne rozciągnięcie na dole, pauza na górze.", cueEn: "Full stretch at the bottom, pause at the top.",
  }),
  ex("calf_raise_leg_press", {
    pl: "Wspięcia na palce na suwnicy", en: "Leg press calf raise", de: "Wadendrücken an der Beinpresse",
    primary: ["calves"], secondary: [], pattern: "calf", equipment: ["leg_press"], kind: "machine", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Palce na krawędzi platformy, kolana proste, pełen zakres.", cueEn: "Balls of the feet on the platform edge, knees straight, full range.",
  }),
  ex("calf_raise_db", {
    unilateral: true,
    pl: "Wspięcia na palce z hantlą", en: "Dumbbell calf raise", de: "Wadenheben mit Kurzhantel",
    primary: ["calves"], secondary: [], pattern: "calf", equipment: [...DB], kind: "dumbbell", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Na stopniu, jedna noga, trzymaj się dla równowagi.", cueEn: "On a step, one leg, hold on for balance.",
  }),
  ex("calf_raise_bw", {
    pl: "Wspięcia na palce", en: "Bodyweight calf raise", de: "Wadenheben ohne Gewicht",
    primary: ["calves"], secondary: [], pattern: "calf", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Na stopniu, najlepiej na jednej nodze, powoli w dół.", cueEn: "On a step, ideally single-leg, slow on the way down.",
  }),

  // ── Horizontal push ───────────────────────────────────────────────────
  ex("bench_press_bb", {
    pl: "Wyciskanie sztangi na ławce płaskiej", en: "Barbell bench press", de: "Bankdrücken mit Langhantel", aliases: ["bench press", "wyciskanie leżąc", "bankdrücken"],
    primary: ["chest"], secondary: ["triceps", "front_delts"], pattern: "h_push", equipment: ["barbell", "bench", "rack"], kind: "barbell",
    mechanics: "compound", skill: 2, fatigue: "high", stable: false, loading: "total",
    cuePl: "Łopatki ściągnięte, stopy na podłodze, sztanga do dolnej części klatki.", cueEn: "Shoulder blades pulled back, feet planted, bar to the lower chest.",
    safetyPl: "Używaj zabezpieczeń lub asekuracji; nie dochodź do upadku bez asekuracji.", safetyEn: "Use safeties or a spotter; don't go to failure unprotected.",
  }),
  ex("db_bench_press", {
    pl: "Wyciskanie hantli na ławce płaskiej", en: "Dumbbell bench press", de: "Kurzhantel-Bankdrücken",
    primary: ["chest"], secondary: ["triceps", "front_delts"], pattern: "h_push", equipment: [...DB, "bench"], kind: "dumbbell",
    mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Hantle nad klatką, łokcie ok. 45° od tułowia.", cueEn: "Dumbbells over the chest, elbows about 45° from the torso.",
  }),
  ex("incline_db_press", {
    emphasis: "upper_chest",
    pl: "Wyciskanie hantli na ławce skośnej", en: "Incline dumbbell press", de: "Schrägbankdrücken mit Kurzhanteln", aliases: ["incline press"],
    primary: ["chest"], secondary: ["front_delts", "triceps"], pattern: "h_push", equipment: [...DB, "incline_bench"], kind: "dumbbell",
    mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Ławka 30–45°, opuszczaj do górnej części klatki.", cueEn: "Bench at 30–45°, lower to the upper chest.",
  }),
  ex("machine_chest_press", {
    pl: "Wyciskanie na maszynie (klatka)", en: "Machine chest press", de: "Brustpresse", aliases: ["chest press"],
    primary: ["chest"], secondary: ["triceps", "front_delts"], pattern: "h_push", equipment: ["chest_press"], kind: "machine",
    machineType: "selectorized", mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Uchwyty na wysokości środka klatki, plecy przy oparciu.", cueEn: "Handles at mid-chest height, back against the pad.",
  }),
  ex("push_up", {
    pl: "Pompki", en: "Push-up", de: "Liegestütz", aliases: ["pushup", "pompka"],
    primary: ["chest"], secondary: ["triceps", "front_delts", "abs"], pattern: "h_push", equipment: [], kind: "bodyweight",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight_plus",
    cuePl: "Ciało w jednej linii, klatka prawie dotyka podłogi.", cueEn: "Body in one line, chest nearly touches the floor.",
  }),
  ex("incline_push_up", {
    pl: "Pompki na podwyższeniu", en: "Incline push-up", de: "Erhöhte Liegestütze",
    primary: ["chest"], secondary: ["triceps", "front_delts"], pattern: "h_push", equipment: [], kind: "bodyweight", mechanics: "compound",
    skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Dłonie na stole lub ławce — łatwiejsza wersja pompek.", cueEn: "Hands on a table or bench — an easier push-up.",
  }),
  ex("dip", {
    pl: "Pompki na poręczach (dipy)", en: "Parallel bar dip", de: "Dips am Barren", aliases: ["dips", "dipy"],
    primary: ["chest", "triceps"], secondary: ["front_delts"], pattern: "h_push", equipment: ["dip_bars"], kind: "bodyweight",
    mechanics: "compound", skill: 2, fatigue: "moderate", stable: true, loading: "bodyweight_plus",
    cuePl: "Lekko pochyl się do przodu, schodź do komfortowej głębokości.", cueEn: "Lean slightly forward, lower to a comfortable depth.",
    safetyPl: "Jeśli bark protestuje, skróć zakres.", safetyEn: "If your shoulder complains, shorten the range.",
  }),

  // ── Chest isolation ───────────────────────────────────────────────────
  ex("pec_deck", {
    pl: "Rozpiętki na maszynie", en: "Pec deck fly", de: "Butterfly-Maschine", aliases: ["butterfly", "pec deck"],
    primary: ["chest"], secondary: ["front_delts"], pattern: "chest_fly", equipment: ["pec_deck"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Łokcie lekko ugięte, prowadź ręce łukiem.", cueEn: "Slight elbow bend, move the arms in an arc.",
  }),
  ex("cable_fly", {
    pl: "Rozpiętki na wyciągu", en: "Cable fly", de: "Kabelzug-Fliegende",
    primary: ["chest"], secondary: ["front_delts"], pattern: "chest_fly", equipment: ["cable"], kind: "cable", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Krok do przodu, ręce spotykają się przed klatką.", cueEn: "Step forward, hands meet in front of the chest.",
  }),
  ex("db_fly", {
    pl: "Rozpiętki z hantlami", en: "Dumbbell fly", de: "Kurzhantel-Fliegende",
    primary: ["chest"], secondary: ["front_delts"], pattern: "chest_fly", equipment: [...DB, "bench"], kind: "dumbbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell",
    cuePl: "Opuszczaj do komfortowego rozciągnięcia, łokcie miękkie.", cueEn: "Lower to a comfortable stretch, elbows soft.",
  }),

  // ── Vertical push ─────────────────────────────────────────────────────
  ex("overhead_press_bb", {
    pl: "Wyciskanie sztangi nad głowę", en: "Barbell overhead press", de: "Schulterdrücken mit Langhantel", aliases: ["ohp", "military press"],
    primary: ["front_delts"], secondary: ["triceps", "side_delts", "abs"], pattern: "v_push", equipment: ["barbell", "rack"], kind: "barbell",
    mechanics: "compound", skill: 3, fatigue: "high", stable: false, loading: "total",
    cuePl: "Napnij pośladki i brzuch, sztanga prosto nad środek stopy.", cueEn: "Squeeze glutes and abs, press the bar straight over mid-foot.",
  }),
  ex("db_shoulder_press", {
    pl: "Wyciskanie hantli nad głowę", en: "Dumbbell shoulder press", de: "Kurzhantel-Schulterdrücken", aliases: ["shoulder press"],
    primary: ["front_delts"], secondary: ["triceps", "side_delts"], pattern: "v_push", equipment: [], equipmentAnyOf: [...DB, "kettlebell"],
    kind: "dumbbell", mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "per_dumbbell",
    cuePl: "Siedząc lub stojąc, hantle od wysokości uszu w górę.", cueEn: "Seated or standing, press from ear height upward.",
  }),
  ex("machine_shoulder_press", {
    pl: "Wyciskanie na maszynie (barki)", en: "Machine shoulder press", de: "Schulterpresse",
    primary: ["front_delts"], secondary: ["triceps", "side_delts"], pattern: "v_push", equipment: ["shoulder_press_machine"], kind: "machine",
    machineType: "selectorized", mechanics: "compound", skill: 1, fatigue: "moderate", stable: true, loading: "total",
    cuePl: "Uchwyty na wysokości barków, plecy przy oparciu.", cueEn: "Handles at shoulder height, back on the pad.",
  }),
  ex("handstand_push_up", {
    pl: "Pompki w staniu na rękach (HSPU)", en: "Handstand push-up", de: "Handstand-Liegestütz", aliases: ["hspu", "handstand"],
    primary: ["front_delts"], secondary: ["triceps", "side_delts"], pattern: "v_push", equipment: [], kind: "bodyweight", mechanics: "compound",
    skill: 3, fatigue: "moderate", stable: false, loading: "bodyweight",
    cuePl: "Przy ścianie, ciało napięte; opuść głowę kontrolowanie przed dłonie i wypchnij się w górę.", cueEn: "Against a wall, body tight; lower the head under control in front of the hands and press back up.",
  }),
  ex("pike_push_up", {
    pl: "Pompki w pozycji pike", en: "Pike push-up", de: "Pike Push-up",
    primary: ["front_delts"], secondary: ["triceps", "side_delts"], pattern: "v_push", equipment: [], kind: "bodyweight", mechanics: "compound",
    skill: 2, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Biodra wysoko, głowa zmierza przed dłonie.", cueEn: "Hips high, head travels in front of the hands.",
  }),

  // ── Horizontal pull ───────────────────────────────────────────────────
  ex("barbell_row", {
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie sztangą w opadzie", en: "Barbell row", de: "Langhantelrudern", aliases: ["bent over row"],
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps", "lower_back"], pattern: "h_pull", equipment: ["barbell"], kind: "barbell",
    mechanics: "compound", skill: 2, fatigue: "high", stable: false, loading: "total",
    cuePl: "Tułów pochylony, plecy neutralne, przyciągaj do brzucha.", cueEn: "Torso hinged, neutral back, pull to the stomach.",
  }),
  ex("one_arm_db_row", {
    unilateral: true,
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie hantlą jednorącz", en: "One-arm dumbbell row", de: "Einarmiges Kurzhantelrudern", aliases: ["db row"],
    primary: ["lats", "upper_back"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: [], equipmentAnyOf: [...DB, "kettlebell"],
    kind: "dumbbell", mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell",
    cuePl: "Ręka i kolano na ławce lub krześle, łokieć prowadź w kierunku biodra.", cueEn: "Hand and knee on a bench or chair; drive the elbow toward the hip.",
  }),
  ex("chest_supported_db_row", {
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie hantlami w podporze klatką", en: "Chest-supported dumbbell row", de: "Brustgestütztes Kurzhantelrudern",
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: [...DB, "incline_bench"], kind: "dumbbell",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell",
    cuePl: "Klatka na skośnej ławce, ściągaj łopatki.", cueEn: "Chest on an incline bench, squeeze the shoulder blades.",
  }),
  ex("seated_cable_row", {
    grips: ["narrow", "wide"],
    pl: "Przyciąganie linki siedząc", en: "Seated cable row", de: "Rudern am Kabelzug sitzend", aliases: ["cable row", "wiosłowanie siedząc na wyciągu", "wiosłowanie na wyciągu", "wiosłowanie siedząc"],
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: ["cable"], kind: "cable",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Tułów stabilny, przyciągaj do brzucha, pełne wyprostowanie ramion.", cueEn: "Torso steady, pull to the stomach, full reach forward.",
  }),
  ex("machine_row", {
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie na maszynie", en: "Machine row", de: "Rudermaschine",
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: ["row_machine"], kind: "machine",
    machineType: "plate_loaded", mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Klatka na podporze, łokcie w tył.", cueEn: "Chest on the pad, elbows back.",
  }),
  ex("inverted_row", {
    grips: ["narrow", "wide"],
    pl: "Podciąganie australijskie", en: "Inverted row", de: "Australian Pull-up", aliases: ["australian pull up"],
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: [], equipmentAnyOf: ["rings", "rack", "low_bar"],
    kind: "bodyweight", mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Ciało proste pod drążkiem, przyciągaj klatkę do drążka. Im bardziej poziomo, tym trudniej.", cueEn: "Body straight under the bar, pull your chest to it. More horizontal = harder.",
  }),
  ex("table_row", {
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie pod stołem", en: "Table row", de: "Tischrudern", aliases: ["table row"],
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: [], kind: "bodyweight",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Połóż się pod stabilnym stołem, chwyć krawędź i przyciągaj klatkę do blatu, ciało proste.", cueEn: "Lie under a sturdy table, grip the edge and pull your chest to it, body straight.",
    safetyPl: "Tylko pod ciężkim, stabilnym stołem — najpierw sprawdź, czy się nie przechyla.", safetyEn: "Only under a heavy, stable table — check first that it can't tip.",
  }),
  ex("band_row", {
    grips: ["narrow", "wide"],
    pl: "Wiosłowanie z gumą", en: "Band row", de: "Rudern mit Band",
    primary: ["upper_back", "lats"], secondary: ["rear_delts", "biceps"], pattern: "h_pull", equipment: ["bands"], kind: "band",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Guma zaczepiona na wysokości klatki, łokcie w tył.", cueEn: "Band anchored at chest height, elbows back.",
  }),

  // ── Vertical pull ─────────────────────────────────────────────────────
  ex("pull_up", {
    grips: ["wide", "narrow"],
    pl: "Podciąganie nachwytem", en: "Pull-up", de: "Klimmzug", aliases: ["pullup", "podciąganie", "klimmzüge"],
    primary: ["lats"], secondary: ["biceps", "upper_back", "forearms"], pattern: "v_pull", equipment: ["pullup_bar"], kind: "bodyweight",
    mechanics: "compound", skill: 3, fatigue: "moderate", stable: true, loading: "bodyweight_plus",
    cuePl: "Zacznij z wyprostowanych rąk, ciągnij łokcie w dół do żeber.", cueEn: "Start from straight arms, drive the elbows down to your ribs.",
  }),
  ex("chin_up", {
    pl: "Podciąganie podchwytem", en: "Chin-up", de: "Klimmzug im Untergriff", aliases: ["chinup"],
    primary: ["lats", "biceps"], secondary: ["upper_back", "forearms"], pattern: "v_pull", equipment: ["pullup_bar"], kind: "bodyweight",
    mechanics: "compound", skill: 3, fatigue: "moderate", stable: true, loading: "bodyweight_plus",
    cuePl: "Dłonie do siebie, broda nad drążek bez szarpania.", cueEn: "Palms facing you, chin over the bar without kipping.",
  }),
  ex("negative_pull_up", {
    pl: "Podciąganie negatywne", en: "Negative pull-up", de: "Negative Klimmzüge",
    primary: ["lats"], secondary: ["biceps", "upper_back", "forearms"], pattern: "v_pull", equipment: ["pullup_bar"], kind: "bodyweight",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Wskocz do góry i opuszczaj się 3–5 sekund.", cueEn: "Jump to the top and lower yourself over 3–5 seconds.",
  }),
  ex("band_assisted_pull_up", {
    pl: "Podciąganie z gumą", en: "Band-assisted pull-up", de: "Klimmzug mit Band",
    primary: ["lats"], secondary: ["biceps", "upper_back"], pattern: "v_pull", equipment: ["pullup_bar", "bands"], kind: "bodyweight",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Guma pod kolanem lub stopą pomaga na dole ruchu.", cueEn: "A band under the knee or foot helps at the bottom.",
  }),
  ex("lat_pulldown", {
    grips: ["wide", "narrow", "neutral"],
    pl: "Ściąganie drążka wyciągu górnego", en: "Lat pulldown", de: "Latzug", aliases: ["pulldown", "ściąganie drążka"],
    primary: ["lats"], secondary: ["biceps", "upper_back"], pattern: "v_pull", equipment: ["cable"], kind: "cable", mechanics: "compound",
    skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Drążek do górnej części klatki, łokcie w dół i lekko w tył.", cueEn: "Bar to the upper chest, elbows down and slightly back.",
  }),
  ex("assisted_pull_up_machine", {
    grips: ["wide", "narrow", "neutral"],
    pl: "Podciąganie na maszynie z odciążeniem", en: "Assisted pull-up machine", de: "Klimmzugmaschine mit Unterstützung",
    primary: ["lats"], secondary: ["biceps", "upper_back"], pattern: "v_pull", equipment: ["assisted_pullup"], kind: "machine",
    mechanics: "compound", skill: 1, fatigue: "low", stable: true, loading: "assisted",
    cuePl: "Więcej kilogramów odciążenia = łatwiej. Postęp to zmniejszanie odciążenia.", cueEn: "More assistance = easier. Progress by reducing the assistance.",
  }),
  ex("band_pulldown", {
    pl: "Ściąganie gumy z góry", en: "Band lat pulldown", de: "Latzug mit Band",
    primary: ["lats"], secondary: ["biceps"], pattern: "v_pull", equipment: ["bands"], kind: "band", mechanics: "compound", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Guma zaczepiona wysoko, ciągnij łokcie do żeber.", cueEn: "Band anchored high, pull elbows to your ribs.",
  }),

  // ── Shoulders ─────────────────────────────────────────────────────────
  ex("db_lateral_raise", {
    pl: "Unoszenie hantli bokiem", en: "Dumbbell lateral raise", de: "Seitheben mit Kurzhanteln", aliases: ["lateral raise", "wznosy bokiem"],
    primary: ["side_delts"], secondary: [], pattern: "lateral_raise", equipment: [...DB], kind: "dumbbell", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Unoś bokiem do wysokości barków, bez bujania.", cueEn: "Raise out to the side to shoulder height, no swinging.",
  }),
  ex("cable_lateral_raise", {
    unilateral: true,
    pl: "Unoszenie ramienia bokiem na wyciągu", en: "Cable lateral raise", de: "Seitheben am Kabelzug",
    primary: ["side_delts"], secondary: [], pattern: "lateral_raise", equipment: ["cable"], kind: "cable", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Linka z dołu, ruch płynny w obu kierunkach.", cueEn: "Cable from low, smooth in both directions.",
  }),
  ex("band_lateral_raise", {
    pl: "Unoszenie bokiem z gumą", en: "Band lateral raise", de: "Seitheben mit Band",
    primary: ["side_delts"], secondary: [], pattern: "lateral_raise", equipment: ["bands"], kind: "band", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Stań na gumie, unoś ramiona bokiem.", cueEn: "Stand on the band, raise the arms out to the side.",
  }),
  ex("reverse_pec_deck", {
    pl: "Odwrotne rozpiętki na maszynie", en: "Reverse pec deck", de: "Reverse Butterfly",
    primary: ["rear_delts"], secondary: ["upper_back"], pattern: "rear_delt", equipment: ["pec_deck"], kind: "machine", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Przodem do oparcia, prowadź ręce szeroko w tył.", cueEn: "Face the pad, sweep the arms wide and back.",
  }),
  ex("face_pull", {
    pl: "Face pull na wyciągu", en: "Cable face pull", de: "Face Pull",
    primary: ["rear_delts"], secondary: ["upper_back"], pattern: "rear_delt", equipment: ["cable"], kind: "cable", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Lina na wysokości twarzy, ciągnij do czoła rozchylając ręce.", cueEn: "Rope at face height, pull toward the forehead while spreading the hands.",
  }),
  ex("db_rear_delt_fly", {
    pl: "Odwrotne rozpiętki z hantlami", en: "Dumbbell rear delt fly", de: "Reverse Fliegende mit Kurzhanteln",
    primary: ["rear_delts"], secondary: ["upper_back"], pattern: "rear_delt", equipment: [...DB], kind: "dumbbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "W opadzie tułowia unoś hantle szeroko na boki.", cueEn: "Hinged forward, raise the dumbbells wide.",
  }),
  ex("band_pull_apart", {
    pl: "Rozciąganie gumy przed sobą", en: "Band pull-apart", de: "Band Pull-Apart",
    primary: ["rear_delts"], secondary: ["upper_back"], pattern: "rear_delt", equipment: ["bands"], kind: "band", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Ręce proste przed sobą, rozciągaj gumę do klatki.", cueEn: "Arms straight in front, pull the band apart to your chest.",
  }),
  ex("prone_y_raise", {
    pl: "Unoszenie ramion w leżeniu (Y)", en: "Prone Y raise", de: "Y-Heben in Bauchlage",
    primary: ["rear_delts"], secondary: ["upper_back"], pattern: "rear_delt", equipment: [], kind: "bodyweight", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Leżąc na brzuchu, unoś ramiona w kształt litery Y.", cueEn: "Lying face down, lift the arms into a Y shape.",
  }),

  // ── Arms ──────────────────────────────────────────────────────────────
  ex("db_curl", {
    pl: "Uginanie ramion z hantlami", en: "Dumbbell curl", de: "Kurzhantel-Curls", aliases: ["biceps curl", "uginanie"],
    primary: ["biceps"], secondary: ["forearms"], pattern: "elbow_flex", equipment: [...DB], kind: "dumbbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Łokcie przy tułowiu, pełny zakres.", cueEn: "Elbows by your sides, full range.",
  }),
  ex("incline_db_curl", {
    pl: "Uginanie ramion na ławce skośnej", en: "Incline dumbbell curl", de: "Schrägbank-Curls",
    primary: ["biceps"], secondary: [], pattern: "elbow_flex", equipment: [...DB, "incline_bench"], kind: "dumbbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Ręce zwisają za tułowiem, uginaj bez ruszania barkami.", cueEn: "Arms hang behind the torso; curl without moving the shoulders.",
  }),
  ex("hammer_curl", {
    pl: "Uginanie młotkowe", en: "Hammer curl", de: "Hammer Curls",
    primary: ["biceps", "forearms"], secondary: [], pattern: "elbow_flex", equipment: [], equipmentAnyOf: [...DB, "kettlebell"], kind: "dumbbell",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Chwyt neutralny, kciuki w górę.", cueEn: "Neutral grip, thumbs up.",
  }),
  ex("barbell_curl", {
    pl: "Uginanie ramion ze sztangą", en: "Barbell curl", de: "Langhantel-Curls",
    primary: ["biceps"], secondary: ["forearms"], pattern: "elbow_flex", equipment: ["barbell"], kind: "barbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Bez bujania tułowiem, łokcie nieruchomo.", cueEn: "No torso swing, elbows still.",
  }),
  ex("cable_curl", {
    pl: "Uginanie ramion na wyciągu", en: "Cable curl", de: "Kabelzug-Curls",
    primary: ["biceps"], secondary: ["forearms"], pattern: "elbow_flex", equipment: ["cable"], kind: "cable", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Stałe napięcie, powolny powrót.", cueEn: "Constant tension, slow return.",
  }),
  ex("band_curl", {
    pl: "Uginanie ramion z gumą", en: "Band curl", de: "Curls mit Band",
    primary: ["biceps"], secondary: [], pattern: "elbow_flex", equipment: ["bands"], kind: "band", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Stań na gumie, łokcie przy tułowiu.", cueEn: "Stand on the band, elbows at your sides.",
  }),
  ex("cable_pushdown", {
    pl: "Prostowanie ramion na wyciągu", en: "Cable triceps pushdown", de: "Trizepsdrücken am Kabel", aliases: ["pushdown", "triceps pushdown"],
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: ["cable"], kind: "cable", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Łokcie przy tułowiu, pełny wyprost.", cueEn: "Elbows at your sides, lock out fully.",
  }),
  ex("overhead_cable_extension", {
    pl: "Prostowanie ramion nad głową na wyciągu", en: "Overhead cable triceps extension", de: "Überkopf-Trizepsstrecken am Kabel",
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: ["cable"], kind: "cable", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "total", smallMuscle: true,
    cuePl: "Tyłem do wyciągu, łokcie przy głowie, prostuj w przód.", cueEn: "Back to the cable, elbows by the head, extend forward.",
  }),
  ex("db_triceps_kickback", {
    pl: "Wyprosty ramion z hantlą w opadzie (kickback)", en: "Dumbbell triceps kickback", de: "Kurzhantel-Kickback (Trizeps)", aliases: ["kickback", "kickbacki"],
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: [...DB], kind: "dumbbell", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: false, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Tułów pochylony, biodra w tył, łokieć przy ciele; prostuj rękę do tyłu, ramię nieruchomo.", cueEn: "Torso bent, hips back, elbow tucked; straighten the arm backwards, upper arm still.",
  }),
  ex("db_overhead_extension", {
    pl: "Prostowanie ramion z hantlą nad głową", en: "Dumbbell overhead triceps extension", de: "Kurzhantel-Trizepsstrecken über Kopf",
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: [...DB], kind: "dumbbell", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Hantla za głową trzymana oburącz, łokcie skierowane w górę.", cueEn: "One dumbbell behind the head in both hands, elbows pointing up.",
  }),
  ex("lying_db_triceps_extension", {
    pl: "Francuskie wyciskanie hantli leżąc", en: "Lying dumbbell triceps extension", de: "Liegendes Trizepsstrecken mit Kurzhanteln",
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: [...DB, "bench"], kind: "dumbbell", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "per_dumbbell", smallMuscle: true,
    cuePl: "Ramiona pionowo, ruch tylko w łokciach.", cueEn: "Upper arms vertical, move only at the elbows.",
  }),
  ex("close_grip_push_up", {
    pl: "Pompki wąskie", en: "Close-grip push-up", de: "Enge Liegestütze", aliases: ["diamond push up"],
    primary: ["triceps"], secondary: ["chest", "front_delts"], pattern: "elbow_ext", equipment: [], kind: "bodyweight", mechanics: "compound",
    skill: 1, fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Dłonie pod barkami, łokcie blisko tułowia.", cueEn: "Hands under the shoulders, elbows close to the body.",
  }),
  ex("band_pushdown", {
    pl: "Prostowanie ramion z gumą", en: "Band triceps pushdown", de: "Trizepsdrücken mit Band",
    primary: ["triceps"], secondary: [], pattern: "elbow_ext", equipment: ["bands"], kind: "band", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "bodyweight", smallMuscle: true,
    cuePl: "Guma zaczepiona wysoko, łokcie nieruchomo.", cueEn: "Band anchored high, elbows still.",
  }),

  // ── Core ──────────────────────────────────────────────────────────────
  ex("plank", {
    pl: "Deska (plank)", en: "Plank", de: "Unterarmstütz", aliases: ["deska"],
    primary: ["abs"], secondary: [], pattern: "core", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 1,
    fatigue: "low", stable: true, loading: "time",
    cuePl: "Ciało w linii, napnij brzuch i pośladki.", cueEn: "Body in line, brace abs and glutes.",
  }),
  ex("dead_bug", {
    pl: "Dead bug", en: "Dead bug", de: "Dead Bug",
    primary: ["abs"], secondary: [], pattern: "core", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 1, fatigue: "low",
    stable: true, loading: "bodyweight",
    cuePl: "Lędźwie przy podłodze, prostuj przeciwną rękę i nogę.", cueEn: "Lower back on the floor, extend opposite arm and leg.",
  }),
  ex("hanging_knee_raise", {
    pl: "Unoszenie kolan w zwisie", en: "Hanging knee raise", de: "Knieheben im Hang",
    primary: ["abs"], secondary: ["forearms"], pattern: "core", equipment: ["pullup_bar"], kind: "bodyweight", mechanics: "isolation", skill: 2,
    fatigue: "low", stable: true, loading: "bodyweight",
    cuePl: "Bez bujania, podwijaj miednicę na górze.", cueEn: "No swinging, curl the pelvis at the top.",
  }),
  ex("cable_crunch", {
    pl: "Spięcia brzucha na wyciągu", en: "Cable crunch", de: "Kabel-Crunch", aliases: ["brzuszki na wyciągu", "allahy", "kabelcrunch"],
    primary: ["abs"], secondary: [], pattern: "core", equipment: ["cable"], kind: "cable", mechanics: "isolation", skill: 1, fatigue: "low",
    stable: true, loading: "total",
    cuePl: "Klęcząc, zwijaj tułów, biodra nieruchomo.", cueEn: "Kneeling, curl the torso, hips still.",
  }),
  ex("machine_crunch", {
    pl: "Brzuszki na maszynie", en: "Machine crunch", de: "Crunch an der Maschine",
    aliases: ["maszyna do brzuszków", "spięcia brzucha na maszynie", "ab crunch machine", "ab machine", "bauchmaschine", "crunch maschine", "brzuch maszyna"],
    primary: ["abs"], secondary: [], pattern: "core", equipment: ["ab_machine"], kind: "machine", machineType: "selectorized",
    mechanics: "isolation", skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Zwijaj tułów brzuchem, nie ciągnij rękami; wolno w górę.", cueEn: "Curl the torso with the abs, don't pull with the arms; slow on the way up.",
  }),
  ex("crunch", {
    pl: "Brzuszki", en: "Crunch", de: "Crunches", aliases: ["spięcia brzucha", "brzuszki na macie", "crunches", "sit up", "bauchpresse"],
    primary: ["abs"], secondary: [], pattern: "core", equipment: [], kind: "bodyweight", mechanics: "isolation", skill: 1, fatigue: "low",
    stable: true, loading: "bodyweight_plus",
    cuePl: "Lędźwie przy podłodze, unoś łopatki zwijając tułów, broda lekko przy klatce.", cueEn: "Lower back on the floor, curl the shoulder blades up, chin slightly tucked.",
  }),
  ex("pallof_press", {
    pl: "Pallof press", en: "Pallof press", de: "Pallof Press",
    primary: ["abs"], secondary: [], pattern: "core", equipment: [], equipmentAnyOf: ["cable", "bands"], kind: "cable", mechanics: "isolation",
    skill: 1, fatigue: "low", stable: true, loading: "total",
    cuePl: "Bokiem do wyciągu lub gumy, wypychaj ręce przed siebie bez rotacji.", cueEn: "Side-on to the cable or band, press out without rotating.",
  }),

  // ── Conditioning ──────────────────────────────────────────────────────
  ex("bike_intervals", {
    pl: "Interwały na rowerku/ergometrze", en: "Bike or rower intervals", de: "Intervalle auf Rad/Ruderergometer",
    primary: [], secondary: ["quads"], pattern: "conditioning", equipment: ["cardio_machine"], kind: "cardio", mechanics: "compound", skill: 1,
    fatigue: "moderate", stable: true, loading: "time",
    cuePl: "Np. 30–60 s mocniej, 60–90 s spokojnie, powtórz.", cueEn: "E.g. 30–60 s harder, 60–90 s easy, repeat.",
  }),
  ex("circuit_bw", {
    pl: "Obwód z masą ciała", en: "Bodyweight circuit", de: "Zirkel mit Körpergewicht",
    primary: [], secondary: ["quads"], pattern: "conditioning", equipment: [], kind: "cardio", mechanics: "compound", skill: 1,
    fatigue: "moderate", stable: true, loading: "time",
    cuePl: "Np. przysiady, pompki, pajacyki — w kółko w umiarkowanym tempie.", cueEn: "E.g. squats, push-ups, jumping jacks — cycle at a steady pace.",
  }),
  ex("jump_rope", {
    pl: "Skakanka", en: "Jump rope", de: "Seilspringen",
    primary: [], secondary: ["calves"], pattern: "conditioning", equipment: ["jump_rope"], kind: "cardio", mechanics: "compound", skill: 1,
    fatigue: "low", stable: true, loading: "time",
    cuePl: "Lekkie, niskie podskoki, rytmicznie.", cueEn: "Light, low, rhythmic hops.",
  }),
];

export const EXERCISE_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
