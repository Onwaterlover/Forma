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
