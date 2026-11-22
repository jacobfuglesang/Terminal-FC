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

export async function getIntraday(symbol: string): Promise<{ t: string; v: number }[]> {
  try {
    const rows = await sql()`SELECT ts, price FROM price_intraday WHERE symbol = ${symbol} AND ts > now() - interval '10 days' ORDER BY ts`;
    return rows.map((r: Record<string, unknown>) => ({ t: new Date(String(r.ts)).toISOString(), v: Number(r.price) }));
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

// ===== Fase 2 =====
type Row = Record<string, unknown>;
const safe = async <T,>(f: () => Promise<T>, empty: T): Promise<T> => {
  try {
    return await f();
  } catch {
    return empty;
  }
};

export const getAllDaily = () =>
  safe(async () => {
    const rows = await sql()`SELECT symbol, day::text AS day, close FROM price_daily WHERE day > now() - interval '400 days' ORDER BY day`;
    const out: Record<string, { t: string; v: number }[]> = {};
    for (const r of rows as Row[]) (out[String(r.symbol)] ||= []).push({ t: `${r.day}T16:00:00Z`, v: Number(r.close) });
    return out;
  }, {} as Record<string, { t: string; v: number }[]>);

export const getShorts = () =>
  safe(async () => {
    const rows = await sql()`SELECT symbol, day::text AS day, pct, holders FROM shorts WHERE day > now() - interval '400 days' ORDER BY day`;
    return (rows as Row[]).map((r) => ({ symbol: String(r.symbol), day: String(r.day), pct: Number(r.pct), holders: Number(r.holders) }));
  }, [] as { symbol: string; day: string; pct: number; holders: number }[]);

export const getFeed = () =>
  safe(async () => {
    const idx = await sql()`SELECT month::text AS month, index_usd, index_nok FROM feed_index ORDER BY month`;
    const raw = await sql()`SELECT series, month::text AS month, usd FROM feed_raw WHERE month > now() - interval '30 months' ORDER BY month`;
    return {
      index: (idx as Row[]).map((r) => ({ month: String(r.month), usd: Number(r.index_usd), nok: r.index_nok === null ? null : Number(r.index_nok) })),
      raw: (raw as Row[]).map((r) => ({ series: String(r.series), month: String(r.month), usd: Number(r.usd) })),
    };
  }, { index: [] as { month: string; usd: number; nok: number | null }[], raw: [] as { series: string; month: string; usd: number }[] });

export const getBiomass = () =>
  safe(async () => {
    const rows = await sql()`SELECT month::text AS month, po, name, count_k, tonnes FROM biomass ORDER BY month, po`;
    return (rows as Row[]).map((r) => ({ month: String(r.month), po: Number(r.po), name: String(r.name), count: Number(r.count_k), tonnes: Number(r.tonnes) }));
  }, [] as { month: string; po: number; name: string; count: number; tonnes: number }[]);

export const getFutures = () =>
  safe(async () => {
    const rows = await sql()`SELECT snapshot::text AS snapshot, contract::text AS contract, settle, open_int FROM futures WHERE snapshot = (SELECT max(snapshot) FROM futures) ORDER BY contract`;
    return (rows as Row[]).map((r) => ({ snapshot: String(r.snapshot), contract: String(r.contract), settle: Number(r.settle), oi: r.open_int === null ? null : Number(r.open_int) }));
  }, [] as { snapshot: string; contract: string; settle: number; oi: number | null }[]);

export const getLice = () =>
  safe(async () => {
    const rows = await sql()`SELECT year, week, avg_lice, reported, over_limit, ila, pd, localities FROM lice_week ORDER BY year, week`;
    return (rows as Row[]).map((r) => ({
      year: Number(r.year), week: Number(r.week), avg: r.avg_lice === null ? null : Number(r.avg_lice), reported: Number(r.reported),
      over: Number(r.over_limit), ila: Number(r.ila), pd: Number(r.pd), localities: Number(r.localities),
    }));
  }, [] as { year: number; week: number; avg: number | null; reported: number; over: number; ila: number; pd: number; localities: number }[]);

export type NewsItem = {
  id: string; title: string; url: string; source: string; published: string;
  lead: string; ai: boolean; category: string; companies: string[]; hasBody: boolean;
};

const newsRow = (r: Row): NewsItem => ({
  id: String(r.id), title: String(r.title), url: String(r.final_url || r.url || ""), source: String(r.source ?? ""),
  published: r.published ? new Date(r.published as string).toISOString() : "",
  lead: String(r.lead ?? ""), ai: Boolean(r.summary_present), category: String(r.category ?? "Marked"),
  companies: (r.companies as string[] | null) ?? [], hasBody: Boolean(r.has_body),
});

export const getNews = (limit = 300) =>
  safe(async () => {
    const rows = await sql()`SELECT id, title, url, final_url, source, published, category, companies,
      summary IS NOT NULL AS summary_present, body IS NOT NULL AS has_body,
      coalesce(summary, left(coalesce(nullif(excerpt, ''), body, ''), 420)) AS lead
      FROM news WHERE body_status IS DISTINCT FROM 'blocked' AND published > now() - interval '7 days'
      ORDER BY published DESC NULLS LAST LIMIT ${limit}`;
    return (rows as Row[]).map(newsRow);
  }, [] as NewsItem[]);

export type NewsFull = NewsItem & { body: string | null; bodyStatus: string | null; excerpt: string; summary: string | null; image: string | null; feed: string };

export const getNewsItem = (id: string) =>
  safe(async () => {
    const rows = await sql()`SELECT id, title, url, final_url, source, published, category, companies, summary, excerpt, body, body_status, image, feed,
      summary IS NOT NULL AS summary_present, body IS NOT NULL AS has_body, coalesce(summary, left(coalesce(nullif(excerpt, ''), body, ''), 420)) AS lead
      FROM news WHERE id = ${id} AND body_status IS DISTINCT FROM 'blocked'`;
    const r = (rows as Row[])[0];
    if (!r) return null;
    return {
      ...newsRow(r), body: r.body ? String(r.body) : null, bodyStatus: r.body_status ? String(r.body_status) : null,
      excerpt: String(r.excerpt ?? ""), summary: r.summary ? String(r.summary) : null, image: r.image ? String(r.image) : null, feed: String(r.feed ?? ""),
    } as NewsFull;
  }, null as NewsFull | null);

export const getBlockedCount = () =>
  safe(async () => {
    const rows = await sql()`SELECT coalesce(sum(n),0)::int AS n FROM news_blocked WHERE day > now() - interval '30 days'`;
    return Number((rows as Row[])[0]?.n ?? 0);
  }, 0);

export type LiceCo = { year: number; week: number; symbol: string; localities: number; reported: number; avg: number | null; avgW: number | null; over: number; ila: number; pd: number };

export const getLiceCompanies = (symbol?: string) =>
  safe(async () => {
    const rows = symbol
      ? await sql()`SELECT * FROM lice_company WHERE symbol = ${symbol} ORDER BY year, week`
      : await sql()`SELECT * FROM lice_company ORDER BY year, week`;
    return (rows as Row[]).map((r) => ({
      year: Number(r.year), week: Number(r.week), symbol: String(r.symbol), localities: Number(r.localities), reported: Number(r.reported),
      avg: r.avg_lice === null ? null : Number(r.avg_lice), avgW: r.avg_w === null ? null : Number(r.avg_w),
      over: Number(r.over_limit), ila: Number(r.ila), pd: Number(r.pd),
    }));
  }, [] as LiceCo[]);

export type Announcement = { id: number; symbol: string; title: string; kind: string; category: string; published: string; attachments: number };

export const getAnnouncements = (symbol?: string, limit = 60) =>
  safe(async () => {
    const rows = symbol
      ? await sql()`SELECT id, symbol, title, kind, category, published, attachments FROM announcements WHERE symbol = ${symbol} ORDER BY published DESC LIMIT ${limit}`
      : await sql()`SELECT id, symbol, title, kind, category, published, attachments FROM announcements ORDER BY published DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({
      id: Number(r.id), symbol: String(r.symbol), title: String(r.title), kind: String(r.kind ?? "Annet"), category: String(r.category ?? ""),
      published: r.published ? new Date(r.published as string).toISOString() : "", attachments: Number(r.attachments ?? 0),
    }));
  }, [] as Announcement[]);

export const getAnnouncement = (id: number) =>
  safe(async () => {
    const rows = await sql()`SELECT id, symbol, title, kind, category, published, attachments, body FROM announcements WHERE id = ${id}`;
    const r = (rows as Row[])[0];
    if (!r) return null;
    return {
      id: Number(r.id), symbol: String(r.symbol), title: String(r.title), kind: String(r.kind ?? "Annet"), category: String(r.category ?? ""),
      published: r.published ? new Date(r.published as string).toISOString() : "", attachments: Number(r.attachments ?? 0), body: String(r.body ?? ""),
    };
  }, null as (Announcement & { body: string }) | null);

type Est = { avg?: number | null; low?: number | null; high?: number | null; numberOfAnalysts?: number | null; yearAgoEps?: number | null; yearAgoRevenue?: number | null; growth?: number | null; currency?: string };
export type Fundamentals = {
  fetched: string;
  info: { marketCap?: number | null; enterpriseValue?: number | null; fullTimeEmployees?: number | null; currency?: string; financialCurrency?: string; trailingPE?: number | null; forwardPE?: number | null; dividendYield?: number | null; sharesOutstanding?: number | null };
  eps: Record<string, Est>;
  revenue: Record<string, Est>;
  eps_trend: Record<string, Record<string, number | null>>;
  quarters: { end: string; revenue: number | null; ebit: number | null; net: number | null; eps: number | null }[];
  next_report: { date: string; eps_estimate: number | null } | null;
};

export const getFundamentals = (symbol: string) =>
  safe(async () => {
    const rows = await sql()`SELECT data, updated_at FROM fundamentals WHERE symbol = ${symbol}`;
    const r = (rows as Row[])[0];
    return r ? { ...(r.data as Fundamentals), updated: String(r.updated_at) } : null;
  }, null as (Fundamentals & { updated: string }) | null);
