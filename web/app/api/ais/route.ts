import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authed, deny } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kompakt liste over skip sett siste døgn: [lat, lon, type, størrelse, lastet, fart, kurs, navn, destinasjon, minutter siden, område]
export async function GET(req: Request) {
  if (!(await authed())) return deny();
  const hours = Math.min(72, Math.max(1, Number(new URL(req.url).searchParams.get("timer") ?? 24)));
  try {
    const rows = (await sql()`SELECT lat, lon, kind, size, laden, sog, cog, name, dest, zone,
      round(extract(epoch FROM (now() - seen)) / 60)::int AS age FROM ais_positions
      WHERE seen > now() - make_interval(hours => ${hours}) AND kind IN ('tank','last','ukjent')`) as Record<string, unknown>[];
    const ships = rows.map((r) => [
      Math.round(Number(r.lat) * 1e4) / 1e4, Math.round(Number(r.lon) * 1e4) / 1e4, String(r.kind), r.size ?? null,
      r.laden === null ? null : Boolean(r.laden), r.sog === null ? null : Number(r.sog), r.cog === null ? null : Math.round(Number(r.cog)),
      String(r.name ?? ""), String(r.dest ?? ""), Number(r.age), r.zone ?? null,
    ]);
    return NextResponse.json({ n: ships.length, ships }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch {
    return NextResponse.json({ n: 0, ships: [] });
  }
}
