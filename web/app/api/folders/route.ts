import { NextResponse } from "next/server";
import { authed, clip, db, deny } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await authed())) return deny();
  const b = await req.json().catch(() => ({}));
  const name = clip(b.name, 80).trim();
  if (!name) return NextResponse.json({ error: "Mappen trenger et navn" }, { status: 400 });
  const q = await db();
  const rows = await q`INSERT INTO note_folders (name) VALUES (${name}) RETURNING id, name`;
  return NextResponse.json(rows[0]);
}
