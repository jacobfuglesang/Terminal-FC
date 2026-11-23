import { NextResponse } from "next/server";
import { bdb, listBookingInputs } from "@/lib/bookings";
import { authed, deny } from "@/lib/notes";
import { COMPANIES } from "@/lib/universe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

// Tall eller null. Grenser som stopper åpenbare skrivefeil.
function val(v: unknown, min: number, max: number): number | null | "feil" {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= min && x <= max ? x : "feil";
}

export async function GET() {
  if (!(await authed())) return deny();
  return NextResponse.json(await listBookingInputs());
}

export async function POST(req: Request) {
  if (!(await authed())) return deny();
  const b = await req.json().catch(() => ({}));
  const symbol = String(b.symbol ?? "");
  if (!COMPANIES.some((c) => c.symbol === symbol)) return bad("Ukjent selskap");
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 20) : [];
  const q = await bdb();
  for (const r of rows) {
    const segment = String(r.segment ?? "").slice(0, 60);
    if (!segment) return bad("Mangler skipstype");
    const vessels = val(r.vessels, 0, 2000), rest = val(r.rest_rate, 0, 2_000_000), be = val(r.breakeven, 0, 500_000), util = val(r.util, 0.5, 1);
    if (vessels === "feil") return bad(`Antall skip for ${segment} må være mellom 0 og 2000`);
    if (rest === "feil") return bad(`Raten for ${segment} må være et tall i USD per dag`);
    if (be === "feil") return bad(`Dødpunktet for ${segment} må være et tall i USD per dag`);
    if (util === "feil") return bad("Utnyttelse må være mellom 50 og 100 %");
    if (vessels === null && rest === null && be === null && util === null) {
      await q`DELETE FROM booking_inputs WHERE symbol = ${symbol} AND segment = ${segment}`;
    } else {
      await q`INSERT INTO booking_inputs (symbol, segment, vessels, rest_rate, breakeven, util, updated_at)
        VALUES (${symbol}, ${segment}, ${vessels}, ${rest}, ${be}, ${util}, now())
        ON CONFLICT (symbol, segment) DO UPDATE SET vessels = EXCLUDED.vessels, rest_rate = EXCLUDED.rest_rate,
          breakeven = EXCLUDED.breakeven, util = EXCLUDED.util, updated_at = now()`;
    }
  }
  return NextResponse.json(await listBookingInputs());
}

export async function DELETE(req: Request) {
  if (!(await authed())) return deny();
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
  if (!COMPANIES.some((c) => c.symbol === symbol)) return bad("Ukjent selskap");
  const q = await bdb();
  await q`DELETE FROM booking_inputs WHERE symbol = ${symbol}`;
  return NextResponse.json(await listBookingInputs());
}
