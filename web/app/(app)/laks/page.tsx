import TimeChart from "@/components/TimeChart";
import { getFeed, getFutures, getQuotes, getSalmon } from "@/lib/db";
import { monthLabel, weekDate } from "@/lib/dates";
import { fmt, pct, up } from "@/lib/format";

export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { PFISHUSDM: "Fiskemel", PSMEAUSDM: "Soyamel", PROILUSDM: "Rapsolje", PWHEAMTUSDM: "Hvete" };
const WEIGHTS: Record<string, string> = { PFISHUSDM: "35 %", PSMEAUSDM: "30 %", PROILUSDM: "20 %", PWHEAMTUSDM: "15 %" };

export default async function Laks() {
  const [salmon, feed, fut, quotes] = await Promise.all([getSalmon(520), getFeed(), getFutures(), getQuotes()]);
  const pts = salmon.filter((s) => s.fresh_price);
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const yearAgo = pts.find((s) => last && s.year === last.year - 1 && s.week === last.week);
  const eur = quotes.find((q) => q.symbol === "EURNOK=X")?.price ?? null;
  const fi = feed.index;
  const fl = fi[fi.length - 1];
  const fp = fi[fi.length - 2];
  const fy = fi.find((f) => fl && f.month === `${Number(fl.month.slice(0, 4)) - 1}${fl.month.slice(4)}`);
  const comps = Object.keys(NAMES).map((s) => {
    const r = feed.raw.filter((x) => x.series === s);
    const a = r[r.length - 1], b = r[r.length - 2];
    return { s, name: NAMES[s], w: WEIGHTS[s], usd: a?.usd, ch: a && b ? (a.usd / b.usd - 1) * 100 : null, month: a?.month };
  });
  const maxSettle = Math.max(...fut.map((f) => f.settle), 1);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="l">SSB eksportpris {last ? `uke ${last.week}` : ""}</div><div className="v m">{fmt(last?.fresh_price)} kr/kg</div><div className={`d m ${up(last && prev ? last.fresh_price! - prev.fresh_price! : 0) ? "upc" : "downc"}`}>{last && prev ? `${pct((last.fresh_price! / prev.fresh_price! - 1) * 100)} fra uke ${prev.week}` : "–"}</div></div>
        <div className="kpi"><div className="l">Samme uke i fjor</div><div className="v m">{fmt(yearAgo?.fresh_price)} kr/kg</div><div className={`d m ${up(last && yearAgo ? last.fresh_price! - yearAgo.fresh_price! : 0) ? "upc" : "downc"}`}>{last && yearAgo ? `${pct((last.fresh_price! / yearAgo.fresh_price! - 1) * 100)} mot i fjor` : "–"}</div></div>
        <div className="kpi"><div className="l">Nærmeste termin ({fut[0] ? monthLabel(fut[0].contract) : "–"})</div><div className="v m">{fut[0] ? fmt(fut[0].settle / 1000, 2) : "–"} €/kg</div><div className="d m" style={{ color: "#A0A7B2" }}>{fut[0] && eur ? `≈ ${fmt((fut[0].settle / 1000) * eur, 1)} kr/kg` : ""}</div></div>
        <div className="kpi"><div className="l">Fôrråvareindeks {fl ? monthLabel(fl.month) : ""}</div><div className="v m">{fmt(fl?.nok ?? fl?.usd, 1)}</div><div className={`d m ${fl && fp && (fl.nok ?? fl.usd) >= (fp.nok ?? fp.usd) ? "downc" : "upc"}`}>{fl && fp ? `${pct(((fl.nok ?? fl.usd) / (fp.nok ?? fp.usd) - 1) * 100)} m/m` : "–"}</div></div>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-pris">
          <div className="ph"><h2 id="h-pris">Laksepris per uke</h2><span className="src">SSB tabell 03024 · kr/kg fersk laks · CC BY 4.0</span></div>
          <TimeChart daily={pts.map((s) => ({ t: weekDate(s.year, s.week), v: s.fresh_price as number }))} periods={["1M", "3M", "6M", "1Å"]} initial="1Å" />
        </section>
        <section className="panel" style={{ flex: "1 1 360px" }} aria-labelledby="h-volum">
          <div className="ph"><h2 id="h-volum">Eksportert mengde</h2><span className="src">Tonn fersk laks per uke</span></div>
          <TimeChart daily={salmon.filter((s) => s.fresh_tonnes).map((s) => ({ t: weekDate(s.year, s.week), v: s.fresh_tonnes as number }))} periods={["1M", "3M", "6M", "1Å"]} initial="6M" color="#4FD1C5" decimals={0} height={180} />
        </section>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-term">
          <div className="ph"><h2 id="h-term">Terminkurve</h2><span className="src">Euronext Salmon Futures · oppgjørspris · {fut[0]?.snapshot ?? "–"}</span></div>
          {fut.length === 0 ? <div className="empty">Ingen terminpriser ennå.</div> : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 200, padding: 8, background: "#0F1114", borderRadius: 6 }}>
                {fut.slice(0, 18).map((f, i) => (
                  <div key={f.contract} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                    <span className="m" style={{ fontSize: 9, color: "#A0A7B2" }}>{fmt(f.settle / 1000, 2)}</span>
                    <div style={{ width: "100%", height: `${Math.max(4, ((f.settle - 5000) / (maxSettle - 5000)) * 100)}%`, background: i === 0 ? "#FF8A5B" : "#3A3F48", borderRadius: "3px 3px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, padding: "6px 8px 0" }}>
                {fut.slice(0, 18).map((f) => <div key={f.contract} className="m" style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#8A919C" }}>{new Intl.DateTimeFormat("nb-NO", { month: "short", timeZone: "UTC" }).format(new Date(f.contract))}<br />{f.contract.slice(2, 4)}</div>)}
              </div>
              <p className="note">€/kg per leveringsmåned. Viser hva markedet priser inn framover, ikke en fasit.</p>
            </>
          )}
        </section>
        <section className="panel" style={{ flex: "1 1 360px" }} aria-labelledby="h-for">
          <div className="ph"><h2 id="h-for">Fôrråvareindeks</h2><span className="src">IMF via FRED · jan 2026 = 100</span></div>
          <TimeChart daily={fi.map((f) => ({ t: `${f.month}T00:00:00Z`, v: f.nok ?? f.usd }))} periods={["6M", "1Å"]} initial="1Å" color="#FF6B6B" height={150} />
          <table className="tbl" style={{ marginTop: 12 }}>
            <thead><tr><th>Råvare</th><th>Vekt</th><th>USD/tonn</th><th>Mnd.</th></tr></thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.s}><td>{c.name}</td><td className="m" style={{ color: "#8A919C" }}>{c.w}</td><td className="m">{fmt(c.usd, 0)}</td><td className={`m ${c.ch !== null && c.ch > 0 ? "downc" : "upc"}`}>{pct(c.ch)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="note">En tilnærming til fôrprisen, ikke den faktiske prisen. Rødt = dyrere fôr. Fiskeolje finnes ikke i IMF-dataene. {fy && fl ? `Endring siste år: ${pct(((fl.nok ?? fl.usd) / (fy.nok ?? fy.usd) - 1) * 100)}.` : ""}</p>
        </section>
      </div>
    </>
  );
}
