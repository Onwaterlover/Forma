// Everyday food words in Polish, English and German, so "tofu wędzone" also finds "Smoked tofu" and
// "maliny mrożone" finds "Frozen raspberries". Stems without diacritics, matched as word prefixes.
// Each group: [Polish, English, German, ...more]; the English one is used to ask Open Food Facts again.
const GROUPS: string[][] = [
  ["wedzon", "smoked", "gerauchert", "raucher"], ["mrozon", "frozen", "tiefgekuhlt", "tiefgefror"],
  ["gotowan", "cooked", "gekocht", "boiled"], ["pieczon", "baked", "gebacken", "roasted"], ["smazon", "fried", "gebraten"],
  ["suszon", "dried", "getrocknet"], ["surow", "raw", "roh"], ["chud", "lean", "mager", "low fat"], ["lekk", "light", "leicht"],
  ["pelnoziarn", "wholegrain", "vollkorn", "whole wheat"], ["naturaln", "plain", "natur", "natural"], ["slodzon", "sweetened", "gesusst"],
  ["malin", "raspberr", "himbeer"], ["truskaw", "strawberr", "erdbeer"], ["borowk", "blueberr", "heidelbeer", "blaubeer"],
  ["wisni", "cherr", "kirsch"], ["jablk", "apple", "apfel"], ["gruszk", "pear", "birne"], ["banan", "banana", "banane"],
  ["pomidor", "tomato", "tomate"], ["ogor", "cucumber", "gurke"], ["ziemniak", "potato", "kartoffel"], ["marchew", "carrot", "karott", "mohre"],
  ["szpinak", "spinach", "spinat"], ["brokul", "broccoli", "brokkoli"], ["cebul", "onion", "zwiebel"], ["czosn", "garlic", "knoblauch"],
  ["ser", "cheese", "kase"], ["twarog", "quark", "cottage"], ["szynk", "ham", "schinken"], ["kielbas", "sausage", "wurst"],
  ["kurczak", "chicken", "hahnchen", "huhn"], ["indyk", "turkey", "pute", "truthahn"], ["wolowin", "beef", "rind"], ["wieprzow", "pork", "schwein"],
  ["ryb", "fish", "fisch"], ["losos", "salmon", "lachs"], ["tunczyk", "tuna", "thunfisch"], ["krewet", "shrimp", "garnel"],
  ["mlek", "milk", "milch"], ["jogurt", "yogurt", "joghurt", "yoghurt"], ["smietan", "cream", "sahne"], ["masl", "butter"],
  ["jaj", "egg", "ei"], ["chleb", "bread", "brot"], ["bulk", "roll", "brotchen", "bun"], ["makaron", "pasta", "nudel"],
  ["ryz", "rice", "reis"], ["platk", "flakes", "flocken"], ["owsian", "oat", "hafer"], ["mak", "flour", "mehl"],
  ["orzech", "nut", "nuss"], ["migdal", "almond", "mandel"], ["czekolad", "chocolate", "schokolad"], ["ciast", "cake", "kuchen"],
  ["sok", "juice", "saft"], ["cukier", "sugar", "zucker"], ["miod", "honey", "honig"], ["olej", "oil", "ol"], ["oliw", "olive", "oliv"],
  ["fasol", "bean", "bohne"], ["soczewic", "lentil", "linse"], ["ciecierzyc", "chickpea", "kichererbse"], ["groch", "pea", "erbse"],
  ["grzyb", "mushroom", "pilz"], ["pieczark", "mushroom", "champignon"], ["sos", "sauce", "sosse"], ["zup", "soup", "suppe"],
];

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/ß/g, "ss");

function groupOf(word: string): string[] | null {
  const w = plain(word);
  if (w.length < 3) return null;
  // The longest matching stem wins ("pieczark" before "piecz…", "mak" only for short forms like "maka"/"maki").
  let best: { g: string[]; len: number } | null = null;
  for (const g of GROUPS) for (const stem of g) {
    if (stem.length >= 3 && (w.startsWith(stem) || (stem.startsWith(w) && w.length >= 4 && w.length >= stem.length - 2)) && (!best || stem.length > best.len)) {
      if (stem === "mak" && !/^mak[aiiey]?$/.test(w)) continue;
      best = { g, len: stem.length };
    }
  }
  return best?.g ?? null;
}

/** Alternatives for one search word (itself first). */
export function alternatives(word: string): string[] {
  const g = groupOf(word);
  // Short words ("ol", "ei") would match half the database as substrings, so only stems of 3+ letters.
  return g ? [...new Set([plain(word), ...g.filter((x) => x.length >= 3)])] : [plain(word)];
}

/** The query in English, if any word could be translated (for a second Open Food Facts search). */
export function englishQuery(q: string): string | null {
  const words = q.trim().split(/\s+/).filter(Boolean);
  let changed = false;
  const out = words.map((w) => { const g = groupOf(w); if (g && plain(w) !== g[1]) { changed = true; return g[1]!; } return w; });
  return changed ? out.join(" ") : null;
}
