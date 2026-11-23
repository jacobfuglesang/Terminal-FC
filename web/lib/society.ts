import { getAllDaily, sql } from "@/lib/db";

// Samfunnssituasjon: ukens rapport (skrevet lørdager), indikatorer og nyheter om verden.
export type SocietyReport = { week: string; text: string; model: string; created: string; removed: number; sources: string[] };

type Row = Record<string, unknown>;

export async function societyReports(limit = 12): Promise<SocietyReport[]> {
  try {
    const rows = await sql()`SELECT week, text, model, created_at, coalesce(removed, 0) AS removed, sources FROM society_reports ORDER BY week DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({
      week: String(r.week), text: String(r.text), model: String(r.model ?? ""), created: new Date(String(r.created_at)).toISOString(),
      removed: Number(r.removed), sources: (r.sources as string[] | null) ?? [],
    }));
  } catch {
    return [];
  }
}

export const WORLD_RE = "war|krig|iran|israel|hormuz|red sea|rødehavet|houthi|suez|panama|sanction|sanksjon|tariff|toll|trade war|handelskrig|china|kina|russia|russland|ukraine|opec|oil price|oljepris|inflation|interest rate|rentem|recession|resesjon|gdp|venezuela|taiwan|imf|wto|world bank|election|valg";

export type WorldNews = { id: string; title: string; source: string; published: string; lead: string };

export async function worldNews(pattern = WORLD_RE, days = 7, limit = 40): Promise<WorldNews[]> {
  try {
    const rows = await sql()`SELECT id, title, source, published, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 280)) AS lead FROM news
      WHERE published > now() - make_interval(days => ${days}) AND body_status IS DISTINCT FROM 'blocked'
      AND (title ~* ${pattern} OR coalesce(summary, '') ~* ${pattern}) ORDER BY published DESC LIMIT ${limit}`;
    return (rows as Row[]).map((r) => ({ id: String(r.id), title: String(r.title), source: String(r.source ?? ""), published: new Date(String(r.published)).toISOString(), lead: String(r.lead ?? "") }));
  } catch {
    return [];
  }
}

export type Indicator = { sym: string; label: string; unit: string; last: number | null; d7: number | null; d30: number | null; series: number[] };

export const INDICATORS: { sym: string; label: string; unit: string; group: string }[] = [
  { sym: "BZ=F", label: "Brent", unit: "USD/fat", group: "energi" },
  { sym: "CL=F", label: "WTI", unit: "USD/fat", group: "energi" },
  { sym: "TTF=F", label: "Gass Europa (TTF)", unit: "EUR/MWh", group: "energi" },
  { sym: "JKM=F", label: "LNG Asia (JKM)", unit: "USD/MMBtu", group: "energi" },
  { sym: "NG=F", label: "Gass USA (Henry Hub)", unit: "USD/MMBtu", group: "energi" },
  { sym: "TIO=F", label: "Jernmalm", unit: "USD/tonn", group: "råvarer" },
  { sym: "HG=F", label: "Kobber", unit: "USD/lb", group: "råvarer" },
  { sym: "ZS=F", label: "Soyabønner", unit: "USc/bu", group: "råvarer" },
  { sym: "NOK=X", label: "USD/NOK", unit: "kr", group: "økonomi" },
  { sym: "EURUSD=X", label: "EUR/USD", unit: "", group: "økonomi" },
  { sym: "OSEBX.OL", label: "Oslo Børs (OSEBX)", unit: "poeng", group: "økonomi" },
  { sym: "BWET", label: "Tankfrakt (BWET)", unit: "USD", group: "shipping" },
  { sym: "BDRY", label: "Tørrbulkfrakt (BDRY)", unit: "USD", group: "shipping" },
];

export async function indicators(group?: string): Promise<Indicator[]> {
  const list = INDICATORS.filter((i) => !group || i.group === group);
  const daily = await getAllDaily(list.map((i) => i.sym));
  return list.map((i) => {
    const pts = daily[i.sym] ?? [];
    const last = pts.length ? pts[pts.length - 1] : null;
    const back = (days: number) => {
      if (!last) return null;
      const t = new Date(last.t).getTime() - days * 864e5;
      const ref = [...pts].reverse().find((p) => new Date(p.t).getTime() <= t);
      return ref && ref.v ? last.v / ref.v - 1 : null;
    };
    return { sym: i.sym, label: i.label, unit: i.unit, last: last?.v ?? null, d7: back(7), d30: back(30), series: pts.slice(-90).map((p) => p.v) };
  });
}
