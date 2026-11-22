import Link from "next/link";
import { notFound } from "next/navigation";
import CompareChart, { type Series } from "@/components/CompareChart";
import NewsList from "@/components/NewsList";
import ReportCard from "@/components/ReportCard";
import TimeChart from "@/components/TimeChart";
import { change, runRateYield, ttmYield, weeklyCorr } from "@/lib/calc";
import { getAllDaily, getAnnouncements, getFreight, getFundamentals, getIntraday, getNews, getQuotes, getReports, getShorts } from "@/lib/db";
import { compact, fmt, money, osloTime, pct, up } from "@/lib/format";
import { COMPANIES, SEGMENT_NOTE, SEGMENT_PROXY } from "@/lib/universe";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });

type Est = { avg?: number | null; low?: number | null; high?: number | null; numberOfAnalysts?: number | null; yearAgoEps?: number | null; yearAgoRevenue?: number | null };
function EstRow({ label, e, cur, isMoney }: { label: string; e?: Est; cur: string; isMoney?: boolean }) {
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
  const proxy = SEGMENT_PROXY[co.segment];
  const syms = [co.symbol, "OSEBX.OL", ...(proxy?.kind === "price" ? [proxy.id] : [])];
  const [quotes, daily, intra, allNews, fund, ann, shorts, fr, reps] = await Promise.all([
    getQuotes(), getAllDaily(syms), getIntraday(co.symbol), getNews(500), getFundamentals(co.symbol),
    getAnnouncements(co.symbol, 80), getShorts(), proxy?.kind === "freight" ? getFreight([proxy.id]) : Promise.resolve({} as Record<string, { day: string; value: number }[]>),
    getReports({ symbol: co.symbol, limit: 6 }),
  ]);
  const q = quotes.find((x) => x.symbol === co.symbol);
  const pts = daily[co.symbol] ?? [];
  const price = q?.price ?? pts[pts.length - 1]?.v ?? null;
  const proxyPts = proxy ? (proxy.kind === "price" ? daily[proxy.id] ?? [] : (fr[proxy.id] ?? []).map((x) => ({ t: `${x.day}T12:00:00Z`, v: x.value }))) : [];
  const c6 = proxy ? weeklyCorr(pts, proxyPts, 183) : null;
  const cOse = weeklyCorr(pts, daily["OSEBX.OL"] ?? [], 183);
  const news = allNews.filter((n) => n.companies.includes(co.symbol) && n.category !== "Børsmelding");
  const insider = ann.filter((a) => a.kind === "Innsidehandel").slice(0, 10);
  const releases = ann.filter((a) => a.kind !== "Innsidehandel").slice(0, 16);
  const cur = fund?.info?.financialCurrency || "USD";
  const divs = fund?.dividends ?? [];
  const ttm = ttmYield(divs, price), run = runRateYield(divs, price);
  const sh = shorts.filter((s) => s.symbol === co.symbol);
  const shortNow = sh[sh.length - 1];
  const trend0 = fund?.eps_trend?.["0y"];

  const series: Series[] = [
    { id: co.symbol, name: co.name, color: "#FF8A5B", pts },
    ...(proxy ? [{ id: proxy.id, name: proxy.name, color: "#F4F5F7", dash: "6 4", pts: proxyPts }] : []),
    { id: "OSEBX.OL", name: "Oslo Børs", color: "#6E7581", dash: "1 3", pts: daily["OSEBX.OL"] ?? [] },
  ];

  return (
    <>
      <section className="panel" style={{ display: "flex", flexWrap: "wrap", gap: "20px 34px", alignItems: "center" }}>
        <div>
          <div className="src">Kurs · {co.ticker} · {co.segment}</div>
          <div className="m" style={{ fontSize: 26, fontWeight: 600 }}>
            {fmt(price)} <span className={up(q?.change_pct) ? "upc" : "downc"} style={{ fontSize: 13 }}>{pct(q?.change_pct)}</span>
          </div>
        </div>
        <div><div className="src">1 mnd / 3 mnd</div><div className="m" style={{ fontSize: 16 }}><span className={up(change(pts, 30)) ? "upc" : "downc"}>{pct(change(pts, 30))}</span> / <span className={up(change(pts, 91)) ? "upc" : "downc"}>{pct(change(pts, 91))}</span></div></div>
        <div><div className="src">Børsverdi</div><div className="m" style={{ fontSize: 16 }}>{money(fund?.info?.marketCap, "NOK")}</div></div>
        <div><div className="src">Utbytte 12 m / siste ×</div><div className="m" style={{ fontSize: 16 }}>{ttm === null ? "–" : `${fmt(ttm, 1)} %`} / {run === null ? "–" : `${fmt(run, 1)} %`}</div></div>
        <div><div className="src">Neste rapport</div><div className="m" style={{ fontSize: 16 }}>{fund?.next_report?.date ? day(fund.next_report.date) : "–"}</div></div>
        <div><div className="src">Short</div><div className="m" style={{ fontSize: 16 }}>{shortNow ? `${fmt(shortNow.pct, 2)} %` : "Ingen offentlig"}</div></div>
        <div><div className="src">Volum i dag</div><div className="m" style={{ fontSize: 16 }}>{compact(q?.volume)}</div></div>
      </section>

      <section className="panel" aria-labelledby="h-graf">
        <div className="ph"><h2 id="h-graf">Kursutvikling</h2><span className="src">NOK · 15-minutters kurser for 1 dag og 1 uke · Yahoo Finance · {osloTime(q?.updated_at)}</span></div>
        <TimeChart daily={pts} intraday={intra} decimals={2} initial="6M" />
      </section>

      <section className="panel" aria-labelledby="h-mot">
        <div className="ph">
          <h2 id="h-mot">Aksjen mot {proxy ? proxy.name.toLowerCase() : "Oslo Børs"}</h2>
          <span className="src">
            Korrelasjon i ukentlige endringer siste 6 mnd: {proxy ? `${proxy.name} ${c6 === null ? "–" : fmt(c6, 2)} · ` : ""}Oslo Børs {cOse === null ? "–" : fmt(cOse, 2)}
          </span>
        </div>
        <CompareChart series={series} initialOn={series.map((s) => s.id)} refs={proxy ? [{ id: proxy.id, label: proxy.name.toLowerCase() }] : [{ id: "OSEBX.OL", label: "Oslo Børs" }]} />
        {!proxy && <p className="note">Det finnes ingen gratis daglig fraktserie for {co.segment.toLowerCase()}, så aksjen sammenlignes bare med Oslo Børs.</p>}
      </section>

      <section className="panel" aria-labelledby="h-kvr">
        <div className="ph">
          <h2 id="h-kvr">Siste kvartalsrapport, lest av KI</h2>
          {reps.length > 0 && <Link href={`/rapporter?selskap=${co.id}`} className="src" style={{ color: "#FF8A5B" }}>Alle {reps.length} perioder →</Link>}
        </div>
        {reps[0] ? (
          <>
            <ReportCard r={reps[0]} showCompany={false} />
            {reps.length > 1 && (
              <div className="src">
                Tidligere: {reps.slice(1).map((r) => r.period + (r.data?.headline ? ` (${r.data.headline.slice(0, 70)}…)` : "")).join(" · ")}
              </div>
            )}
          </>
        ) : (
          <div className="empty">Ingen rapport lest ennå. KI leser nye kvartalsrapporter fra Newsweb automatisk.</div>
        )}
      </section>

      <div className="grid2">
        <section className="panel" aria-labelledby="h-om">
          <div className="ph"><h2 id="h-om">Om {co.name}</h2><span className="src">{co.segment}</span></div>
          <p style={{ margin: "0 0 10px", lineHeight: 1.6 }}>{co.about}</p>
          <p style={{ margin: 0, lineHeight: 1.6, color: "var(--muted)" }}><b style={{ color: "#C9CED6" }}>Hva du bør følge:</b> {SEGMENT_NOTE[co.segment]}</p>
          {fund?.info?.fullTimeEmployees ? <p className="note">Om lag {fmt(fund.info.fullTimeEmployees, 0)} ansatte (Yahoo Finance).</p> : null}
        </section>

        <section className="panel" aria-labelledby="h-utb">
          <div className="ph"><h2 id="h-utb">Utbytte</h2><span className="src">Per aksje i kroner · Yahoo Finance</span></div>
          {divs.length === 0 ? <div className="empty">Ingen utbytte registrert.</div> : (
            <table className="tbl">
              <thead><tr><th>Dato (eks.)</th><th>Per aksje</th><th>Av dagens kurs</th></tr></thead>
              <tbody>
                {[...divs].reverse().slice(0, 8).map((d) => (
                  <tr key={d.date}><td className="m">{day(d.date)}</td><td className="m">{fmt(d.value, 2)} kr</td><td className="m" style={{ color: "#A0A7B2" }}>{d.value && price ? `${fmt((d.value / price) * 100, 2)} %` : "–"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">
            {fund?.ex_dividend ? `Neste eller siste eks-utbyttedag ifølge Yahoo: ${day(fund.ex_dividend)}. ` : ""}
            Shippingutbytter følger ratene og kan endre seg mye fra kvartal til kvartal.
          </p>
        </section>
      </div>

      <div className="grid2">
        <section className="panel" aria-labelledby="h-kons">
          <div className="ph"><h2 id="h-kons">Forventet resultat (konsensus)</h2><span className="src">Snitt av analytikernes estimater · Yahoo Finance</span></div>
          {!fund ? <div className="empty">Hentes ved neste daglige kjøring.</div> : (
            <>
              <table className="tbl">
                <thead><tr><th></th><th>Snitt</th><th>Spenn</th><th>Analytikere</th></tr></thead>
                <tbody>
                  <EstRow label="Resultat per aksje i år" e={fund.eps?.["0y"]} cur={cur} />
                  <EstRow label="Resultat per aksje neste år" e={fund.eps?.["+1y"]} cur={cur} />
                  <EstRow label="Omsetning i år" e={fund.revenue?.["0y"]} cur={cur} isMoney />
                  <EstRow label="Omsetning neste år" e={fund.revenue?.["+1y"]} cur={cur} isMoney />
                </tbody>
              </table>
              <p className="note">
                {fund.next_report?.eps_estimate !== null && fund.next_report?.eps_estimate !== undefined ? `Ventet resultat per aksje i neste rapport: ${fmt(fund.next_report.eps_estimate, 2)} ${cur}. ` : ""}
                {trend0?.current && trend0?.["30daysAgo"] ? `Estimatet for i år er ${trend0.current >= trend0["30daysAgo"] ? "justert opp" : "justert ned"} fra ${fmt(trend0["30daysAgo"], 2)} for 30 dager siden. ` : ""}
                Bare forventet inntjening vises, ingen anbefalinger eller kursmål.
              </p>
            </>
          )}
        </section>

        <section className="panel" aria-labelledby="h-reg">
          <div className="ph"><h2 id="h-reg">Kvartalsregnskap</h2><span className="src">{cur} · Yahoo Finance</span></div>
          {!fund?.quarters?.length ? <div className="empty">Ingen data ennå.</div> : (
            <table className="tbl">
              <thead><tr><th>Kvartal</th><th>Omsetning</th><th>EBIT</th><th>Resultat</th><th>Per aksje</th></tr></thead>
              <tbody>
                {fund.quarters.filter((r) => r.revenue !== null || r.ebit !== null).slice(0, 6).map((r) => (
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
          )}
        </section>
      </div>

      {sh.length > 1 && (
        <section className="panel" aria-labelledby="h-short">
          <div className="ph"><h2 id="h-short">Shortandel</h2><span className="src">Finanstilsynet · posisjoner over 0,5 % per aktør</span></div>
          <TimeChart daily={sh.map((s) => ({ t: `${s.day}T12:00:00Z`, v: s.pct }))} periods={["3M", "6M", "1Å"]} initial="1Å" color="#FF6B6B" decimals={2} height={150} />
          <p className="note">Nå {fmt(shortNow?.pct, 2)} % fordelt på {shortNow?.holders ?? 0} aktører.</p>
        </section>
      )}

      <div className="grid2">
        <section className="panel" aria-labelledby="h-bm">
          <div className="ph"><h2 id="h-bm">Børsmeldinger</h2><span className="src">Oslo Børs Newsweb</span></div>
          {releases.length === 0 ? <div className="empty">Hentes ved neste kjøring.</div> : releases.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="m src" style={{ minWidth: 86 }}>{day(a.published)}</span>
              <span className="chip" style={{ color: "var(--accent)" }}>{a.kind}</span>
              <Link href={`/melding/${a.id}`} style={{ color: "var(--text)", flex: "1 1 220px" }}>{a.title}</Link>
            </div>
          ))}
        </section>
        <section className="panel" aria-labelledby="h-intern">
          <div className="ph"><h2 id="h-intern">Innsidehandel</h2><span className="src">Meldepliktige handler · Newsweb</span></div>
          {insider.length === 0 ? <div className="empty">Ingen meldepliktige handler registrert.</div> : insider.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid var(--line2)", alignItems: "baseline" }}>
              <span className="m src" style={{ minWidth: 86 }}>{day(a.published)}</span>
              <Link href={`/melding/${a.id}`} style={{ color: "var(--text)" }}>{a.title}</Link>
            </div>
          ))}
        </section>
      </div>

      <section className="panel" aria-labelledby="h-conews">
        <div className="ph"><h2 id="h-conews">Nyheter om {co.name}</h2><span className="src">{news.length} saker siste 7 dager</span></div>
        <NewsList items={news} filters={news.length > 8} />
        <p className="note">Analyseverktøy, ikke investeringsråd.</p>
      </section>
    </>
  );
}
