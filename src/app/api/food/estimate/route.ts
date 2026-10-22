import { NextResponse } from "next/server";
import { aiProvider, estimateFood } from "@/lib/assistant";
import { apiUser } from "@/lib/auth";
import { findAiEstimate, getSettings, saveAiEstimate } from "@/lib/data";

// At most a few new estimates per person per hour (each is one small AI call); earlier ones are free.
const recent = new Map<string, number[]>();

/** A typical-values estimate for a food no database has; the app asks only when the search found nothing fitting. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 4) return NextResponse.json({ product: null });
  const known = await findAiEstimate(user.id, q);
  if (known) return NextResponse.json({ product: known });
  if (!aiProvider() || !(await getSettings(user.id)).ai) return NextResponse.json({ product: null });
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 3_600_000);
  if (mine.length >= 30) return NextResponse.json({ product: null });
  recent.set(user.id, [...mine, now]);
  const e = await estimateFood(q, user.locale);
  return NextResponse.json({ product: e ? await saveAiEstimate(user.id, q, e) : null });
}
