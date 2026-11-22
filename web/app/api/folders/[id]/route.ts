import { NextResponse } from "next/server";
import { authed, clip, db, deny } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await authed())) return deny();
  const id = Number((await params).id);
  const name = clip((await req.json().catch(() => ({}))).name, 80).trim();
  if (!name) return NextResponse.json({ error: "Mappen trenger et navn" }, { status: 400 });
  const q = await db();
  const rows = await q`UPDATE note_folders SET name = ${name} WHERE id = ${id} RETURNING id, name`;
  return NextResponse.json(rows[0] ?? { error: "Finnes ikke" }, { status: rows[0] ? 200 : 404 });
}

// Notatene i mappen blir liggende under «Uten mappe»
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await authed())) return deny();
  const id = Number((await params).id);
  const q = await db();
  await q`DELETE FROM note_folders WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
