import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { COOKIE, createSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILS = 3;
const FIRST_LOCK = 5 * 60; // første sperre: 5 minutter
const MAX_LOCK = 24 * 60 * 60; // dobles for hver sperre, men aldri over 24 timer

// level = hvor mange sperrer på rad uten vellykket innlogging (nullstilles når riktig kode tastes)
function lockSeconds(level: number): number {
  return Math.min(MAX_LOCK, FIRST_LOCK * 2 ** Math.min(level, 20));
}

async function guard() {
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS login_guard (id INT PRIMARY KEY DEFAULT 1, fails INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ)`;
  await db`ALTER TABLE login_guard ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 0`;
  await db`INSERT INTO login_guard (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  const rows = await db`SELECT fails, level, GREATEST(0, EXTRACT(EPOCH FROM (locked_until - now())))::int AS left FROM login_guard WHERE id = 1`;
  return {
    db,
    fails: Number(rows[0]?.fails ?? 0),
    level: Number(rows[0]?.level ?? 0),
    left: Number(rows[0]?.left ?? 0),
  };
}

function samePin(a: string, b: string): boolean {
  const ba = Buffer.from(a.padEnd(64, "\0"));
  const bb = Buffer.from(b.padEnd(64, "\0"));
  return ba.length === bb.length && timingSafeEqual(ba, bb) && a.length === b.length;
}

function pinLength(): number {
  return (process.env.LOGIN_PIN ?? "").replace(/\D/g, "").length || 6;
}

// Brukes av påloggingssiden: nedtelling hvis sperren er aktiv, og hvor mange siffer koden har
export async function GET() {
  try {
    const { left } = await guard();
    return NextResponse.json({ lockedFor: left, length: pinLength() });
  } catch {
    return NextResponse.json({ lockedFor: 0, length: pinLength(), error: "Databasen svarer ikke" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const expected = (process.env.LOGIN_PIN ?? "").replace(/\D/g, "");
  if (!expected) return NextResponse.json({ error: "LOGIN_PIN er ikke satt i Vercel." }, { status: 500 });

  let pin = "";
  try {
    pin = String((await req.json()).pin ?? "").replace(/\D/g, "").slice(0, 12);
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
  }

  let g;
  try {
    g = await guard();
  } catch {
    return NextResponse.json({ error: "Databasen svarer ikke. Prøv igjen om litt." }, { status: 503 });
  }
  if (g.left > 0) return NextResponse.json({ lockedFor: g.left }, { status: 429 });

  // Reserver forsøket i én atomisk oppdatering FØR koden sjekkes. Da kan ikke mange
  // samtidige forespørsler snike seg forbi sperren (databasen tar dem én og én).
  const slot = await g.db`UPDATE login_guard SET fails = fails + 1
    WHERE id = 1 AND fails < ${MAX_FAILS} AND (locked_until IS NULL OR locked_until <= now())
    RETURNING fails, level`;
  if (slot.length === 0) {
    const again = await guard();
    if (again.left === 0 && again.fails >= MAX_FAILS) {
      // Et tidligere kall rakk ikke å sette sperren (f.eks. tidsavbrudd): sett den nå
      const secs = lockSeconds(again.level);
      await g.db`UPDATE login_guard SET fails = 0, level = level + 1,
        locked_until = now() + make_interval(secs => ${secs}) WHERE id = 1 AND fails >= ${MAX_FAILS}`;
      return NextResponse.json({ lockedFor: secs }, { status: 429 });
    }
    return NextResponse.json({ lockedFor: Math.max(again.left, 1) }, { status: 429 });
  }
  const fails = Number(slot[0].fails);
  const level = Number(slot[0].level);

  if (samePin(pin, expected)) {
    await g.db`UPDATE login_guard SET fails = 0, level = 0, locked_until = NULL WHERE id = 1`;
    const { token, maxAge } = await createSession();
    const res = NextResponse.json({ ok: true });
    // Øktcookie (ingen maxAge): slettes når nettleseren lukkes. Tokenet utløper uansett etter LOGIN_SESSION_MINUTES.
    void maxAge;
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
    return res;
  }

  if (fails >= MAX_FAILS) {
    const secs = lockSeconds(level);
    await g.db`UPDATE login_guard SET fails = 0, level = level + 1,
      locked_until = now() + make_interval(secs => ${secs}) WHERE id = 1`;
    return NextResponse.json({ lockedFor: secs }, { status: 429 });
  }
  return NextResponse.json({ triesLeft: MAX_FAILS - fails }, { status: 401 });
}
