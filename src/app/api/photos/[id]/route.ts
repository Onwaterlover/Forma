import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { deletePhoto, getPhoto } from "@/lib/data";
import { sameOrigin } from "@/lib/http";

// Photos are never public: every request is checked against the signed-in owner.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const p = await getPhoto(user.id, (await params).id);
  if (!p) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(p.data), {
    headers: { "Content-Type": p.mime, "Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deletePhoto(user.id, (await params).id);
  return NextResponse.json({ ok: true });
}
