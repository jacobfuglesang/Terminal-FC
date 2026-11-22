import { NextResponse } from "next/server";
import { authed, clip, db, deny } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await authed())) return deny();
  const id = Number((await params).id);
  const b = await req.json().catch(() => ({}));
  const q = await db();
  const cur = (await q`SELECT * FROM notes WHERE id = ${id}`)[0];
  if (!cur) return NextResponse.json({ error: "Finnes ikke" }, { status: 404 });
  const title = "title" in b ? clip(b.title, 300) : cur.title;
  const body = "body" in b ? clip(b.body, 200000) : cur.body;
  const folder = "folder_id" in b ? (Number.isInteger(b.folder_id) ? b.folder_id : null) : cur.folder_id;
  const symbol = "symbol" in b ? clip(b.symbol, 20) || null : cur.symbol;
  const pinned = "pinned" in b ? Boolean(b.pinned) : cur.pinned;
  const rows = await q`UPDATE notes SET title = ${title}, body = ${body}, folder_id = ${folder}, symbol = ${symbol}, pinned = ${pinned}, updated_at = now()
    WHERE id = ${id} RETURNING id, folder_id, title, body, symbol, pinned, updated_at`;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await authed())) return deny();
  const id = Number((await params).id);
  const q = await db();
  await q`DELETE FROM notes WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
