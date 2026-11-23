import { sql } from "@/lib/db";

// Lagringsbruk i databasen (Neon gratis: 1 GB per prosjekt). Over grensen stopper all skriving i terminalen.
export const LIMIT_BYTES = Number(process.env.DB_LIMIT_MB ?? 1024) * 1024 * 1024;
export const RESEARCH_CAP = 0.9; // kunnskapsbanken skriver ikke over dette
export const ALARM = 0.92; // lagringsvakten rydder over dette (eldste notater fra lesingen først)

const GROUPS: { id: string; label: string; color: string; tables: RegExp; about: string }[] = [
  { id: "kb", label: "Kunnskapsbank (lørdagslesingen)", color: "#FF8A5B", tables: /^(knowledge|kb_sources|society_reports)$/, about: "Notater, kildeliste og ukens samfunnsrapport. Eldste notater slettes først hvis det blir trangt." },
  { id: "ki", label: "KI-rapporter", color: "#B38CFF", tables: /^(reports|broker_reports|briefs)$/, about: "Kvartalsrapporter og meglerrapporter lest av KI, og morgenrapporter" },
  { id: "kurs", label: "Kurser og nøkkeltall", color: "#3DDC97", tables: /^(price_daily|price_intraday|quotes|fundamentals|shorts)$/, about: "Dagskurser, intradag, nøkkeltall og short" },
  { id: "frakt", label: "Frakt, trafikk og skip", color: "#5BC0FF", tables: /^(freight|chokepoints|port_activity|ais_.*|bunkers|weather_events|panama)$/, about: "Fraktrater, sund, havner, AIS-skip, bunkers og vær" },
  { id: "nyheter", label: "Nyheter og børsmeldinger", color: "#F5C451", tables: /^(news|news_blocked|announcements|alerts)$/, about: "Nyheter (7 dager), børsmeldinger og varsler" },
  { id: "dine", label: "Dine data", color: "#E8EAED", tables: /^(notes|note_folders|pf_trades|booking_inputs|login_guard)$/, about: "Notater, handler og bookingjusteringer. Slettes aldri automatisk." },
];

export type StorageInfo = {
  total: number; limit: number; groups: { id: string; label: string; color: string; about: string; bytes: number; tables: { name: string; bytes: number }[] }[];
  other: number;
};

export async function storageInfo(): Promise<StorageInfo | null> {
  try {
    const db = sql();
    const [size, rows] = await Promise.all([
      db`SELECT pg_database_size(current_database())::float AS b`,
      db`SELECT relname AS name, pg_total_relation_size(relid)::float AS b FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC`,
    ]);
    const total = Number((size as Record<string, unknown>[])[0].b);
    const tables = (rows as Record<string, unknown>[]).map((r) => ({ name: String(r.name), bytes: Number(r.b) }));
    const groups = [...GROUPS, { id: "annet", label: "Annet (status, oppsett)", color: "#8A919C", tables: /.*/, about: "Små tabeller for status og oppsett" }].map((g) => ({
      id: g.id, label: g.label, color: g.color, about: g.about, bytes: 0, tables: [] as { name: string; bytes: number }[],
    }));
    for (const t of tables) {
      const i = GROUPS.findIndex((g) => g.tables.test(t.name));
      const g = groups[i >= 0 ? i : groups.length - 1];
      g.bytes += t.bytes;
      g.tables.push(t);
    }
    const sum = groups.reduce((a, g) => a + g.bytes, 0);
    return { total, limit: LIMIT_BYTES, groups: groups.filter((g) => g.bytes > 0).sort((a, b) => b.bytes - a.bytes), other: Math.max(0, total - sum) };
  } catch {
    return null;
  }
}
