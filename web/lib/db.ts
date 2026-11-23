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
  currency: string | null;
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
      currency: r.currency ? String(r.currency) : null,
    }));
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

export const getAllDaily = (symbols?: string[]) =>
  safe(async () => {
    const rows = symbols
      ? await sql()`SELECT symbol, day::text AS day, close FROM price_daily WHERE symbol = ANY(${symbols}) AND day > now() - interval '760 days' ORDER BY day`
      : await sql()`SELECT symbol, day::text AS day, close FROM price_daily WHERE day > now() - interval '760 days' ORDER BY day`;
    const out: Record<string, { t: string; v: number }[]> = {};
    for (const r of rows as Row[]) (out[String(r.symbol)] ||= []).push({ t: `${r.day}T16:00:00Z`, v: Number(r.close) });
    return out;
  }, {} as Record<string, { t: string; v: number }[]>);

export const getShorts = () =>
  safe(async () => {
    const rows = await sql()`SELECT symbol, day::text AS day, pct, holders FROM shorts WHERE day > now() - interval '760 days' ORDER BY day`;
    return (rows as Row[]).map((r) => ({ symbol: String(r.symbol), day: String(r.day), pct: Number(r.pct), holders: Number(r.holders) }));
  }, [] as { symbol: string; day: string; pct: number; holders: number }[]);

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
  dividends?: { date: string; value: number | null }[];
  ex_dividend?: string | null;
};

export const getFundamentals = (symbol: string) =>
  safe(async () => {
    const rows = await sql()`SELECT data, updated_at FROM fundamentals WHERE symbol = ${symbol}`;
    const r = (rows as Row[])[0];
    return r ? { ...(r.data as Fundamentals), updated: String(r.updated_at) } : null;
  }, null as (Fundamentals & { updated: string }) | null);

export const getAllFundamentals = () =>
  safe(async () => {
    const rows = await sql()`SELECT symbol, data, updated_at FROM fundamentals`;
    return Object.fromEntries((rows as Row[]).map((r) => [String(r.symbol), { ...(r.data as Fundamentals), updated: String(r.updated_at) }]));
  }, {} as Record<string, Fundamentals & { updated: string }>);

export type FreightPt = { series: string; day: string; value: number; note: string | null };

export const getFreight = (series?: string[]) =>
  safe(async () => {
    const rows = series
      ? await sql()`SELECT series, day::text AS day, value, note FROM freight WHERE series = ANY(${series}) AND day > now() - interval '800 days' ORDER BY day`
      : await sql()`SELECT series, day::text AS day, value, note FROM freight WHERE day > now() - interval '800 days' ORDER BY day`;
    const out: Record<string, FreightPt[]> = {};
    for (const r of rows as Row[]) (out[String(r.series)] ||= []).push({ series: String(r.series), day: String(r.day), value: Number(r.value), note: r.note ? String(r.note) : null });
    return out;
  }, {} as Record<string, FreightPt[]>);

export type Choke = { day: string; portid: string; name: string; total: number; tanker: number; container: number; bulk: number; capacity: number };

export const getChokepoints = (days = 800) =>
  safe(async () => {
    const rows = await sql()`SELECT day::text AS day, portid, name, n_total, n_tanker, n_container, n_dry_bulk, capacity
      FROM chokepoints WHERE day > now() - make_interval(days => ${days}) ORDER BY day`;
    return (rows as Row[]).map((r) => ({
      day: String(r.day), portid: String(r.portid), name: String(r.name), total: Number(r.n_total ?? 0), tanker: Number(r.n_tanker ?? 0),
      container: Number(r.n_container ?? 0), bulk: Number(r.n_dry_bulk ?? 0), capacity: Number(r.capacity ?? 0),
    }));
  }, [] as Choke[]);

export type AisPos = { mmsi: number; name: string; lat: number; lon: number; sog: number | null; zone: string; kind: string; seen: string };

export const getAis = () =>
  safe(async () => {
    const rows = await sql()`SELECT mmsi, name, lat, lon, sog, zone, kind, seen FROM ais_positions WHERE seen > now() - interval '36 hours'`;
    return (rows as Row[]).map((r) => ({
      mmsi: Number(r.mmsi), name: String(r.name ?? ""), lat: Number(r.lat), lon: Number(r.lon), sog: r.sog === null ? null : Number(r.sog),
      zone: String(r.zone ?? ""), kind: String(r.kind ?? "ukjent"), seen: new Date(String(r.seen)).toISOString(),
    }));
  }, [] as AisPos[]);

export const getAisZones = () =>
  safe(async () => {
    const rows = await sql()`SELECT ts, zone, total, tankers, cargo FROM ais_zone WHERE ts = (SELECT max(ts) FROM ais_zone) ORDER BY zone`;
    return (rows as Row[]).map((r) => ({ ts: new Date(String(r.ts)).toISOString(), zone: String(r.zone), total: Number(r.total), tankers: Number(r.tankers), cargo: Number(r.cargo) }));
  }, [] as { ts: string; zone: string; total: number; tankers: number; cargo: number }[]);

export type Alert = { key: string; kind: string; symbol: string | null; title: string; body: string; url: string | null; level: number; created: string };

export const getAlerts = (limit = 100) =>
  safe(async () => {
    const rows = await sql()`SELECT key, kind, symbol, title, body, url, level, created_at FROM alerts ORDER BY created_at DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({
      key: String(r.key), kind: String(r.kind ?? ""), symbol: r.symbol ? String(r.symbol) : null, title: String(r.title), body: String(r.body ?? ""),
      url: r.url ? String(r.url) : null, level: Number(r.level ?? 1), created: new Date(String(r.created_at)).toISOString(),
    }));
  }, [] as Alert[]);

export type Brief = { day: string; text: string; model: string; snapshot: string; created: string };

export const getBriefs = (limit = 14) =>
  safe(async () => {
    const rows = await sql()`SELECT day::text AS day, text, model, snapshot, created_at FROM briefs WHERE text <> '' ORDER BY day DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({ day: String(r.day), text: String(r.text), model: String(r.model ?? ""), snapshot: String(r.snapshot ?? ""), created: new Date(String(r.created_at)).toISOString() }));
  }, [] as Brief[]);

// ---- KI-rapportleser
export type RepNum = { label?: string; value?: number | null; unit?: string; period?: string; value_ok?: boolean };
export type RepRate = { segment?: string; rate?: number | null; unit?: string; period?: string; note?: string; share_pct?: number | null; rate_ok?: boolean; share_pct_ok?: boolean };
export type ReportData = {
  period?: string; headline?: string; tone?: string; summary?: string[]; numbers?: RepNum[]; tce?: RepRate[]; bookings?: RepRate[];
  breakeven?: RepRate[]; dividend?: { per_share?: number | null; unit?: string; note?: string; per_share_ok?: boolean } | null;
  balance?: RepNum[]; fleet?: string | null; outlook?: string | null; watch?: string[];
  check?: { checked: number; unverified: number }; files?: { name: string; url: string }[];
};
export type Report = {
  key: string; symbol: string; period: string; published: string; title: string; messageIds: number[];
  status: string; data: ReportData | null; model: string; error: string | null; updated: string;
};

export const getReports = (opts: { symbol?: string; limit?: number; all?: boolean } = {}) =>
  safe(async () => {
    const limit = opts.limit ?? 60;
    const rows = opts.symbol
      ? await sql()`SELECT * FROM reports WHERE symbol = ${opts.symbol} ORDER BY published DESC LIMIT ${limit}`
      : await sql()`SELECT * FROM reports ORDER BY published DESC LIMIT ${limit}`;
    return (rows as Row[])
      .filter((r) => opts.all || r.status === "ok")
      .map((r) => ({
        key: String(r.key), symbol: String(r.symbol), period: String(r.period), published: new Date(String(r.published)).toISOString(),
        title: String(r.title ?? ""), messageIds: ((r.message_ids as number[] | null) ?? []).map(Number), status: String(r.status),
        data: (r.data as ReportData | null) ?? null, model: String(r.model ?? ""), error: r.error ? String(r.error) : null,
        updated: new Date(String(r.updated_at)).toISOString(),
      }));
  }, [] as Report[]);

export const getReportQueue = () =>
  safe(async () => {
    const rows = await sql()`SELECT status, count(*)::int AS n FROM reports GROUP BY status`;
    return Object.fromEntries((rows as Row[]).map((r) => [String(r.status), Number(r.n)])) as Record<string, number>;
  }, {} as Record<string, number>);

// ---- Kø og trengsel: AIS-tellinger per område (siste snapshot + snitt siste 7 dager)
export type ZoneStat = { zone: string; ts: string; total: number; tank: number; last: number; still: number; stillTank: number; stillLast: number;
  avgTotal7: number | null; avgStill7: number | null };
export const getZoneStats = () =>
  safe(async () => {
    const rows = await sql()`
      WITH last AS (SELECT max(ts) AS ts FROM ais_zone),
      cur AS (SELECT z.* FROM ais_zone z, last WHERE z.ts = last.ts),
      hist AS (SELECT zone, avg(total)::float AS a_total, avg(still)::float AS a_still FROM ais_zone
               WHERE ts > now() - interval '7 days' AND still IS NOT NULL GROUP BY zone)
      SELECT cur.*, hist.a_total, hist.a_still FROM cur LEFT JOIN hist USING (zone) ORDER BY cur.total DESC`;
    return (rows as Row[]).map((r) => ({
      zone: String(r.zone), ts: new Date(String(r.ts)).toISOString(), total: Number(r.total ?? 0), tank: Number(r.tankers ?? 0), last: Number(r.cargo ?? 0),
      still: Number(r.still ?? 0), stillTank: Number(r.still_tank ?? 0), stillLast: Number(r.still_last ?? 0),
      avgTotal7: r.a_total === null ? null : Number(r.a_total), avgStill7: r.a_still === null ? null : Number(r.a_still),
    }));
  }, [] as ZoneStat[]);

export type PortDay = { day: string; portid: string; portname: string; country: string; calls: number; tanker: number; bulk: number; container: number;
  imp: number; exp: number };
export const getPortActivity = (days = 420) =>
  safe(async () => {
    const rows = await sql()`SELECT day::text AS day, portid, portname, country, calls, calls_tanker, calls_dry_bulk, calls_container, import, export
      FROM port_activity WHERE day > now() - make_interval(days => ${days}) ORDER BY day`;
    return (rows as Row[]).map((r) => ({
      day: String(r.day), portid: String(r.portid), portname: String(r.portname ?? ""), country: String(r.country ?? ""),
      calls: Number(r.calls ?? 0), tanker: Number(r.calls_tanker ?? 0), bulk: Number(r.calls_dry_bulk ?? 0), container: Number(r.calls_container ?? 0),
      imp: Number(r.import ?? 0), exp: Number(r.export ?? 0),
    }));
  }, [] as PortDay[]);

// ---- Bunkers
export type BunkerRow = { day: string; port: string; grade: string; price: number; change: number | null };
export const getBunkers = (days = 400) =>
  safe(async () => {
    const rows = await sql()`SELECT day::text AS day, port, grade, price, change FROM bunkers WHERE day > now() - make_interval(days => ${days}) ORDER BY day`;
    return (rows as Row[]).map((r) => ({ day: String(r.day), port: String(r.port), grade: String(r.grade), price: Number(r.price),
      change: r.change === null ? null : Number(r.change) }));
  }, [] as BunkerRow[]);

// ---- Vær
export type Storm = { id: string; name: string; alert: string; country: string; lat: number; lon: number; from: string; to: string;
  near: string | null; nearKm: number | null; url: string | null };
export const getStorms = () =>
  safe(async () => {
    const rows = await sql()`SELECT * FROM weather_events WHERE to_date > now() - interval '30 days' ORDER BY to_date DESC`;
    return (rows as Row[]).map((r) => ({
      id: String(r.id), name: String(r.name ?? ""), alert: String(r.alert ?? ""), country: String(r.country ?? ""), lat: Number(r.lat), lon: Number(r.lon),
      from: new Date(String(r.from_date)).toISOString(), to: new Date(String(r.to_date)).toISOString(), near: r.near ? String(r.near) : null,
      nearKm: r.near_km === null ? null : Number(r.near_km), url: r.url ? String(r.url) : null,
    }));
  }, [] as Storm[]);

export type PanamaDay = { day: string; gatun: number; neo: number; panamax: number; surcharge: number | null };
export const getPanama = (days = 800) =>
  safe(async () => {
    const rows = await sql()`SELECT day::text AS day, gatun_ft, draft_neo_ft, draft_panamax_ft, surcharge_pct FROM panama
      WHERE day > now() - make_interval(days => ${days}) ORDER BY day`;
    return (rows as Row[]).map((r) => ({ day: String(r.day), gatun: Number(r.gatun_ft), neo: Number(r.draft_neo_ft), panamax: Number(r.draft_panamax_ft),
      surcharge: r.surcharge_pct === null ? null : Number(r.surcharge_pct) }));
  }, [] as PanamaDay[]);

// ---- Meglerrapporter
export type BrokerData = {
  broker?: string; week?: string | null; headline?: string; sentiment?: string; summary?: string[];
  segments?: { segment?: string; direction?: string; comment?: string; rates?: { label?: string; value?: number | null; unit?: string }[] }[];
  sale_purchase?: string | null; newbuilding?: string | null; demolition?: string | null;
};
export type BrokerReport = { url: string; title: string; broker: string; published: string; data: BrokerData; model: string };
export const getBrokerReports = (limit = 80) =>
  safe(async () => {
    const rows = await sql()`SELECT url, title, broker, published, data, model FROM broker_reports WHERE status = 'ok' ORDER BY published DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({ url: String(r.url), title: String(r.title ?? ""), broker: String(r.broker ?? ""),
      published: new Date(String(r.published)).toISOString(), data: (r.data as BrokerData) ?? {}, model: String(r.model ?? "") }));
  }, [] as BrokerReport[]);
