import type { Locale } from "@/i18n";
import type { Nutrients } from "./calc";

// Basic foods without a barcode (eggs, flour, rice, oil, vegetables…), so search and the assistant always find
// them. Values per 100 g (or 100 ml for milk) from USDA FoodData Central (typical values); carbohydrates are
// given as on EU labels, i.e. without fibre. Packaged products still come from Open Food Facts or a scan.

type Row = {
  key: string;
  names: Record<Locale, string>;
  /** Other words people type, in any language and form ("jajka", "Eier"). */
  aliases: string;
  basis?: "g" | "ml";
  state?: "raw" | "cooked";
  /** kcal, protein, carbs (without fibre), fat, fibre */
  n: [number, number, number, number, number];
  servings?: [ServingKey, number][];
};

type ServingKey = keyof typeof SERVING;
const SERVING = {
  egg: { pl: "1 sztuka (M)", en: "1 piece (M)", de: "1 Stück (M)" },
  tbsp: { pl: "1 łyżka", en: "1 tablespoon", de: "1 Esslöffel" },
  tsp: { pl: "1 łyżeczka", en: "1 teaspoon", de: "1 Teelöffel" },
  spray: { pl: "1 psiknięcie", en: "1 spray", de: "1 Sprühstoß" },
  glass: { pl: "1 szklanka", en: "1 glass", de: "1 Glas" },
  slice: { pl: "1 kromka", en: "1 slice", de: "1 Scheibe" },
  bag: { pl: "1 woreczek", en: "1 bag", de: "1 Beutel" },
  piece: { pl: "1 sztuka (średnia)", en: "1 piece (medium)", de: "1 Stück (mittel)" },
  handful: { pl: "1 garść", en: "1 handful", de: "1 Handvoll" },
  can: { pl: "1 puszka (odsączona)", en: "1 can (drained)", de: "1 Dose (abgetropft)" },
  white: { pl: "1 sztuka", en: "1 piece", de: "1 Stück" },
  cube: { pl: "1 kostka", en: "1 square", de: "1 Stückchen" },
  cup: { pl: "1 kubeczek", en: "1 pot", de: "1 Becher" },
  fillet: { pl: "1 filet", en: "1 fillet", de: "1 Filet" },
} satisfies Record<string, Record<Locale, string>>;

const F: Row[] = [
  // Eggs and dairy
  { key: "egg", names: { pl: "Jajko kurze, surowe", en: "Egg, whole, raw", de: "Hühnerei, roh" }, aliases: "jajko jajka jaja jajo jajek ei eier egg eggs", n: [143, 12.6, 0.7, 9.5, 0], servings: [["egg", 50]] },
  { key: "egg_boiled", names: { pl: "Jajko gotowane", en: "Egg, hard-boiled", de: "Ei, gekocht" }, aliases: "jajko jajka jaja gotowane na twardo ei eier gekocht egg boiled", state: "cooked", n: [155, 12.6, 1.1, 10.6, 0], servings: [["egg", 50]] },
  { key: "egg_white", names: { pl: "Białko jaja", en: "Egg white", de: "Eiweiß (Eiklar)" }, aliases: "bialko jaja bialka jaj eiklar eiweiss egg white", n: [52, 10.9, 0.7, 0.2, 0], servings: [["white", 33]] },
  { key: "milk_32", names: { pl: "Mleko 3,2%", en: "Milk, whole (3.2%)", de: "Vollmilch (3,5 %)" }, aliases: "mleko milch milk", basis: "ml", n: [61, 3.2, 4.8, 3.3, 0], servings: [["glass", 250]] },
  { key: "milk_2", names: { pl: "Mleko 2%", en: "Milk, 2%", de: "Milch, 2 %" }, aliases: "mleko milch milk", basis: "ml", n: [50, 3.3, 4.8, 2.0, 0], servings: [["glass", 250]] },
  { key: "milk_05", names: { pl: "Mleko 0,5%", en: "Skimmed milk", de: "Magermilch" }, aliases: "mleko chude odtluszczone milch milk skim", basis: "ml", n: [34, 3.4, 5.0, 0.1, 0], servings: [["glass", 250]] },
  { key: "yogurt", names: { pl: "Jogurt naturalny (ok. 1,5–2%)", en: "Plain yogurt, low fat", de: "Naturjoghurt (1,5 %)" }, aliases: "jogurt joghurt yogurt yoghurt naturalny natur", n: [63, 5.3, 7.0, 1.6, 0], servings: [["cup", 150]] },
  { key: "skyr", names: { pl: "Skyr naturalny", en: "Skyr, plain", de: "Skyr natur" }, aliases: "skyr", n: [63, 11.0, 4.0, 0.2, 0], servings: [["cup", 150]] },
  { key: "quark_half", names: { pl: "Twaróg półtłusty", en: "Quark, half-fat", de: "Quark, Halbfett" }, aliases: "twarog twarozek ser bialy quark topfen cottage", n: [133, 18.7, 3.7, 4.7, 0], servings: [["tbsp", 25]] },
  { key: "quark_lean", names: { pl: "Twaróg chudy", en: "Quark, low fat", de: "Magerquark" }, aliases: "twarog chudy ser bialy quark magerquark", n: [99, 19.8, 3.5, 0.5, 0], servings: [["tbsp", 25]] },
  { key: "gouda", names: { pl: "Ser żółty (gouda)", en: "Gouda cheese", de: "Gouda" }, aliases: "ser zolty gouda kase cheese", n: [356, 24.9, 2.2, 27.4, 0], servings: [["slice", 15]] },
  { key: "butter", names: { pl: "Masło", en: "Butter", de: "Butter" }, aliases: "maslo butter", n: [717, 0.9, 0.1, 81.1, 0], servings: [["tsp", 5]] },
  // Grains and starches
  { key: "flour", names: { pl: "Mąka pszenna (typ 450–650)", en: "Wheat flour, white", de: "Weizenmehl (Type 405–550)" }, aliases: "maka maki pszenna mehl weizenmehl flour", n: [364, 10.3, 73.6, 1.0, 2.7], servings: [["tbsp", 10], ["glass", 130]] },
  { key: "flour_wholewheat", names: { pl: "Mąka pełnoziarnista", en: "Wholewheat flour", de: "Vollkornmehl" }, aliases: "maka pelnoziarnista razowa mehl vollkorn flour wholewheat", n: [340, 13.2, 61.3, 2.5, 10.7], servings: [["tbsp", 10]] },
  { key: "oats", names: { pl: "Płatki owsiane", en: "Rolled oats", de: "Haferflocken" }, aliases: "platki owsiane owsianka haferflocken oats oatmeal", n: [379, 13.2, 57.6, 6.5, 10.1], servings: [["tbsp", 10]] },
  { key: "rice", names: { pl: "Ryż biały, suchy", en: "White rice, dry", de: "Reis, weiß, roh" }, aliases: "ryz ryzu bialy reis rice", n: [365, 7.1, 78.7, 0.7, 1.3], servings: [["bag", 100]] },
  { key: "rice_cooked", names: { pl: "Ryż biały, ugotowany", en: "White rice, cooked", de: "Reis, gekocht" }, aliases: "ryz ugotowany reis gekocht rice cooked", state: "cooked", n: [130, 2.7, 27.8, 0.3, 0.4] },
  { key: "rice_brown", names: { pl: "Ryż brązowy, suchy", en: "Brown rice, dry", de: "Naturreis, roh" }, aliases: "ryz brazowy naturreis brown rice", n: [367, 7.5, 72.6, 3.2, 3.6], servings: [["bag", 100]] },
  { key: "pasta", names: { pl: "Makaron pszenny, suchy", en: "Pasta, dry", de: "Nudeln, roh" }, aliases: "makaron nudeln pasta spaghetti penne", n: [371, 13.0, 71.5, 1.5, 3.2] },
  { key: "pasta_cooked", names: { pl: "Makaron, ugotowany", en: "Pasta, cooked", de: "Nudeln, gekocht" }, aliases: "makaron ugotowany nudeln gekocht pasta cooked", state: "cooked", n: [158, 5.8, 29.1, 0.9, 1.8] },
  { key: "bread", names: { pl: "Chleb pszenny", en: "White bread", de: "Weißbrot" }, aliases: "chleb pieczywo bulka tost brot weissbrot toast bread", n: [265, 9.0, 46.3, 3.2, 2.7], servings: [["slice", 35]] },
  { key: "bread_rye", names: { pl: "Chleb żytni", en: "Rye bread", de: "Roggenbrot" }, aliases: "chleb zytni razowy pieczywo roggenbrot brot rye bread", n: [259, 8.5, 42.5, 3.3, 5.8], servings: [["slice", 35]] },
  { key: "potato", names: { pl: "Ziemniaki, surowe", en: "Potatoes, raw", de: "Kartoffeln, roh" }, aliases: "ziemniak ziemniaki kartofle kartoffel kartoffeln potato potatoes", n: [77, 2.0, 15.3, 0.1, 2.2], servings: [["piece", 150]] },
  { key: "potato_boiled", names: { pl: "Ziemniaki gotowane", en: "Potatoes, boiled", de: "Kartoffeln, gekocht" }, aliases: "ziemniak ziemniaki gotowane kartoffeln gekocht salzkartoffeln potato boiled", state: "cooked", n: [87, 1.9, 18.3, 0.1, 1.8], servings: [["piece", 150]] },
  // USDA SR 11674: baked, flesh and skin, no salt or fat.
  { key: "potato_baked", names: { pl: "Ziemniaki pieczone (bez tłuszczu)", en: "Potatoes, baked", de: "Kartoffeln, gebacken" }, aliases: "ziemniak ziemniaki pieczone pieczony z piekarnika airfryer frytkownica ofenkartoffeln backkartoffel kartoffeln gebacken baked potato potatoes", state: "cooked", n: [93, 2.5, 21.2, 0.1, 2.2] },
  { key: "sweet_potato", names: { pl: "Batat, surowy", en: "Sweet potato, raw", de: "Süßkartoffel, roh" }, aliases: "batat bataty slodki ziemniak susskartoffel sweet potato", n: [86, 1.6, 17.1, 0.1, 3.0], servings: [["piece", 200]] },
  { key: "buckwheat", names: { pl: "Kasza gryczana, sucha", en: "Buckwheat groats, dry", de: "Buchweizen, roh" }, aliases: "kasza gryczana buchweizen buckwheat", n: [346, 11.7, 64.6, 2.7, 10.3], servings: [["bag", 100]] },
  { key: "buckwheat_cooked", names: { pl: "Kasza gryczana, ugotowana", en: "Buckwheat, cooked", de: "Buchweizen, gekocht" }, aliases: "kasza gryczana ugotowana buchweizen gekocht buckwheat cooked", state: "cooked", n: [92, 3.4, 17.2, 0.6, 2.7] },
  { key: "millet", names: { pl: "Kasza jaglana, sucha", en: "Millet, dry", de: "Hirse, roh" }, aliases: "kasza jaglana proso hirse millet", n: [378, 11.0, 64.3, 4.2, 8.5], servings: [["bag", 100]] },
  { key: "couscous", names: { pl: "Kuskus, suchy", en: "Couscous, dry", de: "Couscous, roh" }, aliases: "kuskus couscous", n: [376, 12.8, 72.4, 0.6, 5.0] },
  // Meat, fish, plant protein
  { key: "chicken_breast", names: { pl: "Pierś z kurczaka, surowa", en: "Chicken breast, raw", de: "Hähnchenbrust, roh" }, aliases: "piers z kurczaka kurczak filet drob hahnchenbrust haehnchen huhn chicken breast", n: [120, 22.5, 0, 2.6, 0], servings: [["fillet", 200]] },
  { key: "chicken_breast_cooked", names: { pl: "Pierś z kurczaka, pieczona", en: "Chicken breast, roasted", de: "Hähnchenbrust, gebraten" }, aliases: "piers z kurczaka pieczona smazona grillowana kurczak hahnchenbrust gebraten chicken breast cooked", state: "cooked", n: [165, 31.0, 0, 3.6, 0] },
  { key: "chicken_thigh", names: { pl: "Udko z kurczaka bez skóry, surowe", en: "Chicken thigh, skinless, raw", de: "Hähnchenschenkel ohne Haut, roh" }, aliases: "udko kurczak hahnchenschenkel chicken thigh", n: [119, 19.7, 0, 3.9, 0] },
  // USDA SR 05096: thigh, meat only, roasted.
  { key: "chicken_thigh_cooked", names: { pl: "Udko z kurczaka bez skóry, pieczone", en: "Chicken thigh, skinless, roasted", de: "Hähnchenschenkel ohne Haut, gebraten" }, aliases: "udko udka pieczone pieczony upieczone grillowane z piekarnika kurczak kurczaka bez skory skorki hahnchenschenkel gebraten chicken thigh roasted cooked", state: "cooked", n: [209, 26.0, 0, 10.9, 0] },
  { key: "chicken_drumstick_cooked", names: { pl: "Pałka z kurczaka bez skóry, pieczona", en: "Chicken drumstick, skinless, roasted", de: "Hähnchenunterschenkel ohne Haut, gebraten" }, aliases: "palka palki paleczka podudzie podudzia pieczona pieczone upieczona grillowana z piekarnika airfryer kurczak kurczaka bez skory skorki unterschenkel hahnchenunterschenkel keule gebraten chicken drumstick roasted cooked", state: "cooked", n: [172, 28.3, 0, 5.7, 0], servings: [["piece", 70]] },
  { key: "beef_10", names: { pl: "Wołowina mielona (10% tł.), surowa", en: "Ground beef 10% fat, raw", de: "Rinderhack (10 % Fett), roh" }, aliases: "wolowina mielona mieso mielone rinderhack hackfleisch ground beef mince", n: [176, 20.0, 0, 10.0, 0] },
  { key: "beef_20", names: { pl: "Wołowina mielona (20% tł.), surowa", en: "Ground beef 20% fat, raw", de: "Rinderhack (20 % Fett), roh" }, aliases: "wolowina mielona mieso mielone rinderhack hackfleisch ground beef mince", n: [254, 17.2, 0, 20.0, 0] },
  { key: "salmon", names: { pl: "Łosoś (hodowlany), surowy", en: "Salmon, farmed, raw", de: "Lachs (Zucht), roh" }, aliases: "losos lachs salmon", n: [208, 20.4, 0, 13.4, 0] },
  { key: "cod", names: { pl: "Dorsz, surowy", en: "Cod, raw", de: "Kabeljau, roh" }, aliases: "dorsz kabeljau dorsch cod", n: [82, 17.8, 0, 0.7, 0] },
  { key: "tuna_water", names: { pl: "Tuńczyk w sosie własnym (odsączony)", en: "Tuna in water, drained", de: "Thunfisch im eigenen Saft, abgetropft" }, aliases: "tunczyk thunfisch tuna", n: [116, 25.5, 0, 0.8, 0], servings: [["can", 130]] },
  { key: "lentils", names: { pl: "Soczewica, sucha", en: "Lentils, dry", de: "Linsen, roh" }, aliases: "soczewica linsen lentils", n: [352, 24.6, 52.7, 1.1, 10.7] },
  { key: "lentils_cooked", names: { pl: "Soczewica, ugotowana", en: "Lentils, cooked", de: "Linsen, gekocht" }, aliases: "soczewica ugotowana linsen gekocht lentils cooked", state: "cooked", n: [116, 9.0, 12.2, 0.4, 7.9] },
  { key: "chickpeas_cooked", names: { pl: "Ciecierzyca, ugotowana / z puszki", en: "Chickpeas, cooked", de: "Kichererbsen, gekocht" }, aliases: "ciecierzyca cieciorka kichererbsen chickpeas", state: "cooked", n: [164, 8.9, 19.8, 2.6, 7.6] },
  { key: "kidney_beans_cooked", names: { pl: "Fasola czerwona, ugotowana / z puszki", en: "Kidney beans, cooked", de: "Kidneybohnen, gekocht" }, aliases: "fasola czerwona kidneybohnen bohnen kidney beans", state: "cooked", n: [127, 8.7, 16.4, 0.5, 6.4] },
  { key: "tofu", names: { pl: "Tofu naturalne", en: "Tofu, firm", de: "Tofu natur" }, aliases: "tofu", n: [144, 17.3, 0.5, 8.7, 2.3] },
  // Fats, nuts, sweet
  { key: "olive_oil", names: { pl: "Oliwa z oliwek", en: "Olive oil", de: "Olivenöl" }, aliases: "oliwa oliwy z oliwek olej olivenol oel olive oil", n: [884, 0, 0, 100, 0], servings: [["tbsp", 10], ["tsp", 4], ["spray", 1]] },
  { key: "rapeseed_oil", names: { pl: "Olej rzepakowy", en: "Rapeseed (canola) oil", de: "Rapsöl" }, aliases: "olej rzepakowy rapsol oel canola rapeseed oil", n: [884, 0, 0, 100, 0], servings: [["tbsp", 10], ["tsp", 4], ["spray", 1]] },
  { key: "peanut_butter", names: { pl: "Masło orzechowe", en: "Peanut butter", de: "Erdnussbutter" }, aliases: "maslo orzechowe erdnussbutter erdnussmus peanut butter", n: [588, 25.1, 14.0, 50.4, 6.0], servings: [["tbsp", 16], ["tsp", 5]] },
  { key: "almonds", names: { pl: "Migdały", en: "Almonds", de: "Mandeln" }, aliases: "migdaly orzechy mandeln nusse almonds nuts", n: [579, 21.2, 9.1, 49.9, 12.5], servings: [["handful", 30]] },
  { key: "walnuts", names: { pl: "Orzechy włoskie", en: "Walnuts", de: "Walnüsse" }, aliases: "orzechy wloskie walnusse nusse walnuts nuts", n: [654, 15.2, 7.0, 65.2, 6.7], servings: [["handful", 30]] },
  { key: "sugar", names: { pl: "Cukier", en: "Sugar", de: "Zucker" }, aliases: "cukier zucker sugar", n: [387, 0, 100, 0, 0], servings: [["tsp", 5]] },
  { key: "honey", names: { pl: "Miód", en: "Honey", de: "Honig" }, aliases: "miod honig honey", n: [304, 0.3, 82.2, 0, 0.2], servings: [["tsp", 12]] },
  { key: "dark_chocolate", names: { pl: "Czekolada gorzka (70–85%)", en: "Dark chocolate (70–85%)", de: "Zartbitterschokolade (70–85 %)" }, aliases: "czekolada gorzka schokolade zartbitter dark chocolate", n: [598, 7.8, 35.0, 42.6, 10.9], servings: [["cube", 5]] },
  // Fruit and vegetables
  { key: "banana", names: { pl: "Banan", en: "Banana", de: "Banane" }, aliases: "banan banany banane bananen banana", n: [89, 1.1, 20.2, 0.3, 2.6], servings: [["piece", 120]] },
  { key: "apple", names: { pl: "Jabłko", en: "Apple", de: "Apfel" }, aliases: "jablko jablka apfel apfel apple", n: [52, 0.3, 11.4, 0.2, 2.4], servings: [["piece", 180]] },
  { key: "orange", names: { pl: "Pomarańcza", en: "Orange", de: "Orange" }, aliases: "pomarancza pomarancze orange apfelsine", n: [47, 0.9, 9.4, 0.1, 2.4], servings: [["piece", 150]] },
  { key: "strawberries", names: { pl: "Truskawki", en: "Strawberries", de: "Erdbeeren" }, aliases: "truskawki truskawka erdbeeren strawberries", n: [32, 0.7, 5.7, 0.3, 2.0], servings: [["handful", 100]] },
  { key: "blueberries", names: { pl: "Borówki amerykańskie", en: "Blueberries", de: "Heidelbeeren" }, aliases: "borowki jagody heidelbeeren blaubeeren blueberries", n: [57, 0.7, 12.1, 0.3, 2.4], servings: [["handful", 70]] },
  { key: "tomato", names: { pl: "Pomidor", en: "Tomato", de: "Tomate" }, aliases: "pomidor pomidory tomate tomaten tomato", n: [18, 0.9, 2.7, 0.2, 1.2], servings: [["piece", 120]] },
  { key: "cucumber", names: { pl: "Ogórek", en: "Cucumber", de: "Gurke" }, aliases: "ogorek ogorki gurke salatgurke cucumber", n: [15, 0.7, 3.1, 0.1, 0.5] },
  { key: "carrot", names: { pl: "Marchew", en: "Carrot", de: "Karotte" }, aliases: "marchew marchewka karotte mohre moehre carrot", n: [41, 0.9, 6.8, 0.2, 2.8], servings: [["piece", 70]] },
  { key: "broccoli", names: { pl: "Brokuł", en: "Broccoli", de: "Brokkoli" }, aliases: "brokul brokuly brokkoli broccoli", n: [34, 2.8, 4.0, 0.4, 2.6] },
  { key: "onion", names: { pl: "Cebula", en: "Onion", de: "Zwiebel" }, aliases: "cebula zwiebel onion", n: [40, 1.1, 7.6, 0.1, 1.7], servings: [["piece", 110]] },
  { key: "pepper_red", names: { pl: "Papryka czerwona", en: "Red bell pepper", de: "Paprika, rot" }, aliases: "papryka paprika pepper", n: [31, 1.0, 3.9, 0.3, 2.1], servings: [["piece", 150]] },
  { key: "spinach", names: { pl: "Szpinak", en: "Spinach", de: "Spinat" }, aliases: "szpinak spinat spinach", n: [23, 2.9, 1.4, 0.4, 2.2] },
  { key: "avocado", names: { pl: "Awokado", en: "Avocado", de: "Avocado" }, aliases: "awokado avocado", n: [160, 2.0, 1.8, 14.7, 6.7], servings: [["piece", 150]] },
  { key: "lettuce", names: { pl: "Sałata", en: "Lettuce", de: "Blattsalat" }, aliases: "salata salat lettuce", n: [15, 1.4, 1.6, 0.2, 1.3] },
];

/** Bump when values change: rows are re-written once on the next start. */
export const GENERIC_VERSION = "generic-8";

export function genericRows() {
  return F.flatMap((f, rank) => (["pl", "en", "de"] as const).map((locale) => {
    const nutrients: Nutrients = { kcal: f.n[0], protein: f.n[1], carbs: f.n[2], fat: f.n[3], fiber: f.n[4], sugar: null, satFat: null, salt: null };
    return {
      // rank: list order = most common first ("Mąka pszenna" before "Mąka pełnoziarnista").
      id: `gen_${locale}_${f.key}`, locale, rank, name: f.names[locale], basis: f.basis ?? "g", state: f.state ?? null, nutrients,
      servings: (f.servings ?? []).map(([k, amount]) => ({ label: SERVING[k][locale], amount })),
      // Searched without diacritics: names of all languages plus the aliases.
      aliases: ` ${[f.aliases, ...Object.values(f.names)].join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/ß/g, "ss").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `,
    };
  }));
}
