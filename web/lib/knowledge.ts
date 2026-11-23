import { sql } from "@/lib/db";

// Kunnskapsbanken: notater den lokale KI-modellen har skrevet (se collectors/knowledge.py).
export type Note = { id: number; url: string; kind: string; topic: string; title: string; body: string; source: string; link: string | null;
  model: string; created: string; symbols: string[]; unverified: number };

const LIMIT_MB = Number(process.env.DB_LIMIT_MB ?? 1024); // Neon Free: 1 GB per prosjekt
export const CAP = 0.8;

/** Gjør fritekst om til et OR-søk for Postgres (bare bokstaver og tall, så ingen spesialtegn slipper gjennom). */
export function toQuery(text: string): string {
  const words = (text.toLowerCase().match(/[a-zæøå][a-zæøå0-9]{2,}/g) ?? []).slice(0, 40);
  return [...new Set(words)].join(" | ");
}

type Row = Record<string, unknown>;
const toNote = (r: Row): Note => {
  const facts = (r.facts ?? {}) as { link?: string };
  return {
    id: Number(r.id), url: String(r.url), kind: String(r.kind), topic: String(r.topic ?? ""), title: String(r.title), body: String(r.body),
    source: String(r.source_title ?? ""), link: facts.link ?? null, model: String(r.model ?? ""), created: new Date(String(r.created_at)).toISOString(),
    symbols: (r.symbols as string[] | null) ?? [], unverified: Number(r.unverified ?? 0),
  };
};

export async function searchKnowledge(text: string, limit = 6, kind?: string): Promise<Note[]> {
  const q = toQuery(text);
  try {
    const rows = q
      ? await sql()`SELECT k.*, ts_rank_cd(k.tsv, q) AS rank FROM knowledge k, to_tsquery('norwegian', ${q}) q
          WHERE k.tsv @@ q AND (${kind ?? null}::text IS NULL OR k.kind = ${kind ?? null}) ORDER BY rank DESC, k.created_at DESC LIMIT ${limit}`
      : await sql()`SELECT * FROM knowledge WHERE (${kind ?? null}::text IS NULL OR kind = ${kind ?? null}) ORDER BY created_at DESC LIMIT ${limit}`;
    return (rows as Row[]).map(toNote);
  } catch {
    return [];
  }
}

export async function knowledgeStats() {
  try {
    const db = sql();
    const [kinds, srcs, size] = await Promise.all([
      db`SELECT kind, count(*)::int AS n FROM knowledge GROUP BY kind ORDER BY n DESC`,
      db`SELECT status, count(*)::int AS n FROM kb_sources GROUP BY status`,
      db`SELECT pg_database_size(current_database())::float AS db, (coalesce(pg_total_relation_size('knowledge'),0) + coalesce(pg_total_relation_size('kb_sources'),0))::float AS kb,
           (SELECT max(created_at) FROM knowledge) AS last`,
    ]);
    const s = (size as Row[])[0];
    return {
      kinds: (kinds as Row[]).map((r) => ({ kind: String(r.kind), n: Number(r.n) })),
      sources: Object.fromEntries((srcs as Row[]).map((r) => [String(r.status), Number(r.n)])) as Record<string, number>,
      dbBytes: Number(s.db), kbBytes: Number(s.kb), limitBytes: LIMIT_MB * 1024 * 1024, last: s.last ? new Date(String(s.last)).toISOString() : null,
    };
  } catch {
    return null;
  }
}
