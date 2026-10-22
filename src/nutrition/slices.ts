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
