// Typical slice weights for sliced products that come without a serving in Open Food Facts. The package's own
// serving always wins; these are labelled as approximate in the app.
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/ß/g, "ss");

const RULES: [RegExp, number][] = [
  [/salami|chorizo|pepperoni|kabanos/, 6],
  [/szynk|\bham\b|schinken|poledwic|wedlin|boczek|bacon|mortadel|kielbas.*plastr|aufschnitt/, 12],
  [/\bsera?\b.*(tost|plastr)|toast|scheiblett|cheese slice/, 20],
  [/\bser\b|gouda|edam|emmental|cheddar|tilsit|maasdam|kase|cheese/, 15],
];

/** Grams of one typical slice, or null if the product isn't a sliced kind. */
export function typicalSlice(name: string): number | null {
  const n = plain(name);
  for (const [re, g] of RULES) if (re.test(n)) return g;
  return null;
}

// Typical weights of one piece for bakery items and snacks bought by the piece, when the package gives no serving
// (approximate, shown with "≈"). More specific names come first.
const PIECES: [RegExp, number][] = [
  // Popular bars, one bar (or finger) each.
  [/kinder bueno|milky ?way/, 21.5],
  [/kinder (riegel|chocolate|czekolad)/, 21],
  [/kinder country/, 23.5],
  [/twix/, 25],
  [/bounty/, 28.5],
  [/snickers/, 50],
  [/\bmars\b/, 51],
  [/apfeltasche|jablecznik|turnover|chausson|tasche/, 100],
  [/zimtschnecke|schnecke|slimak|cinnamon roll|drozdzowk/, 100],
  [/laugenstange|laugenbrotchen|laugenecke/, 70],
  [/brezel|precel|pretzel/, 85],
  [/croissant|rogal/, 60],
  [/berliner|krapfen|paczek|paczk|donut|doughnut/, 70],
  [/muffin|babeczk/, 80],
  [/bagel/, 90],
  [/brotchen|semmel|kajzerk|bulka|bulki|bulecz|weckerl/, 55],
];

/** Grams of one typical piece (bakery and similar), or null; never for flour, crumbs or the like. */
export function typicalPiece(name: string): number | null {
  const n = plain(name);
  // Mini versions vary too much to guess a piece.
  if (/tart|paniermehl|semmelbrosel|breadcrumb|mehl|maka|mini/.test(n)) return null;
  for (const [re, g] of PIECES) if (re.test(n)) return g;
  return null;
}

export type UnitKind = "tsp" | "tbsp" | "handful" | "scoop" | "cube" | "breadSlice";

// Nuts and seeds inside sweets, spreads, oils or bread are not eaten by the handful or spoonful.
const SWEETS_ETC = /czekolad|schokolad|chocolate|baton|riegel|\bbar\b|krem|\bmus\b|maslo|butter|olej|\bol\b|oil|chleb|brot|bread|lody|\beis\b|wafel|wafl|waffel|ciast|keks|cookie|kuchen/;

// Household units for kinds of food usually measured that way (approximate, shown with "≈"), offered when the
// package gives no countable serving. First match wins; `ml`: also for products measured in millilitres.
const UNITS: { re: RegExp; not?: RegExp; ml?: boolean; units: [UnitKind, number][] }[] = [
  { re: /nutella|krem (czekoladow|orzechow)|nuss-?nougat|maslo orzechow|erdnuss(butter|mus)|peanut butter|nut butter|nussmus/, units: [["tsp", 7], ["tbsp", 15]] },
  { re: /\bmiod|honig|honey|syrop|sirup|syrup/, ml: true, units: [["tsp", 10], ["tbsp", 20]] },
  { re: /dzem|konfitur|marmolad|powidl|\bjam\b|fruchtaufstrich/, units: [["tsp", 8], ["tbsp", 20]] },
  { re: /ketchup|majonez|mayo|musztard|senf|mustard|\bsos\b|sauce|dressing|pesto/, ml: true, units: [["tsp", 5], ["tbsp", 15]] },
  { re: /\bolej|oliwa|olivenol|rapsol|speiseol|sonnenblumenol|\boil\b/, ml: true, units: [["tsp", 4], ["tbsp", 10]] },
  { re: /\bmaslo\b|\bbutter\b|margaryn|margarine/, units: [["tsp", 5], ["tbsp", 15]] },
  { re: /odzywka|bialko serwatk|whey|protein ?(pulver|powder)|izolat|isolat/, units: [["scoop", 30]] },
  { re: /cukier|zucker|\bsugar|ksylitol|erytrytol|xylit|erythrit/, units: [["tsp", 5], ["tbsp", 12]] },
  { re: /\bkakao|cocoa/, not: /napoj|drink|do picia|baton|riegel/, units: [["tsp", 5], ["tbsp", 10]] },
  { re: /\bmaka|\bmehl|flour|platki owsian|haferflocken|\boats|owsian|musli|granola|otreby|kleie/, units: [["tbsp", 10]] },
  { re: /chia|siemie|leinsamen|flaxseed|sezam|sesam|slonecznik|sonnenblumenkern|pestki dyni|kurbiskern|pumpkin seed/, not: SWEETS_ETC, units: [["tbsp", 10]] },
  { re: /orzech|nusse|\bnuss|\bnuts?\b|migdal|mandel|almond|cashew|nerkow|pistac|pistaz|laskow|haselnuss|wloski|walnuss|walnut|arachid|erdnusse|peanuts/, not: SWEETS_ETC, units: [["handful", 30]] },
  { re: /czekolad|schokolad|chocolate/, not: /napoj|drink|do picia|pudding|budyn|baton|riegel|\bbar\b|platki|lody|\beis\b|ice cream|deser|krem|mleko|ciastk|keks|cookie|wafel|waffel/, units: [["cube", 5]] },
  { re: /chleb|\bbrot\b|vollkornbrot|roggenbrot|bread/, not: /tart|panier|brosel|crumb|aufstrich|chips|maka|mehl/, units: [["breadSlice", 35]] },
];

/** Household units (grams, or ml) that suit this kind of food, or none. */
export function typicalUnits(name: string, basis: "g" | "ml" | string = "g"): [UnitKind, number][] {
  const n = plain(name);
  for (const u of UNITS) if (u.re.test(n) && !u.not?.test(n) && (basis === "g" || u.ml)) return u.units;
  return [];
}

/** "2 bars (43 g)", "1 Becher (150 g)", "4 kostki = 25 g": how many countable things the serving is and its weight. */
export function countFromLabel(label: string): { n: number; amount: number } | null {
  const m = plain(label).match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:x\s*)?([^\d()=:]*[a-z][^\d()=:]*?)\s*[(=:]\s*(?:ok\.?\s*|ca\.?\s*|≈\s*)?(\d+(?:[.,]\d+)?)\s*(g|ml)\b/);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  const amount = Number(m[3]!.replace(",", "."));
  if (/^(g|gr|gram|grams|gramm|ml|oz|kg|l)$/.test(m[2]!.trim()) || !(n >= 1 && n <= 20 && Number.isInteger(n)) || !(amount > 0 && amount < 2000)) return null;
  return { n, amount };
}
