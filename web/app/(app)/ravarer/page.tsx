import TimeChart from "@/components/TimeChart";
import { change } from "@/lib/calc";
import { getAllDaily, getQuotes } from "@/lib/db";
import { fmt, pct, up } from "@/lib/format";
import { MARKET_NAME } from "@/lib/universe";

export const dynamic = "force-dynamic";

const ITEMS: { sym: string; unit: string; why: string; color: string; dec: number }[] = [
  { sym: "BZ=F", unit: "USD per fat", why: "Høy oljepris og bratt kurve gir mer handel og lagring på sjøen. Påvirker også bunkerskostnaden.", color: "#FF8A5B", dec: 2 },
  { sym: "TIO=F", unit: "USD per tonn", why: "Jernmalm er den største lasten for Capesize-skipene (Brasil og Australia til Kina).", color: "#5BA8FF", dec: 2 },
  { sym: "TTF=F", unit: "EUR per MWh", why: "Europeisk gasspris. Påvirker LNG-handelen og etterspørselen etter LNG- og LPG-skip.", color: "#4FD1C5", dec: 2 },
  { sym: "NG=F", unit: "USD per MMBtu", why: "Amerikansk gasspris. Billig gass gir mye eksport av LPG og LNG fra USA.", color: "#B98CFF", dec: 3 },
  { sym: "HG=F", unit: "USD per pund", why: "Kobber følger industriaktiviteten, særlig i Kina.", color: "#F2C94C", dec: 3 },
  { sym: "ZS=F", unit: "US-cent per bushel", why: "Soyabønner fra Brasil og USA er en viktig last for Panamax-skip.", color: "#7BE3A6", dec: 0 },
  { sym: "NOK=X", unit: "kroner per dollar", why: "Rederiene tjener i dollar. Sterkere dollar gir høyere resultat og utbytte målt i kroner.", color: "#A0A7B2", dec: 3 },
  { sym: "OSEBX.OL", unit: "indeks", why: "Oslo Børs hovedindeks, til sammenligning.", color: "#E8EAED", dec: 0 },
];

export default async function Ravarer() {
  const [daily, quotes] = await Promise.all([getAllDaily(ITEMS.map((i) => i.sym)), getQuotes()]);
  const q = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
  return (
    <>
      <div className="kpis">
        {ITEMS.slice(0, 6).map((i) => {
          const ch = change(daily[i.sym] ?? [], 30);
          return (
            <div className="kpi" key={i.sym}>
              <div className="l">{MARKET_NAME[i.sym]}</div>
              <div className="v m">{fmt(q[i.sym]?.price, i.dec)}</div>
              <div className={`d m ${ch === null ? "" : up(ch) ? "upc" : "downc"}`}>{pct(ch)} på en måned</div>
            </div>
          );
        })}
      </div>
      <div className="grid2">
        {ITEMS.map((i) => (
          <section className="panel" key={i.sym} aria-labelledby={`h-${i.sym}`}>
            <div className="ph"><h2 id={`h-${i.sym}`}>{MARKET_NAME[i.sym]}</h2><span className="src">{i.unit} · Yahoo Finance</span></div>
            {(daily[i.sym] ?? []).length < 2 ? <div className="empty">Venter på data.</div> : (
              <TimeChart daily={daily[i.sym]} periods={["1M", "3M", "6M", "1Å"]} initial="1Å" color={i.color} decimals={i.dec} height={170} />
            )}
            <p className="note">{i.why}</p>
          </section>
        ))}
      </div>
    </>
  );
}
