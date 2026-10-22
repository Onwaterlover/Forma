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
    const r = await searchRemote(user.id, q, user.locale);
    // Little found ("tofu wędzone")? Ask again with the words translated to English ("smoked tofu").
    const en = englishQuery(q);
    if (en && (!("products" in r) || r.products.length < 5)) {
      const r2 = await searchRemote(user.id, en, user.locale);
      if ("products" in r2) {
        const seen = new Set(("products" in r ? r.products : []).map((p) => p.id));
        return NextResponse.json({ products: [...("products" in r ? r.products : []), ...r2.products.filter((p) => !seen.has(p.id))] });
      }
    }
    return NextResponse.json(r);
  }
  return NextResponse.json({ products: await searchProducts(user.id, q, 25, user.locale) });
}
