import TimeChart from "@/components/TimeChart";
import { change } from "@/lib/calc";
import { getDaily, getFreight, getIntraday } from "@/lib/db";
import { fmt, pct, up } from "@/lib/format";
import { FREIGHT_NAME, SEGMENT_NOTE, SEGMENTS } from "@/lib/universe";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });

export default async function Frakt() {
  const [fr, bwet, bdry, bwetI, bdryI] = await Promise.all([getFreight(), getDaily("BWET", 520), getDaily("BDRY", 520), getIntraday("BWET"), getIntraday("BDRY")]);
  const pts = (d: { day: string; close: number }[]) => d.map((x) => ({ t: `${x.day}T16:00:00Z`, v: x.close }));
  const fpts = (s: string) => (fr[s] ?? []).map((x) => ({ t: `${x.day}T12:00:00Z`, v: x.value }));
  const last = (s: string) => fr[s]?.[fr[s].length - 1];

  const kpi = (label: string, v: number | null | undefined, ch: number | null, sub: string, d = 0) => (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v m">{fmt(v, d)}</div>
      <div className={`d m ${ch === null ? "" : up(ch) ? "upc" : "downc"}`} style={ch === null ? { color: "#A0A7B2" } : undefined}>{ch === null ? sub : `${pct(ch)} ${sub}`}</div>
    </div>
  );

  const freightPanel = (s: string, color: string, extra?: string) => {
    const p = fpts(s);
    const l = last(s);
    return (
      <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby={`h-${s}`}>
        <div className="ph">
          <h2 id={`h-${s}`}>{FREIGHT_NAME[s].name}</h2>
          <span className="src">{FREIGHT_NAME[s].unit} · {FREIGHT_NAME[s].source}{l ? ` · sist ${day(l.day)}` : ""}</span>
        </div>
        {p.length < 2 ? <div className="empty">Bygger historikk. Serien fylles på ved hver ny publisering.</div> : (
          <TimeChart daily={p} periods={["1M", "3M", "6M", "1Å"]} initial="6M" color={color} decimals={0} height={190} />
        )}
        {extra && <p className="note">{extra}</p>}
        {l?.note && <p className="note">Drewry: «{l.note}»</p>}
      </section>
    );
  };

  return (
    <>
      <div className="kpis">
        {kpi("Tankfrakt (BWET)", bwet[bwet.length - 1]?.close, change(pts(bwet), 30), "på en måned", 2)}
        {kpi("Tørrbulkfrakt (BDRY)", bdry[bdry.length - 1]?.close, change(pts(bdry), 30), "på en måned", 2)}
        {kpi("Baltic Dry Index", last("BDI")?.value, change(fpts("BDI"), 7), "på en uke")}
        {kpi("Drewry WCI ($/40 fot)", last("WCI")?.value, change(fpts("WCI"), 6), "siste uke")}
        {kpi("SCFI", last("SCFI")?.value, change(fpts("SCFI"), 6), "siste uke")}
        {kpi("USAs oljelagre (mill. fat)", last("US_CRUDE")?.value, change(fpts("US_CRUDE"), 6), "siste uke", 1)}
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-bwet">
          <div className="ph"><h2 id="h-bwet">Tank: BWET (VLCC-fraktfutures)</h2><span className="src">Daglig · USD · Yahoo Finance</span></div>
          <TimeChart daily={pts(bwet)} intraday={bwetI} decimals={2} initial="1Å" />
          <p className="note">Fondet eier fraktfutures (FFA) for VLCC Midtøsten–Kina (TD3C), rundt 90 % av porteføljen. Det følger markedets forventning til ratene de neste 1–2 månedene, og er den beste gratis daglige pekepinnen for råoljetank.</p>
        </section>
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-bdry">
          <div className="ph"><h2 id="h-bdry">Tørrbulk: BDRY (fraktfutures)</h2><span className="src">Daglig · USD · Yahoo Finance</span></div>
          <TimeChart daily={pts(bdry)} intraday={bdryI} decimals={2} initial="1Å" color="#5BA8FF" />
          <p className="note">Fondet eier fraktfutures fordelt på 50 % Capesize, 40 % Panamax og 10 % Supramax, med 50–70 dagers løpetid. Det går ofte foran spotratene.</p>
        </section>
      </div>

      <div className="row">
        {freightPanel("BDI", "#4FD1C5", "Daglig spotindeks for tørrbulk (40 % Capesize, 30 % Panamax, 30 % Supramax). Tallet hentes fra Hellenic Shipping News sine daglige saker, så enkelte dager kan mangle.")}
        {freightPanel("SCFI", "#F2C94C", "Ukentlig indeks for containerfrakt fra Shanghai, publisert fredager.")}
      </div>
      <div className="row">
        {freightPanel("WCI", "#B98CFF", "Snittpris for en 40-fots container på åtte store ruter, publisert torsdager.")}
        {freightPanel("US_CRUDE", "#A0A7B2", "Kommersielle råoljelagre i USA (uten strategisk reserve), publisert onsdager. Synkende lagre gir ofte mer eksport og mer tankfrakt.")}
      </div>

      <section className="panel" aria-labelledby="h-dekning">
        <div className="ph"><h2 id="h-dekning">Hva de gratis dataene dekker per segment</h2><span className="src">Ærlig oversikt</span></div>
        <table className="tbl">
          <thead><tr><th>Segment</th><th>Hva styrer inntjeningen, og hva du kan følge her</th></tr></thead>
          <tbody>{SEGMENTS.map((s) => <tr key={s}><td style={{ whiteSpace: "nowrap" }}>{s}</td><td style={{ color: "#C9CED6", lineHeight: 1.5 }}>{SEGMENT_NOTE[s]}</td></tr>)}</tbody>
        </table>
        <p className="note">Fullstendige rater for produkttank, LPG, bilskip og tidscertepartier selges av Clarksons, Baltic Exchange og andre, og er ikke med her.</p>
      </section>
    </>
  );
}
