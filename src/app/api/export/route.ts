import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { exportUser } from "@/lib/data";

/** The signed-in user's complete data as JSON (plain, documented, re-importable format). */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = JSON.stringify(await exportUser(user.id), null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="forma-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
