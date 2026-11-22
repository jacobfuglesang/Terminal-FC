import TimeChart from "@/components/TimeChart";
import Link from "next/link";
import { getBiomass, getLice, getLiceCompanies } from "@/lib/db";
import { COMPANIES } from "@/lib/menu";
import { monthLabel, weekDate } from "@/lib/dates";
import { fmt, pct, up } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Biologi() {
  const [bio, lice, liceCo] = await Promise.all([getBiomass(), getLice(), getLiceCompanies()]);
  const byMonth = new Map<string, number>();
  for (const b of bio) byMonth.set(b.month, (byMonth.get(b.month) ?? 0) + b.tonnes);
  const months = [...byMonth.keys()].sort();
  const lastM = months[months.length - 1];
  const prevYearM = lastM ? `${Number(lastM.slice(0, 4)) - 1}${lastM.slice(4)}` : "";
  const total = lastM ? byMonth.get(lastM)! : null;
  const totalPy = byMonth.get(prevYearM) ?? null;
  const prevM = months[months.length - 2];
  const totalPm = prevM ? byMonth.get(prevM)! : null;
  const poRows = lastM
    ? bio.filter((b) => b.month === lastM).map((b) => {
        const py = bio.find((x) => x.month === prevYearM && x.po === b.po);
        return { ...b, py: py?.tonnes ?? null, ch: py && py.tonnes ? (b.tonnes / py.tonnes - 1) * 100 : null };
      })
    : [];
  const lw = lice[lice.length - 1];
  const coWeek = liceCo.length ? liceCo[liceCo.length - 1] : undefined;
  const coRows = COMPANIES.filter((c) => c.symbol !== "BAKKA.OL").map((c) => {
    const rows = liceCo.filter((l) => l.symbol === c.symbol);
    const cur = rows.find((l) => coWeek && l.year === coWeek.year && l.week === coWeek.week);
    const prev = rows.find((l) => coWeek && l.year === coWeek.year && l.week === coWeek.week - 1);
    return { c, cur, prev };
  });
  const lp = lice[lice.length - 2];

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="l">Biomasse laks {lastM ? monthLabel(lastM) : ""}</div><div className="v m">{total ? `${fmt(total, 0)} t` : "–"}</div><div className={`d m ${up(total && totalPy ? total - totalPy : 0) ? "upc" : "downc"}`}>{total && totalPy ? `${pct((total / totalPy - 1) * 100)} mot i fjor` : "Venter på data"}</div></div>
        <div className="kpi"><div className="l">Endring siste måned</div><div className="v m">{total && totalPm ? `${fmt(total - totalPm, 0)} t` : "–"}</div><div className="d m" style={{ color: "#A0A7B2" }}>{total && totalPm ? pct((total / totalPm - 1) * 100) : ""}</div></div>
        <div className="kpi"><div className="l">Snitt voksne hunnlus {lw ? `uke ${lw.week}` : ""}</div><div className="v m">{lw?.avg !== null && lw?.avg !== undefined ? fmt(lw.avg, 2) : "–"}</div><div className="d m" style={{ color: "#A0A7B2" }}>{lw ? `${lw.reported} anlegg rapporterte` : "Venter på BarentsWatch-nøkkel"}</div></div>
        <div className="kpi"><div className="l">Anlegg over lusegrensen</div><div className="v m" style={{ color: "#FFB08F" }}>{lw ? lw.over : "–"}</div><div className="d m" style={{ color: "#A0A7B2" }}>{lw && lp ? `${lw.over - lp.over >= 0 ? "▲" : "▼"} ${Math.abs(lw.over - lp.over)} fra forrige uke` : ""}</div></div>
        <div className="kpi"><div className="l">Anlegg med ILA / PD</div><div className="v m">{lw ? `${lw.ila} / ${lw.pd}` : "–"}</div><div className="d m" style={{ color: "#A0A7B2" }}>Påvist eller mistenkt</div></div>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-bio">
          <div className="ph"><h2 id="h-bio">Biomasse i sjø, hele landet</h2><span className="src">Fiskeridirektoratet · tonn ved månedsslutt · NLOD</span></div>
          <TimeChart daily={months.map((m) => ({ t: `${m}T00:00:00Z`, v: byMonth.get(m)! }))} periods={["6M", "1Å"]} initial="1Å" color="#4FD1C5" decimals={0} />
          <p className="note">Mer fisk i sjøen nå betyr som regel mer tilbud om 3–9 måneder.</p>
        </section>
        <section className="panel" style={{ flex: "1 1 360px" }} aria-labelledby="h-lus">
          <div className="ph"><h2 id="h-lus">Lus per uke</h2><span className="src">BarentsWatch · snitt voksne hunnlus</span></div>
          {lice.length === 0 ? (
            <div className="empty">Lusetall kommer når BarentsWatch-nøkkelen er lagt inn i GitHub.</div>
          ) : (
            <TimeChart daily={lice.filter((l) => l.avg !== null).map((l) => ({ t: weekDate(l.year, l.week), v: l.avg as number }))} periods={["1M", "3M", "6M"]} initial="6M" color="#F2C94C" decimals={2} height={170} />
          )}
          <p className="note">Grensen er 0,5 voksne hunnlus per fisk, men 0,2 om våren (uke 16–21).</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="h-co">
        <div className="ph"><h2 id="h-co">Lus og sykdom per selskap {coWeek ? `uke ${coWeek.week}` : ""}</h2><span className="src">BarentsWatch · anlegg koblet til selskap via akvakulturregisteret</span></div>
        {!coWeek ? <div className="empty">Selskapstallene hentes ved neste daglige kjøring.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead><tr><th>Selskap</th><th>Anlegg</th><th>Rapporterte</th><th>Snitt hunnlus</th><th>Vektet</th><th>Over grensen</th><th>ILA</th><th>PD</th></tr></thead>
              <tbody>
                {coRows.map(({ c, cur, prev }) => (
                  <tr key={c.symbol}>
                    <td><Link href={`/selskap/${c.id}`}>{c.name}</Link></td>
                    <td className="m">{cur?.localities ?? "–"}</td>
                    <td className="m" style={{ color: "#A0A7B2" }}>{cur?.reported ?? "–"}</td>
                    <td className="m">{fmt(cur?.avg, 2)} {cur?.avg != null && prev?.avg != null ? <span style={{ color: cur.avg > prev.avg ? "#FFB08F" : "#7BE3A6" }}>{cur.avg > prev.avg ? "▲" : "▼"}</span> : null}</td>
                    <td className="m" style={{ color: "#A0A7B2" }}>{fmt(cur?.avgW, 2)}</td>
                    <td className="m" style={{ color: cur?.over ? "#FFB08F" : undefined }}>{cur?.over ?? "–"}</td>
                    <td className="m">{cur?.ila ?? "–"}</td>
                    <td className="m">{cur?.pd ?? "–"}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ color: "#A0A7B2" }}>Hele Norge</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{lw?.localities ?? "–"}</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{lw?.reported ?? "–"}</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{fmt(lw?.avg, 2)}</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>–</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{lw?.over ?? "–"}</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{lw?.ila ?? "–"}</td>
                  <td className="m" style={{ color: "#A0A7B2" }}>{lw?.pd ?? "–"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="note">«Vektet» betyr at store anlegg teller mer (etter tillatt biomasse). Bakkafrost har ingen anlegg i Norge og er ikke med. Anlegg som eies sammen med andre telles hos alle eierne.</p>
      </section>

      <section className="panel" aria-labelledby="h-po">
        <div className="ph"><h2 id="h-po">Biomasse per produksjonsområde</h2><span className="src">{lastM ? monthLabel(lastM) : ""} mot samme måned i fjor</span></div>
        {poRows.length === 0 ? <div className="empty">Ingen data ennå.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 560 }}>
              <thead><tr><th>Område</th><th>Fisk (1000 stk)</th><th>Biomasse (t)</th><th>I fjor (t)</th><th>Endring</th></tr></thead>
              <tbody>
                {poRows.map((r) => (
                  <tr key={r.po}>
                    <td>PO{r.po} {r.name}</td>
                    <td className="m">{fmt(r.count, 0)}</td>
                    <td className="m">{fmt(r.tonnes, 0)}</td>
                    <td className="m" style={{ color: "#A0A7B2" }}>{fmt(r.py, 0)}</td>
                    <td className={`m ${up(r.ch) ? "upc" : "downc"}`}>{pct(r.ch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
