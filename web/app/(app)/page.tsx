import Link from "next/link";
import { Bars, LineChart } from "@/components/Charts";
import { getQuotes, getSalmon, getStatus } from "@/lib/db";
import { compact, fmt, osloTime, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Oversikt() {
  const [quotes, salmon, status] = await Promise.all([getQuotes(), getSalmon(52), getStatus()]);
  const bySym = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
  const fx = bySym["EURNOK=X"];
  const last = salmon[salmon.length - 1];
  const prev = salmon[salmon.length - 2];
  const wChange = last?.fresh_price && prev?.fresh_price ? (last.fresh_price / prev.fresh_price - 1) * 100 : null;
  const vChange = last?.fresh_tonnes && prev?.fresh_tonnes ? (last.fresh_tonnes / prev.fresh_tonnes - 1) * 100 : null;
  const lastUpdate = quotes.map((q) => q.updated_at).sort().pop();
  const recent = salmon.slice(-8);

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="l">SSB laksepris {last ? `uke ${last.week}` : ""}</div>
          <div className="v m">{last ? `${fmt(last.fresh_price)} kr` : "–"}</div>
          <div className={`d m ${up(wChange) ? "upc" : "downc"}`}>{wChange === null ? "Venter på data" : `${pct(wChange)} fra uke ${prev?.week}`}</div>
        </div>
        <div className="kpi">
          <div className="l">Eksportert fersk laks {last ? `uke ${last.week}` : ""}</div>
          <div className="v m">{last ? `${fmt(last.fresh_tonnes, 0)} t` : "–"}</div>
          <div className={`d m ${up(vChange) ? "upc" : "downc"}`}>{vChange === null ? "Venter på data" : `${pct(vChange)} fra uke ${prev?.week}`}</div>
        </div>
        <div className="kpi">
          <div className="l">EUR/NOK</div>
          <div className="v m">{fx ? fmt(fx.price, 4) : "–"}</div>
          <div className={`d m ${up(fx?.change_pct) ? "upc" : "downc"}`}>{fx ? `${pct(fx.change_pct)} i dag` : "Venter på data"}</div>
        </div>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "1 1 360px" }} aria-labelledby="h-kurser">
          <div className="ph">
            <h2 id="h-kurser">Kurser</h2>
            <span className="src">Yahoo Finance · sist hentet {osloTime(lastUpdate)}</span>
          </div>
          {quotes.length === 0 ? (
            <div className="empty">Ingen kurser ennå. De kommer etter første automatiske henting.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Selskap</th>
                  <th>Siste</th>
                  <th>I dag</th>
                  <th>Volum</th>
                </tr>
              </thead>
              <tbody>
                {COMPANIES.map((c) => {
                  const q = bySym[c.symbol];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/selskap/${c.id}`} style={{ color: "#E8EAED", fontWeight: 600 }}>
                          {c.name}
                        </Link>{" "}
                        <span style={{ color: "#8A919C", fontSize: 11 }}>{c.ticker}</span>
                      </td>
                      <td className="m">{fmt(q?.price)}</td>
                      <td className={`m ${up(q?.change_pct) ? "upc" : "downc"}`}>{pct(q?.change_pct)}</td>
                      <td className="m" style={{ color: "#A0A7B2" }}>{compact(q?.volume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-laks">
          <div className="ph">
            <h2 id="h-laks">Laksepris siste 52 uker</h2>
            <span className="src">SSB tabell 03024 · kr/kg fersk laks · CC BY 4.0</span>
          </div>
          <LineChart values={salmon.filter((s) => s.fresh_price).map((s) => s.fresh_price as number)} labels={salmon.filter((s) => s.fresh_price).map((s) => `Uke ${s.week} ${s.year}`)} />
        </section>
      </div>

      <div className="row">
        <section className="panel" style={{ flex: "999 1 520px" }} aria-labelledby="h-uker">
          <div className="ph">
            <h2 id="h-uker">Siste åtte onsdager</h2>
            <span className="src">Pris kr/kg · eksportert mengde i tusen tonn</span>
          </div>
          <Bars
            items={recent.map((s, i) => ({
              label: `U${s.week}`,
              value: s.fresh_price ?? 0,
              sub: s.fresh_tonnes ? `${(s.fresh_tonnes / 1000).toFixed(1).replace(".", ",")} t` : undefined,
              highlight: i === recent.length - 1,
            }))}
          />
        </section>
        <section className="panel" style={{ flex: "1 1 300px" }} aria-labelledby="h-kilder">
          <div className="ph">
            <h2 id="h-kilder">Datakilder</h2>
            <Link href="/status" className="src" style={{ color: "#FF8A5B" }}>
              Systemstatus →
            </Link>
          </div>
          {status.length === 0 ? (
            <div className="empty">Ingen hentinger registrert ennå.</div>
          ) : (
            status.map((s) => (
              <div key={s.source} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid #1C1F25", fontSize: 12 }}>
                <span>{s.source}</span>
                <span className={s.ok ? "upc" : "downc"}>{s.ok ? `OK ${osloTime(s.last_run)}` : "Feil"}</span>
              </div>
            ))
          )}
          <p className="note">Analyseverktøy, ikke investeringsråd.</p>
        </section>
      </div>
    </>
  );
}
