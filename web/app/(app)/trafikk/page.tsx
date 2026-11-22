import AisMap from "@/components/AisMap";
import ChokeExplorer, { type ChokeSeries } from "@/components/ChokeExplorer";
import { getAis, getAisZones, getChokepoints } from "@/lib/db";
import { fmt, osloTime, pct, up } from "@/lib/format";

export const dynamic = "force-dynamic";

const ORDER = ["chokepoint6", "chokepoint1", "chokepoint4", "chokepoint7", "chokepoint2", "chokepoint5", "chokepoint8", "chokepoint3", "chokepoint9", "chokepoint11"];
const WHY: Record<string, string> = {
  chokepoint6: "Rundt en femdel av verdens oljeforbruk passerer her. Viktigst for råoljetank og LPG.",
  chokepoint1: "Korteste vei Asia–Europa. Lav trafikk betyr lengre seilas rundt Afrika og mer tonnmil.",
  chokepoint4: "Inngangen til Rødehavet. Angrep her flytter trafikken til Kapp det gode håp.",
  chokepoint7: "Omveien rundt Afrika. Høy trafikk her = lengre reiser = flere skip bundet opp.",
  chokepoint2: "USA–Asia for LPG, korn og container. Lav vannstand begrenser trafikken.",
  chokepoint5: "Hovedåren for olje og varer inn til Kina, Japan og Korea.",
  chokepoint8: "Middelhavet–Atlanterhavet.",
  chokepoint3: "Svartehavet, blant annet korn og russisk olje.",
  chokepoint9: "Den engelske kanal, inn til Nord-Europas havner.",
  chokepoint11: "Mellom Kina og Taiwan. Viktig for container og geopolitisk risiko.",
};

export default async function Trafikk() {
  const [chokes, ships, zones] = await Promise.all([getChokepoints(800), getAis(), getAisZones()]);
  const by = new Map<string, ChokeSeries>();
  for (const c of chokes) {
    if (!by.has(c.portid)) by.set(c.portid, { id: c.portid, name: c.name, pts: [] });
    by.get(c.portid)!.pts.push({ day: c.day, total: c.total, tanker: c.tanker, container: c.container, bulk: c.bulk });
  }
  const series = ORDER.map((id) => by.get(id)).filter((x): x is ChokeSeries => !!x);
  const avg = (a: { total: number }[]) => (a.length ? a.reduce((s, x) => s + x.total, 0) / a.length : null);
  const rows = series.map((s) => {
    const p = s.pts;
    const lastDay = p[p.length - 1]?.day;
    const ly = lastDay ? p.filter((x) => {
      const d = (new Date(lastDay).getTime() - new Date(x.day).getTime()) / 86400000;
      return d >= 358 && d <= 372;
    }) : [];
    const a7 = avg(p.slice(-7)), a28 = avg(p.slice(-35, -7)), aly = avg(ly);
    const t7 = p.slice(-7);
    const tankShare = t7.length ? (t7.reduce((s, x) => s + x.tanker, 0) / Math.max(1, t7.reduce((s, x) => s + x.total, 0))) * 100 : null;
    return { ...s, lastDay, a7, a28, aly, tankShare };
  });
  const latestZoneTs = zones.length ? zones[zones.length - 1].ts : null;
  const zoneNow = latestZoneTs ? zones.filter((z) => z.ts === latestZoneTs) : [];

  return (
    <>
      <section className="panel" aria-labelledby="h-sund">
        <div className="ph">
          <h2 id="h-sund">Skip gjennom sundene</h2>
          <span className="src">IMF PortWatch · snitt per dag · siste dato {rows[0]?.lastDay ?? "–"}</span>
        </div>
        {rows.length === 0 ? <div className="empty">PortWatch-dataene hentes ved neste daglige kjøring.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr><th>Sund</th><th>Siste 7 d</th><th>3 uker før</th><th>Endring</th><th>Samme tid i fjor</th><th>Mot i fjor</th><th>Andel tank</th><th>Hvorfor det betyr noe</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const c1 = r.a7 !== null && r.a28 ? (r.a7 / r.a28 - 1) * 100 : null;
                  const c2 = r.a7 !== null && r.aly ? (r.a7 / r.aly - 1) * 100 : null;
                  return (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                      <td className="m">{fmt(r.a7, 0)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{fmt(r.a28, 0)}</td>
                      <td className={`m ${c1 === null ? "" : Math.abs(c1) >= 15 ? (up(c1) ? "upc" : "downc") : ""}`}>{pct(c1)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{fmt(r.aly, 0)}</td>
                      <td className={`m ${c2 === null ? "" : Math.abs(c2) >= 15 ? (up(c2) ? "upc" : "downc") : ""}`}>{pct(c2)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{r.tankShare === null ? "–" : `${fmt(r.tankShare, 0)} %`}</td>
                      <td style={{ color: "#A0A7B2", fontSize: 12, lineHeight: 1.4 }}>{WHY[r.id]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-graf">
        <div className="ph"><h2 id="h-graf">Utvikling per sund</h2><span className="src">Velg sund og skipstype</span></div>
        <ChokeExplorer series={series} />
      </section>

      <section className="panel" aria-labelledby="h-kart">
        <div className="ph">
          <h2 id="h-kart">Skip i nøkkelområder nå</h2>
          <span className="src">aisstream.io · {ships.length} skip · {latestZoneTs ? `oppdatert ${osloTime(latestZoneTs)}` : "venter på første henting"}</span>
        </div>
        {ships.length === 0 ? (
          <div className="empty">Kartet fylles når AIS-nøkkelen (AISSTREAM_API_KEY) er lagt inn i GitHub og neste kjøring er ferdig.</div>
        ) : (
          <>
            <AisMap ships={ships} />
            {zoneNow.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table className="tbl" style={{ minWidth: 420 }}>
                  <thead><tr><th>Område</th><th>Skip sett</th><th>Tankskip</th><th>Lasteskip</th></tr></thead>
                  <tbody>{zoneNow.map((z) => <tr key={z.zone}><td>{z.zone}</td><td className="m">{z.total}</td><td className="m">{z.tankers}</td><td className="m">{z.cargo}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
        <p className="note">Øyeblikksbilde fra rundt ett minutt med AIS-meldinger fra mottakere på land. Dekningen er god nær kysten, men har hull på åpent hav, og noen skip slår av AIS. Bruk PortWatch-tabellen over for trender.</p>
      </section>
    </>
  );
}
