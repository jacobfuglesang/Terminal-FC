import { sql } from "@/lib/db";

// Dine egne justeringer i bookingtabellen (antall skip, rate for resten, dødpunkt, utnyttelse).
// Tomme felt (null) betyr «bruk tallet fra rapporten».
export type BookingInput = { symbol: string; segment: string; vessels: number | null; rest_rate: number | null; breakeven: number | null; util: number | null };

let ready = false;
export async function bdb() {
  const q = sql();
  if (!ready) {
    await q`CREATE TABLE IF NOT EXISTS booking_inputs (symbol TEXT NOT NULL, segment TEXT NOT NULL,
      vessels REAL, rest_rate REAL, breakeven REAL, util REAL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (symbol, segment))`;
    ready = true;
  }
  return q;
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listBookingInputs(): Promise<BookingInput[]> {
  try {
    const q = await bdb();
    const rows = await q`SELECT symbol, segment, vessels, rest_rate, breakeven, util FROM booking_inputs`;
    return (rows as Record<string, unknown>[]).map((r) => ({
      symbol: String(r.symbol), segment: String(r.segment), vessels: n(r.vessels), rest_rate: n(r.rest_rate), breakeven: n(r.breakeven), util: n(r.util),
    }));
  } catch {
    return [];
  }
}
