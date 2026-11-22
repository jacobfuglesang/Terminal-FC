import Link from "next/link";
import { getAllFundamentals, getAnnouncements } from "@/lib/db";
import { COMPANIES } from "@/lib/universe";

export const dynamic = "force-dynamic";

type Ev = { date: string; who: string; id?: string; title: string; kind: "Rapport" | "Utbytte" | "Data"; note?: string };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
function daysUntil(iso: string) {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }) + "T12:00:00Z");
  return Math.round((new Date(`${iso}T12:00:00Z`).getTime() - today.getTime()) / 86400000);
}

// Faste datautgivelser som påvirker shipping
function dataEvents(days = 35): Ev[] {
  const out: Ev[] = [];
  const start = new Date();
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (wd === 3) out.push({ date: iso, who: "EIA", title: "USAs oljelagre (uke)", kind: "Data", note: "Kl. 16.30 norsk tid" });
    if (wd === 4) out.push({ date: iso, who: "Drewry", title: "World Container Index", kind: "Data" });
    if (wd === 5) out.push({ date: iso, who: "Shanghai", title: "SCFI containerrater", kind: "Data" });
    if (wd === 2) out.push({ date: iso, who: "IMF PortWatch", title: "Ny uke med trafikkdata for sundene", kind: "Data", note: "Omtrent" });
  }
  return out;
}

export default async function Kalender() {
  const [funds, ann] = await Promise.all([getAllFundamentals(), getAnnouncements(undefined, 120)]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const evs: Ev[] = [];
  for (const c of COMPANIES) {
    const f = funds[c.symbol];
    if (f?.next_report?.date && f.next_report.date >= today) {
      evs.push({ date: f.next_report.date, who: c.name, id: c.id, title: "Kvartalsrapport", kind: "Rapport", note: f.next_report.eps_estimate !== null && f.next_report.eps_estimate !== undefined ? `Ventet resultat per aksje ${String(f.next_report.eps_estimate).replace(".", ",")} ${f.info?.financialCurrency ?? ""}` : undefined });
    }
    if (f?.ex_dividend && f.ex_dividend >= today) evs.push({ date: f.ex_dividend, who: c.name, id: c.id, title: "Eks-utbyttedag", kind: "Utbytte" });
  }
  const all = [...evs, ...dataEvents()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const recent = ann.filter((a) => ["Rapport", "Trading update", "Kalender"].includes(a.kind)).slice(0, 25);
  const name = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c]));

  return (
    <>
      <section className="panel" aria-labelledby="h-kal">
        <div className="ph"><h2 id="h-kal">Kommende</h2><span className="src">Rapportdatoer og eks-utbytte fra Yahoo Finance · faste datautgivelser</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 620 }}>
            <thead><tr><th>Dato</th><th>Om</th><th>Hvem</th><th>Hendelse</th></tr></thead>
            <tbody>
              {all.map((e, i) => {
                const d = daysUntil(e.date);
                return (
                  <tr key={i} style={{ opacity: e.kind === "Data" ? 0.75 : 1 }}>
                    <td className="m" style={{ whiteSpace: "nowrap" }}>{dayLabel(e.date)}</td>
                    <td className="m" style={{ color: "#A0A7B2", whiteSpace: "nowrap" }}>{d === 0 ? "i dag" : d === 1 ? "i morgen" : `${d} d`}</td>
                    <td>{e.id ? <Link href={`/selskap/${e.id}`}>{e.who}</Link> : <span className="src">{e.who}</span>}</td>
                    <td>
                      <span className="chip" style={{ color: e.kind === "Rapport" ? "var(--accent)" : e.kind === "Utbytte" ? "#7BE3A6" : undefined, marginRight: 8 }}>{e.kind}</span>
                      {e.title}
                      {e.note && <div className="src">{e.note}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">Datoene fra Yahoo stemmer som regel med selskapenes egne finanskalendere, men sjekk børsmeldingene under når en dato nærmer seg.</p>
      </section>

      <section className="panel" aria-labelledby="h-siste">
        <div className="ph"><h2 id="h-siste">Siste rapporter, trading updates og finanskalendere</h2><span className="src">Oslo Børs Newsweb</span></div>
        {recent.length === 0 ? <div className="empty">Børsmeldingene hentes ved neste kjøring.</div> : recent.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="m src" style={{ minWidth: 92 }}>{new Date(a.published).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" })}</span>
            <span className="chip">{name[a.symbol]?.name ?? a.symbol}</span>
            <span className="chip" style={{ color: "var(--accent)" }}>{a.kind}</span>
            <Link href={`/melding/${a.id}`} style={{ color: "var(--text)", flex: "1 1 300px" }}>{a.title}</Link>
          </div>
        ))}
      </section>
    </>
  );
}
