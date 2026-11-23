import { NextResponse } from "next/server";
import { authed, deny } from "@/lib/notes";
import { pdb } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authed())) return deny();
  const id = Number((await params).id);
  const q = await pdb();
  await q`DELETE FROM pf_trades WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
