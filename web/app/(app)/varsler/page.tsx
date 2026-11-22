import Link from "next/link";
import { getAlerts } from "@/lib/db";
import { COMPANIES } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function Varsler() {
  const alerts = await getAlerts(200);
  const name = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c]));
  return (
    <section className="panel" aria-labelledby="h-varsler">
      <div className="ph"><h2 id="h-varsler">Varsler</h2><span className="src">Siste 120 dager · oransje = viktig</span></div>
      {alerts.length === 0 ? <div className="empty">Ingen varsler ennå. De lages automatisk ved hver henting.</div> : alerts.map((a) => (
        <div key={a.key} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline", flexWrap: "wrap" }}>
          <span className="m src" style={{ minWidth: 110 }}>{new Date(a.created).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" })}</span>
          <span className="chip">{a.kind}</span>
          <span style={{ flex: "1 1 320px" }}>
            {a.url ? <Link href={a.url} style={{ color: a.level >= 2 ? "#FFB08F" : "var(--text)" }}>{a.title}</Link> : <span style={{ color: a.level >= 2 ? "#FFB08F" : undefined }}>{a.title}</span>}
            {a.body && <div className="src">{a.body}</div>}
          </span>
          {a.symbol && name[a.symbol] && <Link href={`/selskap/${name[a.symbol].id}`} className="src">{name[a.symbol].name} →</Link>}
        </div>
      ))}
      <p className="note">
        Reglene: nye rapporter, trading updates, utbytte og innsidehandel; kursendring på minst 6 % på en dag; fraktfutures ±10 % på en uke;
        containerrater ±8 % på en uke; trafikk i et viktig sund minst 30 % unna snittet; shortandel endret minst 1 prosentpoeng.
        Varslene beskriver hva som har skjedd, de er ikke råd.
      </p>
    </section>
  );
}
