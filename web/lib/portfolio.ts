import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Handler du registrerer selv. Bare aksjene i Terminal FC (Oslo Børs, NOK).
export type Trade = { id: number; day: string; symbol: string; side: "kjøp" | "salg"; qty: number; price: number; fee: number; note: string };

let ready = false;
export async function pdb() {
  const q = sql();
  if (!ready) {
    await q`CREATE TABLE IF NOT EXISTS pf_trades (id SERIAL PRIMARY KEY, day DATE NOT NULL, symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('kjøp','salg')), qty NUMERIC NOT NULL CHECK (qty > 0), price NUMERIC NOT NULL CHECK (price >= 0),
      fee NUMERIC NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    ready = true;
  }
  return q;
}

export async function listTrades(): Promise<Trade[]> {
  try {
    const q = await pdb();
    const rows = await q`SELECT id, day::text AS day, symbol, side, qty, price, fee, note FROM pf_trades ORDER BY day, id`;
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id), day: String(r.day), symbol: String(r.symbol), side: r.side as Trade["side"],
      qty: Number(r.qty), price: Number(r.price), fee: Number(r.fee), note: String(r.note ?? ""),
    }));
  } catch {
    return [];
  }
}

export const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
