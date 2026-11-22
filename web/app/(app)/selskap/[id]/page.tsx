import Link from "next/link";
import { notFound } from "next/navigation";
import NewsList from "@/components/NewsList";
import TimeChart from "@/components/TimeChart";
import { COMPANY_INFO, EVENTS } from "@/lib/companies";
import { weekDate } from "@/lib/dates";
import { getAnnouncements, getDaily, getFundamentals, getIntraday, getLice, getLiceCompanies, getNews, getQuotes } from "@/lib/db";
import { compact, fmt, money, osloTime, pct, tonn, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });

function EstRow({ label, e, cur, money: isMoney }: { label: string; e?: { avg?: number | null; low?: number | null; high?: number | null; numberOfAnalysts?: number | null; yearAgoEps?: number | null; yearAgoRevenue?: number | null }; cur: string; money?: boolean }) {
  if (!e || e.avg === null || e.avg === undefined) return <tr><td>{label}</td><td colSpan={3} className="src">Ingen data</td></tr>;
  const f = (v?: number | null) => (isMoney ? money(v, cur) : `${fmt(v, 2)} ${cur}`);
  const prev = isMoney ? e.yearAgoRevenue : e.yearAgoEps;
  return (
    <tr>
      <td>{label}</td>
      <td className="m">{f(e.avg)}</td>
      <td className="m" style={{ color: "#A0A7B2" }}>{f(e.low)} – {f(e.high)}</td>
      <td className="m" style={{ color: "#A0A7B2" }}>{e.numberOfAnalysts ?? "–"}{prev !== null && prev !== undefined ? <span> · i fjor {f(prev)}</span> : null}</td>
    </tr>
  );
}

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const co = COMPANIES.find((c) => c.id === id);
  if (!co) notFound();
  const info = COMPANY_INFO[co.symbol];
  const [quotes, daily, intra, allNews, fund, ann, liceCo, liceAll] = await Promise.all([
    getQuotes(), getDaily(co.symbol), getIntraday(co.symbol), getNews(500), getFundamentals(co.symbol),
    getAnnouncements(co.symbol, 60), getLiceCompanies(co.symbol), getLice(),
  ]);
  const q = quotes.find((x) => x.symbol === co.symbol);
  const first = daily[0]?.close;
  const lastClose = daily[daily.length - 1]?.close;
  const yearChange = first && lastClose ? (lastClose / first - 1) * 100 : null;
  const news = allNews.filter((n) => n.companies.includes(co.symbol) && n.category !== "Børsmelding");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
  const events = EVENTS.filter((e) => e.symbol === co.symbol && e.date >= today);
  const insider = ann.filter((a) => a.kind === "Innsidehandel").slice(0, 10);
  const releases = ann.filter((a) => a.kind !== "Innsidehandel").slice(0, 14);
  const cur = fund?.info?.financialCurrency || info.currency;
  const lc = liceCo.filter((l) => l.localities > 0);
  const lw = lc[lc.length - 1];
  const lp = lc[lc.length - 2];
  const nat = lw ? liceAll.find((l) => l.year === lw.year && l.week === lw.week) : undefined;
  const trend0 = fund?.eps_trend?.["0y"];

  return (
    <>
      <section className="panel" style={{ display: "flex", flexWrap: "wrap", gap: "20px 36px", alignItems: "center" }}>
        <div>
          <div className="src">Kurs · {co.ticker}</div>
          <div className="m" style={{ fontSize: 26, fontWeight: 600 }}>
            {fmt(q?.price)} <span className={up(q?.change_pct) ? "upc" : "downc"} style={{ fontSize: 13 }}>{pct(q?.change_pct)}</span>
          </div>
        </div>
        <div><div className="src">Børsverdi</div><div className="m" style={{ fontSize: 18 }}>{money(fund?.info?.marketCap, "NOK")}</div></div>
        <div><div className="src">Siste år</div><div className={`m ${up(yearChange) ? "upc" : "downc"}`} style={{ fontSize: 18 }}>{pct(yearChange)}</div></div>
        <div><div className="src">Volum i dag</div><div className="m" style={{ fontSize: 18 }}>{compact(q?.volume)}</div></div>
        <div><div className="src">Neste rapport</div><div className="m" style={{ fontSize: 18 }}>{events.find((e) => e.kind === "Rapport") ? day(events.find((e) => e.kind === "Rapport")!.date) : "–"}</div></div>
        <div><div className="src">Sist hentet</div><div className="m" style={{ fontSize: 18 }}>{osloTime(q?.updated_at)}</div></div>
      </section>

      <section className="panel" aria-labelledby="h-graf">
        <div className="ph">
          <h2 id="h-graf">Kursutvikling</h2>
          <span className="src">15-minutters kurser for 1 dag og 1 uke, ellers sluttkurs · Yahoo Finance</span>
        </div>
        <TimeChart daily={daily.map((d) => ({ t: `${d.day}T16:00:00Z`, v: d.close }))} intraday={intra} decimals={2} />
      </section>

      <div className="grid2">
        <section className="panel" aria-labelledby="h-om">
          <div className="ph"><h2 id="h-om">Markedsposisjon</h2><span className="src">Rapporterer i {info.currency}</span></div>
          <p style={{ margin: "0 0 10px", lineHeight: 1.6 }}>{info.about}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {info.regions.map((r) => <span key={r} className="chip">{r}</span>)}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, color: "var(--muted)" }}>
            {info.facts.map((f) => <li key={f}>{f}</li>)}
            {fund?.info?.fullTimeEmployees ? <li>Om lag {fmt(fund.info.fullTimeEmployees, 0)} ansatte (Yahoo Finance).</li> : null}
          </ul>
        </section>

        <section className="panel" aria-labelledby="h-guid">
          <div className="ph"><h2 id="h-guid">Planer: guidet slaktevolum</h2><span className="src">Fra selskapet, {day(info.quarter.published)}</span></div>
          <table className="tbl">
            <thead><tr><th></th><th>2026</th><th>2027</th><th>Endring</th></tr></thead>
            <tbody>
              {info.guidance.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}{g.note && <div className="src">{g.note}</div>}</td>
                  <td className="m">{tonn(g.y2026)}</td>
                  <td className="m">{tonn(g.y2027)}</td>
                  <td className={`m ${up(g.y2026 && g.y2027 ? g.y2027 - g.y2026 : 0) ? "upc" : "downc"}`}>{g.y2026 && g.y2027 ? pct((g.y2027 / g.y2026 - 1) * 100) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">{info.guidanceNote}</p>
        </section>
      </div>

      <div className="grid2">
        <section className="panel" aria-labelledby="h-kv">
          <div className="ph"><h2 id="h-kv">Siste kvartal: {info.quarter.label}</h2><span className="src">Publisert {day(info.quarter.published)}</span></div>
          <div className="kpis" style={{ marginBottom: 10 }}>
            {info.quarter.metrics.map((m) => (
              <div className="kpi" key={m.label}>
                <div className="l">{m.label}</div>
                <div className="v m" style={{ fontSize: 17 }}>{m.value}</div>
                {m.prev && <div className="d m" style={{ color: "#A0A7B2" }}>i fjor: {m.prev}</div>}
              </div>
            ))}
          </div>
          <p style={{ margin: 0, lineHeight: 1.6, color: "var(--muted)" }}>{info.quarter.comment}</p>
        </section>

        <section className="panel" aria-labelledby="h-kons">
          <div className="ph"><h2 id="h-kons">Forventet resultat (konsensus)</h2><span className="src">Snitt av analytikernes estimater · Yahoo Finance</span></div>
          {!fund ? (
            <div className="empty">Konsensus hentes ved neste daglige kjøring.</div>
          ) : (
            <>
              <table className="tbl">
                <thead><tr><th></th><th>Snitt</th><th>Spenn</th><th>Analytikere</th></tr></thead>
                <tbody>
                  <EstRow label="Resultat per aksje 2026" e={fund.eps?.["0y"]} cur={cur} />
                  <EstRow label="Resultat per aksje 2027" e={fund.eps?.["+1y"]} cur={cur} />
                  <EstRow label="Omsetning 2026" e={fund.revenue?.["0y"]} cur={cur} money />
                  <EstRow label="Omsetning 2027" e={fund.revenue?.["+1y"]} cur={cur} money />
                </tbody>
              </table>
              <p className="note">
                {fund.next_report?.date ? `Neste rapport ifølge Yahoo: ${day(fund.next_report.date)}${fund.next_report.eps_estimate !== null ? `, ventet resultat per aksje ${fmt(fund.next_report.eps_estimate, 2)} ${cur}` : ""}. ` : ""}
                {trend0?.current && trend0?.["90daysAgo"] ? `Estimatet for i år er ${trend0.current > trend0["90daysAgo"] ? "justert opp" : "justert ned"} fra ${fmt(trend0["90daysAgo"], 2)} for 90 dager siden. ` : ""}
                Bare forventet inntjening vises, ingen anbefalinger eller kursmål. Få analytikere gir usikre tall.
              </p>
            </>
          )}
        </section>
      </div>

      {fund?.quarters?.length ? (
        <section className="panel" aria-labelledby="h-reg">
          <div className="ph"><h2 id="h-reg">Kvartalsregnskap</h2><span className="src">Yahoo Finance · {cur} · EBIT etter IFRS, inkludert verdijustering av fisk</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 520 }}>
              <thead><tr><th>Kvartal</th><th>Omsetning</th><th>EBIT</th><th>Resultat</th><th>Per aksje</th></tr></thead>
              <tbody>
                {fund.quarters.filter((r) => r.revenue !== null || r.ebit !== null).map((r) => (
                  <tr key={r.end}>
                    <td className="m">{day(r.end)}</td>
                    <td className="m">{money(r.revenue)}</td>
                    <td className={`m ${up(r.ebit) ? "" : "downc"}`}>{money(r.ebit)}</td>
                    <td className={`m ${up(r.net) ? "" : "downc"}`}>{money(r.net)}</td>
                    <td className="m">{fmt(r.eps, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">Operasjonelt EBIT (uten verdijustering) står i «Siste kvartal» over. Yahoo kan mangle enkelte kvartaler.</p>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="h-lus">
        <div className="ph"><h2 id="h-lus">Lus og sykdom i {co.name} sine anlegg</h2><span className="src">BarentsWatch · anlegg koblet til selskapet via akvakulturregisteret</span></div>
        {co.symbol === "BAKKA.OL" ? (
          <div className="empty">Bakkafrost har ingen anlegg i Norge, så BarentsWatch har ikke lusetall for selskapet. Selskapet publiserer egne tall for Færøyene på bakkafrost.com.</div>
        ) : !lw ? (
          <div className="empty">Selskapstallene hentes ved neste daglige kjøring.</div>
        ) : (
          <>
            <div className="kpis" style={{ marginBottom: 12 }}>
              <div className="kpi"><div className="l">Snitt hunnlus uke {lw.week}</div><div className="v m">{fmt(lw.avg, 2)}</div><div className="d m" style={{ color: "#A0A7B2" }}>Hele Norge: {fmt(nat?.avg, 2)}</div></div>
              <div className="kpi"><div className="l">Vektet etter kapasitet</div><div className="v m">{fmt(lw.avgW, 2)}</div><div className="d m" style={{ color: "#A0A7B2" }}>Store anlegg teller mer</div></div>
              <div className="kpi"><div className="l">Over lusegrensen</div><div className="v m" style={{ color: lw.over ? "#FFB08F" : undefined }}>{lw.over}</div><div className="d m" style={{ color: "#A0A7B2" }}>{lp ? `${lw.over - lp.over >= 0 ? "▲" : "▼"} ${Math.abs(lw.over - lp.over)} fra forrige uke` : ""}</div></div>
              <div className="kpi"><div className="l">Anlegg med ILA / PD</div><div className="v m">{lw.ila} / {lw.pd}</div><div className="d m" style={{ color: "#A0A7B2" }}>{lw.reported} av {lw.localities} anlegg rapporterte</div></div>
            </div>
            <TimeChart daily={lc.filter((l) => l.avg !== null).map((l) => ({ t: weekDate(l.year, l.week), v: l.avg as number }))} periods={["1M", "3M", "6M"]} initial="6M" color="#F2C94C" decimals={2} height={170} />
            <p className="note">Grensen er 0,5 voksne hunnlus (0,2 i uke 16–21). Anlegg som eies sammen med andre telles med hos alle eierne.</p>
          </>
        )}
      </section>

      <div className="grid2">
        <section className="panel" aria-labelledby="h-kal">
          <div className="ph"><h2 id="h-kal">Kalender</h2><Link href="/kalender" className="src" style={{ color: "#FF8A5B" }}>Hele kalenderen →</Link></div>
          {events.length === 0 ? <div className="empty">Ingen kjente datoer ennå.</div> : events.map((e) => (
            <div key={e.date + e.title} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline" }}>
              <span className="m" style={{ minWidth: 100 }}>{day(e.date)}</span>
              <span style={{ flex: 1 }}>{e.title}{e.note && <div className="src">{e.note}</div>}</span>
              <span className="tag" style={e.confirmed ? { background: "#16301F", color: "#7BE3A6" } : { background: "#3A2A12", color: "#F2C94C" }}>{e.confirmed ? "Bekreftet" : "Anslått"}</span>
            </div>
          ))}
        </section>

        <section className="panel" aria-labelledby="h-intern">
          <div className="ph"><h2 id="h-intern">Interne forhold: innsidehandel</h2><span className="src">Meldepliktig handel · Newsweb</span></div>
          {insider.length === 0 ? <div className="empty">Ingen meldepliktige handler registrert siste måneder.</div> : insider.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline" }}>
              <span className="m src" style={{ minWidth: 86 }}>{day(a.published)}</span>
              <Link href={`/melding/${a.id}`} style={{ color: "var(--text)" }}>{a.title}</Link>
            </div>
          ))}
        </section>
      </div>

      <section className="panel" aria-labelledby="h-bm">
        <div className="ph"><h2 id="h-bm">Børsmeldinger</h2><span className="src">Rapporter, trading updates og andre meldinger · Oslo Børs Newsweb</span></div>
        {releases.length === 0 ? <div className="empty">Børsmeldingene hentes ved neste kjøring.</div> : releases.map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="m src" style={{ minWidth: 86 }}>{day(a.published)}</span>
            <span className="chip" style={{ color: "var(--accent)" }}>{a.kind}</span>
            <Link href={`/melding/${a.id}`} style={{ color: "var(--text)", flex: "1 1 280px" }}>{a.title}</Link>
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="h-conews">
        <div className="ph">
          <h2 id="h-conews">Nyheter om {co.name}</h2>
          <span className="src">{news.length} saker siste 90 dager</span>
        </div>
        <NewsList items={news} filters={news.length > 8} />
      </section>

      <section className="panel" aria-labelledby="h-kilder">
        <div className="ph"><h2 id="h-kilder">Kilder for selskapsdataene</h2><span className="src">Kontrollert 22.11.2026</span></div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          {info.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title} ↗</a></li>)}
        </ul>
        <p className="note">Analyseverktøy, ikke investeringsråd.</p>
      </section>
    </>
  );
}
