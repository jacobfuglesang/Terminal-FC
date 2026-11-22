import { NextResponse } from "next/server";
import { authed, clip, db, deny, listAll } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await authed())) return deny();
  return NextResponse.json(await listAll());
}

export async function POST(req: Request) {
  if (!(await authed())) return deny();
  const b = await req.json().catch(() => ({}));
  const q = await db();
  const folder = Number.isInteger(b.folder_id) ? b.folder_id : null;
  const rows = await q`INSERT INTO notes (folder_id, title, body, symbol) VALUES (${folder}, ${clip(b.title, 300)}, ${clip(b.body, 200000)}, ${clip(b.symbol, 20) || null})
    RETURNING id, folder_id, title, body, symbol, pinned, updated_at`;
  return NextResponse.json(rows[0]);
}
