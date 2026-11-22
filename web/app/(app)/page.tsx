import Link from "next/link";
import Markdown from "@/components/Markdown";
import NewsList from "@/components/NewsList";
import ScreenerTable from "@/components/ScreenerTable";
import TimeChart from "@/components/TimeChart";
import { change } from "@/lib/calc";
import { getAlerts, getBriefs, getChokepoints, getDaily, getFreight, getIntraday, getNews, getQuotes, getStatus } from "@/lib/db";
import { fmt, osloTime, pct, up } from "@/lib/format";
import { screenRows } from "@/lib/screen";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, ch }: { label: string; value: string; sub: string; ch?: number | null }) {
  return (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v m">{value}</div>
      <div className={`d m ${ch === undefined || ch === null ? "" : up(ch) ? "upc" : "downc"}`} style={ch === undefined || ch === null ? { color: "#A0A7B2" } : undefined}>{sub}</div>
    </div>
  );
}

export default async function Oversikt() {
  const [quotes, rows, freight, chokes, bwet, bdry, bwetI, bdryI, alerts, briefs, news, status] = await Promise.all([
    getQuotes(), screenRows(), getFreight(["BDI", "SCFI", "WCI"]), getChokepoints(60), getDaily("BWET", 400), getDaily("BDRY", 400),
    getIntraday("BWET"), getIntraday("BDRY"), getAlerts(8), getBriefs(1), getNews(6), getStatus(),
  ]);
  const q = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
  const pts = (d: { day: string; close: number }[]) => d.map((x) => ({ t: `${x.day}T16:00:00Z`, v: x.close }));
  const fpts = (s: string) => (freight[s] ?? []).map((x) => ({ t: `${x.day}T12:00:00Z`, v: x.value }));
  const last = (s: string) => freight[s]?.[freight[s].length - 1];
  const hz = chokes.filter((c) => c.portid === "chokepoint6");
  const hz7 = hz.slice(-7), hzPrev = hz.slice(-28, -7);
  const avg = (a: typeof hz) => (a.length ? a.reduce((s, x) => s + x.total, 0) / a.length : null);
  const hzA = avg(hz7), hzB = avg(hzPrev);
  const brief = briefs[0];

  return (
    <>
      <div className="kpis">
        <Kpi label="Tankfrakt (BWET)" value={fmt(q.BWET?.price, 2)} sub={`${pct(change(pts(bwet), 7))} på en uke`} ch={change(pts(bwet), 7)} />
        <Kpi label="Tørrbulkfrakt (BDRY)" value={fmt(q.BDRY?.price, 2)} sub={`${pct(change(pts(bdry), 7))} på en uke`} ch={change(pts(bdry), 7)} />
        <Kpi label={`Baltic Dry ${last("BDI") ? new Date(last("BDI")!.day).toLocaleDateString("nb-NO", { day: "numeric", month: "short" }) : ""}`} value={fmt(last("BDI")?.value, 0)} sub={`${pct(change(fpts("BDI"), 7))} på en uke`} ch={change(fpts("BDI"), 7)} />
        <Kpi label="Containerrater (SCFI)" value={fmt(last("SCFI")?.value, 0)} sub={`${pct(change(fpts("SCFI"), 6))} siste uke`} ch={change(fpts("SCFI"), 6)} />
        <Kpi label="Brent" value={`${fmt(q["BZ=F"]?.price, 2)} $`} sub={pct(q["BZ=F"]?.change_pct)} ch={q["BZ=F"]?.change_pct} />
        <Kpi label="Hormuz, skip per dag" value={hzA === null ? "–" : fmt(hzA, 0)} sub={hzA !== null && hzB ? `${pct((hzA / hzB - 1) * 100)} mot 3 uker før` : "Snitt siste 7 dager"} ch={hzA !== null && hzB ? (hzA / hzB - 1) * 100 : null} />
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-brief">
          <div className="ph">
            <h2 id="h-brief">Analytikerens morgenrapport</h2>
            <Link href="/analytiker" className="src" style={{ color: "#FF8A5B" }}>Hele rapporten og spørsmål →</Link>
          </div>
          {brief ? (
            <>
              <Markdown text={brief.text} limitSections={2} />
              <p className="note">Skrevet av KI {new Date(brief.created).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Oslo" })} ut fra dataene i terminalen. Ikke investeringsråd.</p>
            </>
          ) : (
            <div className="empty">Første rapport skrives ved neste morgenkjøring (krever Groq-nøkkel i GitHub).</div>
          )}
        </section>
        <section className="panel" style={{ flex: "1 1 320px" }} aria-labelledby="h-alerts">
          <div className="ph">
            <h2 id="h-alerts">Siste varsler</h2>
            <Link href="/varsler" className="src" style={{ color: "#FF8A5B" }}>Alle →</Link>
          </div>
          {alerts.length === 0 ? <div className="empty">Ingen varsler ennå.</div> : alerts.map((a) => (
            <div key={a.key} style={{ padding: "8px 0", borderTop: "1px solid var(--line2)" }}>
              <div className="src">{a.kind} · {osloTime(a.created)}</div>
              {a.url ? <Link href={a.url} style={{ color: a.level >= 2 ? "#FFB08F" : "var(--text)" }}>{a.title}</Link> : <span style={{ color: a.level >= 2 ? "#FFB08F" : undefined }}>{a.title}</span>}
            </div>
          ))}
        </section>
      </div>

      <section className="panel" aria-labelledby="h-rederier">
        <div className="ph">
          <h2 id="h-rederier">Rederiene i dag</h2>
          <Link href="/selskaper" className="src" style={{ color: "#FF8A5B" }}>Full tabell med utbytte, P/E og short →</Link>
        </div>
        <ScreenerTable rows={rows} compact />
      </section>

      <div className="row">
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-bwet">
          <div className="ph"><h2 id="h-bwet">Tankfrakt: BWET</h2><span className="src">Fond som eier VLCC-fraktfutures (Midtøsten–Kina) · USD</span></div>
          <TimeChart daily={pts(bwet)} intraday={bwetI} decimals={2} initial="6M" />
        </section>
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-bdry">
          <div className="ph"><h2 id="h-bdry">Tørrbulkfrakt: BDRY</h2><span className="src">Fond som eier Capesize/Panamax/Supramax-futures · USD</span></div>
          <TimeChart daily={pts(bdry)} intraday={bdryI} decimals={2} initial="6M" color="#5BA8FF" />
        </section>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-snews">
          <div className="ph">
            <h2 id="h-snews">Siste nyheter</h2>
            <Link href="/nyheter" className="src" style={{ color: "#FF8A5B" }}>Alle nyheter →</Link>
          </div>
          <NewsList items={news} filters={false} />
        </section>
        <section className="panel" style={{ flex: "1 1 300px" }} aria-labelledby="h-kilder">
          <div className="ph">
            <h2 id="h-kilder">Datakilder</h2>
            <Link href="/status" className="src" style={{ color: "#FF8A5B" }}>Systemstatus →</Link>
          </div>
          {status.length === 0 ? <div className="empty">Ingen hentinger registrert ennå.</div> : status.map((s) => (
            <div key={s.source} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderBottom: "1px solid #1C1F25", fontSize: 12 }}>
              <span>{s.source}</span>
              <span className={s.ok ? "upc" : "downc"}>{s.ok ? `OK ${osloTime(s.last_run)}` : "Venter / feil"}</span>
            </div>
          ))}
          <p className="note">Analyseverktøy, ikke investeringsråd.</p>
        </section>
      </div>
    </>
  );
}
