import { neon } from "@neondatabase/serverless";

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mangler i Vercel (Settings > Environment Variables).");
  return neon(url);
}

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  prev_close: number | null;
  change_pct: number | null;
  volume: number | null;
  market_time: string | null;
  updated_at: string;
};

export type SalmonWeek = {
  period: string;
  year: number;
  week: number;
  fresh_price: number | null;
  fresh_tonnes: number | null;
  frozen_price: number | null;
  frozen_tonnes: number | null;
};

export type SourceStatus = {
  source: string;
  last_run: string | null;
  last_ok: string | null;
  ok: boolean | null;
  rows: number | null;
  message: string | null;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getQuotes(): Promise<Quote[]> {
  try {
    const rows = await sql()`SELECT * FROM quotes`;
    return rows.map((r: Record<string, unknown>) => ({
      symbol: String(r.symbol),
      name: String(r.name),
      price: num(r.price),
      prev_close: num(r.prev_close),
      change_pct: num(r.change_pct),
      volume: num(r.volume),
      market_time: r.market_time ? String(r.market_time) : null,
      updated_at: String(r.updated_at),
    }));
  } catch {
    return [];
  }
}

export async function getSalmon(weeks = 52): Promise<SalmonWeek[]> {
  try {
    const rows = await sql()`SELECT * FROM ssb_salmon ORDER BY year DESC, week DESC LIMIT ${weeks}`;
    return rows
      .map((r: Record<string, unknown>) => ({
        period: String(r.period),
        year: Number(r.year),
        week: Number(r.week),
        fresh_price: num(r.fresh_price),
        fresh_tonnes: num(r.fresh_tonnes),
        frozen_price: num(r.frozen_price),
        frozen_tonnes: num(r.frozen_tonnes),
      }))
      .reverse();
  } catch {
    return [];
  }
}

export async function getDaily(symbol: string, days = 260): Promise<{ day: string; close: number }[]> {
  try {
    const rows = await sql()`SELECT day::text AS day, close FROM price_daily WHERE symbol = ${symbol} ORDER BY day DESC LIMIT ${days}`;
    return rows.map((r: Record<string, unknown>) => ({ day: String(r.day), close: Number(r.close) })).reverse();
  } catch {
    return [];
  }
}

export async function getStatus(): Promise<SourceStatus[]> {
  try {
    const rows = await sql()`SELECT * FROM source_status ORDER BY source`;
    return rows.map((r: Record<string, unknown>) => ({
      source: String(r.source),
      last_run: r.last_run ? String(r.last_run) : null,
      last_ok: r.last_ok ? String(r.last_ok) : null,
      ok: r.ok === null ? null : Boolean(r.ok),
      rows: num(r.rows),
      message: r.message ? String(r.message) : null,
    }));
  } catch {
    return [];
  }
}
