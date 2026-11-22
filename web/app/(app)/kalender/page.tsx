import Link from "next/link";
import { getAnnouncements, getFundamentals } from "@/lib/db";
import { EVENTS, marketEvents, type CalEvent } from "@/lib/companies";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

const NAME: Record<string, string> = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c.name]));
const ID: Record<string, string> = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c.id]));

function dayLabel(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });
}
function daysUntil(iso: string) {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) + "T12:00:00Z");
  return Math.round((new Date(`${iso}T12:00:00Z`).getTime() - today.getTime()) / 86400000);
}

export default async function Kalender() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const [ann, ...funds] = await Promise.all([getAnnouncements(undefined, 80), ...COMPANIES.map((c) => getFundamentals(c.symbol))]);
  // Yahoo sin neste rapportdato som kontroll mot våre datoer
  const yahooNext: Record<string, string | undefined> = {};
  COMPANIES.forEach((c, i) => (yahooNext[c.symbol] = funds[i]?.next_report?.date));

  const company = EVENTS.filter((e) => e.date >= today);
  const market = marketEvents(new Date(), 35);
  const all: CalEvent[] = [...company, ...market].sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  const recent = ann.filter((a) => ["Rapport", "Trading update"].includes(a.kind)).slice(0, 20);

  return (
    <>
      <section className="panel" aria-labelledby="h-kal">
        <div className="ph">
          <h2 id="h-kal">Kommende hendelser</h2>
          <span className="src">Selskapenes finanskalendere · markedsdata neste 5 uker</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th>Dato</th><th>Om</th><th>Selskap</th><th>Hendelse</th><th>Status</th></tr></thead>
            <tbody>
              {all.map((e, i) => {
                const d = daysUntil(e.date);
                const y = e.symbol && e.kind === "Rapport" ? yahooNext[e.symbol] : undefined;
                return (
                  <tr key={i} style={{ opacity: e.symbol ? 1 : 0.75 }}>
                    <td className="m" style={{ whiteSpace: "nowrap" }}>{dayLabel(e.date)}</td>
                    <td className="m" style={{ color: "#A0A7B2", whiteSpace: "nowrap" }}>{d === 0 ? "i dag" : d === 1 ? "i morgen" : `${d} d`}</td>
                    <td>{e.symbol ? <Link href={`/selskap/${ID[e.symbol]}`}>{NAME[e.symbol]}</Link> : <span className="src">Marked</span>}</td>
                    <td>
                      {e.title}
                      {e.note && <div className="src">{e.note}</div>}
                      {y && y !== e.date && <div className="src">Yahoo oppgir {dayLabel(y)}</div>}
                    </td>
                    <td>
                      {e.confirmed
                        ? <span className="tag" style={{ background: "#16301F", color: "#7BE3A6" }}>Bekreftet</span>
                        : <span className="tag" style={{ background: "#3A2A12", color: "#F2C94C" }}>Anslått</span>}
                      {e.source && <div><a className="src" href={e.source.url} target="_blank" rel="noopener noreferrer">Kilde ↗</a></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Trading updates er anslått ut fra fjorårets datoer og merket gult til selskapene bekrefter dem. SalMar og Lerøy sender normalt ikke ut egne trading updates.
          Grieg Seafood rapporterer nå halvårlig, med utvidede trading updates etter 1. og 3. kvartal.
        </p>
      </section>

      <section className="panel" aria-labelledby="h-siste">
        <div className="ph">
          <h2 id="h-siste">Siste rapporter og trading updates</h2>
          <span className="src">Oslo Børs Newsweb · hele meldingen kan leses her</span>
        </div>
        {recent.length === 0 ? (
          <div className="empty">Børsmeldingene hentes ved neste kjøring.</div>
        ) : (
          recent.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="m src" style={{ minWidth: 92 }}>{new Date(a.published).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" })}</span>
              <span className="chip">{NAME[a.symbol]}</span>
              <span className="chip" style={{ color: "var(--accent)" }}>{a.kind}</span>
              <Link href={`/melding/${a.id}`} style={{ color: "var(--text)", flex: "1 1 300px" }}>{a.title}</Link>
            </div>
          ))
        )}
      </section>
    </>
  );
}
