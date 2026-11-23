import Link from "next/link";
import ChokeExplorer, { type ChokeSeries } from "@/components/ChokeExplorer";
import GlobalAisMap from "@/components/GlobalAisMap";
import { getChokepoints, getPanama, getPortActivity, getZoneStats } from "@/lib/db";
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
  const [chokes, zones, portDays, panama] = await Promise.all([getChokepoints(800), getZoneStats(), getPortActivity(420), getPanama(60)]);
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
  const latestZoneTs = zones[0]?.ts ?? null;

  // Havner: snitt anløp og vareanslag siste 7 dager mot 4 uker før og samme tid i fjor
  const ports = new Map<string, typeof portDays>();
  for (const d of portDays) (ports.get(d.portid) ?? ports.set(d.portid, []).get(d.portid)!).push(d);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const portRows = [...ports.values()].map((p) => {
    const last = p[p.length - 1]?.day;
    const ly = last ? p.filter((x) => { const d = (new Date(last).getTime() - new Date(x.day).getTime()) / 864e5; return d >= 358 && d <= 372; }) : [];
    const w = p.slice(-7), prev = p.slice(-35, -7);
    return {
      name: p[0].portname, country: p[0].country, last,
      c7: mean(w.map((x) => x.calls)), c28: mean(prev.map((x) => x.calls)), cly: mean(ly.map((x) => x.calls)),
      e7: mean(w.map((x) => x.exp)), e28: mean(prev.map((x) => x.exp)), i7: mean(w.map((x) => x.imp)), i28: mean(prev.map((x) => x.imp)),
      tank: mean(w.map((x) => x.tanker)), bulk: mean(w.map((x) => x.bulk)),
    };
  }).sort((a, b) => (b.c7 ?? 0) - (a.c7 ?? 0));
  const pan = panama[panama.length - 1];
  const pan30 = panama.find((x) => (new Date(pan?.day ?? 0).getTime() - new Date(x.day).getTime()) / 864e5 >= 28);
  const chg = (a: number | null, b: number | null) => (a !== null && b ? (a / b - 1) * 100 : null);
  const cls = (c: number | null, lim = 15) => (c === null ? "m" : Math.abs(c) >= lim ? (up(c) ? "m upc" : "m downc") : "m");

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

      <section className="panel" aria-labelledby="h-ko">
        <div className="ph">
          <h2 id="h-ko">Kø og trengsel</h2>
          <span className="src">AIS (aisstream.io) {latestZoneTs ? `· oppdatert ${osloTime(latestZoneTs)}` : ""}</span>
        </div>
        {zones.length === 0 ? <div className="empty">Fylles etter neste AIS-henting.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead><tr><th>Område</th><th>Skip nå</th><th>Ligger stille</th><th>Andel stille</th><th>Stille, snitt 7 d</th><th>Endring</th><th>Stille tank / last</th></tr></thead>
              <tbody>
                {zones.map((z) => {
                  const c = z.avgStill7 ? (z.still / z.avgStill7 - 1) * 100 : null;
                  return (
                    <tr key={z.zone}>
                      <td>{z.zone}</td>
                      <td className="m">{z.total}</td>
                      <td className="m">{z.still}</td>
                      <td className="m">{z.total ? `${fmt((z.still / z.total) * 100, 0)} %` : "–"}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{fmt(z.avgStill7, 0)}</td>
                      <td className={cls(c, 25)}>{pct(c)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{z.stillTank} / {z.stillLast}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">«Ligger stille» = fart under 0,7 knop (ankret, fortøyd eller venter). Flere stillestående skip enn normalt kan bety kø,
          som binder opp flåten og kan presse ratene opp. Tellingen bygger på et par minutters AIS-lytting per kjøring, så enkeltmålinger hopper; se på snittet.</p>

        <div className="ph" style={{ marginTop: 14 }}>
          <h2>Havner: anløp og varer</h2>
          <span className="src">IMF PortWatch · snitt per dag · siste dato {portRows[0]?.last ?? "–"}</span>
        </div>
        {portRows.length === 0 ? <div className="empty">Havnedata hentes ved neste daglige kjøring.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr><th>Havn</th><th>Anløp 7 d</th><th>Mot 4 uker før</th><th>Mot i fjor</th><th>Tank / bulk</th><th>Eksport (tonn/d)</th><th>Endring</th><th>Import (tonn/d)</th><th>Endring</th></tr></thead>
              <tbody>
                {portRows.map((r) => {
                  const a = chg(r.c7, r.c28), b = chg(r.c7, r.cly), e = chg(r.e7, r.e28), i = chg(r.i7, r.i28);
                  return (
                    <tr key={r.name + r.country}>
                      <td>{r.name} <span className="src">{r.country}</span></td>
                      <td className="m">{fmt(r.c7, 1)}</td>
                      <td className={cls(a)}>{pct(a)}</td>
                      <td className={cls(b)}>{pct(b)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{fmt(r.tank, 1)} / {fmt(r.bulk, 1)}</td>
                      <td className="m">{r.e7 ? Math.round(r.e7).toLocaleString("nb-NO") : "–"}</td>
                      <td className={cls(e)}>{pct(e)}</td>
                      <td className="m">{r.i7 ? Math.round(r.i7).toLocaleString("nb-NO") : "–"}</td>
                      <td className={cls(i)}>{pct(i)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">Anløp og vareanslag bygger på AIS og kommer med rundt en ukes forsinkelse. Færre anløp i en eksporthavn kan bety stans eller kø
          utenfor; flere kan bety høy eksport. Vareanslagene er beregnet av IMF ut fra skipenes dypgang og er usikre for enkeltdager.</p>

        {pan && (
          <>
            <div className="ph" style={{ marginTop: 14 }}>
              <h2>Panamakanalen</h2>
              <Link href="/vaer" className="src" style={{ color: "#FF8A5B" }}>Mer om vær og vannstand →</Link>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="kpi"><div className="l">Vannstand Gatun-sjøen</div><div className="v m">{fmt(pan.gatun, 1)} fot</div>
                {pan30 && <div className="src">{fmt(pan.gatun - pan30.gatun, 1)} fot siste 4 uker</div>}</div>
              <div className="kpi"><div className="l">Maks dypgang Neopanamax</div><div className="v m">{fmt(pan.neo, 1)} fot</div></div>
              <div className="kpi"><div className="l">Maks dypgang Panamax</div><div className="v m">{fmt(pan.panamax, 1)} fot</div></div>
            </div>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="h-kart">
        <div className="ph">
          <h2 id="h-kart">Skipskart (AIS)</h2>
          <span className="src">Tank- og lasteskip i hele verden · oppdateres hvert 15. minutt i børstiden</span>
        </div>
        <GlobalAisMap />
        <p className="note">Posisjoner fra aisstream.io, som bygger på mottakere på land: god dekning nær kysten, i sund og ved havner, men hull ute på åpent hav.
          Type og lengde kommer fra skipenes egne AIS-data. Størrelse er anslått ut fra lengde, og lastet/ballast ut fra dypgang mot typisk dypgang for
          skipets lengde, så begge er grove anslag. Skip uten kjent type vises grått til skipsdataene kommer inn.</p>
      </section>
    </>
  );
}
