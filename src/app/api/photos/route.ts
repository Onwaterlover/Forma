import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { isIsoDate } from "@/lib/ctx";
import { addPhoto } from "@/lib/data";
import { sameOrigin } from "@/lib/http";

const MAX_BYTES = 3 * 1024 * 1024;

/** Detect the real image type from its first bytes (never trust the declared type). */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const date = String(form?.get("date") ?? "");
  const pose = String(form?.get("pose") ?? "");
  if (!(file instanceof Blob) || !isIsoDate(date) || !["front", "side", "back", "other"].includes(pose)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const data = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(data);
  if (!mime) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const num = (k: string) => {
    const n = Number(form?.get(k));
    return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
  };
  const note = String(form?.get("note") ?? "").trim().slice(0, 200) || null;
  const id = await addPhoto(user.id, { date, pose: pose as "front", note, mime, data, width: num("width"), height: num("height") });
  return NextResponse.json({ id });
}
