import TimeChart from "@/components/TimeChart";
import { getAllDaily, getIntraday, getQuotes, getShorts } from "@/lib/db";
import { fmt, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Marked() {
  const [daily, quotes, shorts, eurIntra, usdIntra] = await Promise.all([getAllDaily(), getQuotes(), getShorts(), getIntraday("EURNOK=X"), getIntraday("NOK=X")]);
  const q = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
  const now = Date.now();
  const rows = COMPANIES.map((c) => {
    const s = shorts.filter((x) => x.symbol === c.symbol);
    const last = s[s.length - 1];
    const before = [...s].reverse().find((x) => new Date(x.day).getTime() < now - 30 * 86400_000);
    return { ...c, pct: last?.pct ?? 0, holders: last?.holders ?? 0, day: last?.day ?? null, ch: last ? last.pct - (before?.pct ?? 0) : null, hist: s };
  });
  const maxPct = Math.max(1, ...rows.map((r) => r.pct));

  return (
    <>
      <div className="row">
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-eur">
          <div className="ph"><h2 id="h-eur">EUR/NOK</h2><span className="src m">{fmt(q["EURNOK=X"]?.price, 4)} <span className={up(q["EURNOK=X"]?.change_pct) ? "upc" : "downc"}>{pct(q["EURNOK=X"]?.change_pct)}</span></span></div>
          <TimeChart daily={daily["EURNOK=X"] ?? []} intraday={eurIntra} color="#5BA8FF" decimals={3} initial="6M" height={180} />
          <p className="note">Laksen selges i euro. Høyere kurs = svakere krone = høyere laksepris i kroner.</p>
        </section>
        <section className="panel" style={{ flex: "1 1 420px" }} aria-labelledby="h-usd">
          <div className="ph"><h2 id="h-usd">USD/NOK</h2><span className="src m">{fmt(q["NOK=X"]?.price, 4)} <span className={up(q["NOK=X"]?.change_pct) ? "upc" : "downc"}>{pct(q["NOK=X"]?.change_pct)}</span></span></div>
          <TimeChart daily={daily["NOK=X"] ?? []} intraday={usdIntra} color="#B98CFF" decimals={3} initial="6M" height={180} />
          <p className="note">Fôrråvarer handles i dollar. Sterkere dollar gjør fôret dyrere i kroner.</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="h-short">
        <div className="ph"><h2 id="h-short">Shortposisjoner</h2><span className="src">Finanstilsynet · sum offentlige posisjoner (minst 0,5 % per aktør)</span></div>
        <table className="tbl">
          <thead><tr><th>Selskap</th><th style={{ textAlign: "left", paddingLeft: 16 }}>Andel shortet</th><th>Siste</th><th>Endring 30 dager</th><th>Aktører</th><th>Sist endret</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ paddingLeft: 16, width: "30%" }}><div style={{ height: 8, background: "#0F1114", borderRadius: 4 }}><div style={{ height: 8, width: `${(r.pct / maxPct) * 100}%`, background: "#B98CFF", borderRadius: 4 }} /></div></td>
                <td className="m">{fmt(r.pct, 2)} %</td>
                <td className={`m ${r.ch !== null && r.ch > 0 ? "downc" : "upc"}`}>{r.ch === null ? "–" : `${r.ch >= 0 ? "+" : "−"}${fmt(Math.abs(r.ch), 2)}`}</td>
                <td className="m">{r.holders}</td>
                <td className="m" style={{ color: "#A0A7B2" }}>{r.day ?? "Ingen offentlige"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">Mange shortposisjoner betyr at flere satser på kursfall. Rødt = shortandelen har økt.</p>
      </section>

      <div className="row">
        {rows.filter((r) => r.hist.length > 1).map((r) => (
          <section key={r.id} className="panel" style={{ flex: "1 1 320px" }} aria-label={`Short ${r.name}`}>
            <div className="ph"><h2>Short {r.name}</h2><span className="src">% av aksjene</span></div>
            <TimeChart daily={r.hist.map((h) => ({ t: `${h.day}T12:00:00Z`, v: h.pct }))} periods={["3M", "6M", "1Å"]} initial="1Å" color="#B98CFF" decimals={2} height={120} />
          </section>
        ))}
      </div>
    </>
  );
}
