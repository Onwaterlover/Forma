import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { searchProducts } from "@/lib/data";
import { searchRemote } from "@/lib/off";

// Local search is cheap and runs as the user types (debounced). Remote Open Food Facts search only
// runs when the user explicitly asks for it (remote=1), respecting their rate limits.
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  if (url.searchParams.get("remote") === "1") {
    const r = await searchRemote(user.id, q, user.locale);
    return NextResponse.json(r);
  }
  return NextResponse.json({ products: searchProducts(user.id, q) });
}
