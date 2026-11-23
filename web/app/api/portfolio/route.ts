import { NextResponse } from "next/server";
import { authed, deny } from "@/lib/notes";
import { bad, listTrades, pdb } from "@/lib/portfolio";
import { COMPANIES } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await authed())) return deny();
  return NextResponse.json(await listTrades());
}

export async function POST(req: Request) {
  if (!(await authed())) return deny();
  const b = await req.json().catch(() => ({}));
  const symbol = String(b.symbol ?? "");
  if (!COMPANIES.some((c) => c.symbol === symbol)) return bad("Ukjent selskap");
  const side = b.side === "salg" ? "salg" : b.side === "kjøp" ? "kjøp" : null;
  if (!side) return bad("Velg kjøp eller salg");
  const qty = Number(b.qty), price = Number(b.price), fee = Number(b.fee ?? 0);
  if (!(qty > 0) || !(price >= 0) || !(fee >= 0)) return bad("Antall må være over 0, og kurs og kurtasje kan ikke være negative");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? String(b.day) : new Date().toISOString().slice(0, 10);
  const note = typeof b.note === "string" ? b.note.slice(0, 500) : "";
  const q = await pdb();
  if (side === "salg") {
    const rows = await q`SELECT coalesce(sum(CASE WHEN side='kjøp' THEN qty ELSE -qty END), 0) AS held FROM pf_trades WHERE symbol = ${symbol} AND day <= ${day}`;
    if (Number((rows as Record<string, unknown>[])[0]?.held ?? 0) + 1e-9 < qty) return bad("Du kan ikke selge flere aksjer enn du eier på den datoen");
  }
  const rows = await q`INSERT INTO pf_trades (day, symbol, side, qty, price, fee, note) VALUES (${day}, ${symbol}, ${side}, ${qty}, ${price}, ${fee}, ${note})
    RETURNING id, day::text AS day, symbol, side, qty, price, fee, note`;
  const r = (rows as Record<string, unknown>[])[0];
  return NextResponse.json({ ...r, id: Number(r.id), qty: Number(r.qty), price: Number(r.price), fee: Number(r.fee) });
}
