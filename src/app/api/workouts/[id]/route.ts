import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { deleteWorkout, getWorkout, upsertWorkout, type WorkoutPayload } from "@/lib/data";
import { workoutSchema } from "@/lib/schemas";
import { sameOrigin } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const w = getWorkout(user.id, (await params).id);
  return w ? NextResponse.json(w) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** Idempotent save used for live autosave and offline sync. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = workoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.id !== id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const result = upsertWorkout(user.id, parsed.data as WorkoutPayload);
  if (result === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ result });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  deleteWorkout(user.id, (await params).id);
  return NextResponse.json({ ok: true });
}
