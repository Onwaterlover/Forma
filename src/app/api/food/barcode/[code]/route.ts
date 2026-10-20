import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { lookupBarcode } from "@/lib/off";
import { normalizeBarcode } from "@/nutrition/barcode";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const format = new URL(req.url).searchParams.get("format") ?? undefined;
  const code = normalizeBarcode((await params).code, format);
  if (!code) return NextResponse.json({ error: "invalid_barcode" }, { status: 400 });
  const r = await lookupBarcode(user.id, code, user.locale);
  return NextResponse.json({ barcode: code, ...r }, { status: "error" in r && r.error === "not_found" ? 404 : 200 });
}
