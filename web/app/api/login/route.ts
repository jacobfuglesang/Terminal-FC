import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { COOKIE, createSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILS = 3;
const LOCK_SECONDS = 5 * 60;

async function guard() {
  const db = sql();
  await db`CREATE TABLE IF NOT EXISTS login_guard (id INT PRIMARY KEY DEFAULT 1, fails INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ)`;
  await db`INSERT INTO login_guard (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  const rows = await db`SELECT fails, GREATEST(0, EXTRACT(EPOCH FROM (locked_until - now())))::int AS left FROM login_guard WHERE id = 1`;
  return { db, fails: Number(rows[0]?.fails ?? 0), left: Number(rows[0]?.left ?? 0) };
}

function samePin(a: string, b: string): boolean {
  const ba = Buffer.from(a.padEnd(64, "\0"));
  const bb = Buffer.from(b.padEnd(64, "\0"));
  return ba.length === bb.length && timingSafeEqual(ba, bb) && a.length === b.length;
}

// Brukes av påloggingssiden for å vise nedtelling hvis sperren er aktiv
export async function GET() {
  try {
    const { left } = await guard();
    return NextResponse.json({ lockedFor: left });
  } catch {
    return NextResponse.json({ lockedFor: 0, error: "Databasen svarer ikke" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const expected = process.env.LOGIN_PIN;
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

  if (samePin(pin, expected)) {
    await g.db`UPDATE login_guard SET fails = 0, locked_until = NULL WHERE id = 1`;
    const { token, maxAge } = await createSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge });
    return res;
  }

  const fails = g.fails + 1;
  if (fails >= MAX_FAILS) {
    await g.db`UPDATE login_guard SET fails = 0, locked_until = now() + make_interval(secs => ${LOCK_SECONDS}) WHERE id = 1`;
    return NextResponse.json({ lockedFor: LOCK_SECONDS }, { status: 429 });
  }
  await g.db`UPDATE login_guard SET fails = ${fails} WHERE id = 1`;
  return NextResponse.json({ triesLeft: MAX_FAILS - fails }, { status: 401 });
}
