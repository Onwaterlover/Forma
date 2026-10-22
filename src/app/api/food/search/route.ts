import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { searchProducts } from "@/lib/data";
import { searchRemote } from "@/lib/off";
import { englishQuery } from "@/nutrition/synonyms";

// Local search is cheap and runs as the user types (debounced); the app asks Open Food Facts (remote=1)
// right after, once typing pauses. Results are cached and rate-limited server-side.
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  if (url.searchParams.get("remote") === "1") {
    let r = await searchRemote(user.id, q, user.locale);
    // Little found? Ask again: without Polish/German letters ("żurek" finds nothing there, "zurek" does),
    // then with the words translated to English ("tofu wędzone" → "smoked tofu").
    const plain = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/ß/g, "ss");
    for (const alt of [plain !== q ? plain : null, englishQuery(q)]) {
      if (!alt || ("products" in r && r.products.length >= 5)) continue;
      const r2 = await searchRemote(user.id, alt, user.locale);
      if (!("products" in r2)) continue;
      const have = "products" in r ? r.products : [];
      const seen = new Set(have.map((p) => p.id));
      r = { products: [...have, ...r2.products.filter((p) => !seen.has(p.id))] };
    }
    return NextResponse.json(r);
  }
  return NextResponse.json({ products: await searchProducts(user.id, q, 25, user.locale) });
}
