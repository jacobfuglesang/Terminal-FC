import TimeChart, { type Pt } from "@/components/TimeChart";
import { getAllDaily, getBunkers } from "@/lib/db";
import { fmt, up } from "@/lib/format";

export const dynamic = "force-dynamic";

const PORTS = ["Singapore", "Rotterdam", "Fujairah", "Houston", "Piraeus", "Istanbul", "Santos"];

// Lager en ny serie av flere, bare for datoer der alle finnes
function combine(src: Record<string, Pt[]>, syms: string[], f: (v: number[]) => number): Pt[] {
  const maps = syms.map((s) => new Map((src[s] ?? []).map((p) => [p.t.slice(0, 10), p.v])));
  return [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort()
    .map((d) => ({ t: `${d}T16:00:00Z`, v: f(maps.map((m) => m.get(d)!)) }));
}

const change = (s: Pt[], days: number) => {
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const target = new Date(last.t).getTime() - days * 864e5;
  const prev = [...s].reverse().find((p) => new Date(p.t).getTime() <= target);
  return prev ? last.v - prev.v : null;
};

const SPREADS: { id: string; title: string; unit: string; syms: string[]; f: (v: number[]) => number; why: string }[] = [
  { id: "bw", title: "Brent minus WTI", unit: "USD/fat", syms: ["BZ=F", "CL=F"], f: ([b, w]) => b - w,
    why: "Stor forskjell gjør amerikansk råolje billig for kjøpere i Europa og Asia. Det gir lange seilaser fra USA og flere tonnmil for VLCC og Aframax." },
  { id: "321", title: "Raffineringsmargin 3-2-1 (WTI)", unit: "USD/fat", syms: ["RB=F", "HO=F", "CL=F"], f: ([rb, ho, cl]) => (2 * rb * 42 + ho * 42) / 3 - cl,
    why: "Hvor mye raffineriene tjener på å lage bensin og diesel. Høy margin gir høy produksjon og mer produkter å frakte, bra for produkttank (Hafnia)." },
  { id: "diesel", title: "Dieselmargin (mot Brent)", unit: "USD/fat", syms: ["HO=F", "BZ=F"], f: ([ho, b]) => ho * 42 - b,
    why: "Diesel er den viktigste lasten for produkttankskip mellom Midtøsten/India, Europa og USA. Høy margin og stor regional forskjell gir mer handel." },
  { id: "bensin", title: "Bensinmargin (mot Brent)", unit: "USD/fat", syms: ["RB=F", "BZ=F"], f: ([rb, b]) => rb * 42 - b,
    why: "Sesongpreget (høyest før sommeren). Påvirker raffinering og eksport av bensin, særlig fra Europa til USA og Vest-Afrika." },
  { id: "ttfhh", title: "Gass Europa (TTF) minus USA (Henry Hub)", unit: "USD/MMBtu", syms: ["TTF=F", "EURUSD=X", "NG=F"], f: ([ttf, eur, hh]) => (ttf * eur) / 3.412 - hh,
    why: "Stor forskjell gjør det lønnsomt å eksportere LNG fra USA til Europa. Påvirker LNG-skip og indirekte LPG (BW LPG) gjennom amerikansk eksport." },
  { id: "jkmttf", title: "LNG Asia (JKM) minus Europa (TTF)", unit: "USD/MMBtu", syms: ["JKM=F", "TTF=F", "EURUSD=X"], f: ([jkm, ttf, eur]) => jkm - (ttf * eur) / 3.412,
    why: "Positiv forskjell trekker LNG-laster mot Asia i stedet for Europa. Det gir lengre seilaser og binder opp flere skip." },
];

export default async function Bunkers() {
  const [bunk, daily] = await Promise.all([
    getBunkers(400),
    getAllDaily(["BZ=F", "CL=F", "RB=F", "HO=F", "TTF=F", "NG=F", "JKM=F", "EURUSD=X"]),
  ]);
  const lastDay = bunk.length ? bunk[bunk.length - 1].day : null;
  const latest = (port: string, grade: string) => bunk.filter((b) => b.port === port && b.grade === grade).at(-1);
  const hist = (port: string, f: (g: Record<string, number>) => number | null): Pt[] => {
    const by = new Map<string, Record<string, number>>();
    for (const b of bunk.filter((x) => x.port === port)) (by.get(b.day) ?? by.set(b.day, {}).get(b.day)!)[b.grade] = b.price;
    return [...by.entries()].map(([d, g]) => ({ t: `${d}T12:00:00Z`, v: f(g) })).filter((p): p is Pt => p.v !== null);
  };
  const sgScrub = hist("Singapore", (g) => (g.VLSFO && g.HSFO ? g.VLSFO - g.HSFO : null));
  const sgV = hist("Singapore", (g) => g.VLSFO ?? null);
  const spreads = SPREADS.map((s) => ({ ...s, pts: combine(daily, s.syms, s.f) }));

  return (
    <>
      <section className="panel" aria-labelledby="h-bunk">
        <div className="ph">
          <h2 id="h-bunk">Bunkerpriser</h2>
          <span className="src">USD per tonn · BunkerEx via Hellenic Shipping News · {lastDay ?? "venter på første henting"}</span>
        </div>
        {!lastDay ? <div className="empty">Bunkerprisene hentes ved neste morgenkjøring.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 560 }}>
              <thead><tr><th>Havn</th><th>VLSFO (lavsvovel)</th><th>HSFO (IFO380)</th><th>MGO</th><th>Scrubberspread</th></tr></thead>
              <tbody>
                {PORTS.map((p) => {
                  const v = latest(p, "VLSFO"), h = latest(p, "HSFO"), m = latest(p, "MGO");
                  if (!v && !h && !m) return null;
                  const cell = (x?: { price: number; change: number | null }) => (
                    <td className="m">{x ? fmt(x.price, 0) : "–"}{x?.change ? <span className={x.change >= 0 ? "upc" : "downc"} style={{ fontSize: 11, marginLeft: 6 }}>{x.change > 0 ? "+" : ""}{fmt(x.change, 0)}</span> : null}</td>
                  );
                  return (
                    <tr key={p}><td>{p}</td>{cell(v)}{cell(h)}{cell(m)}<td className="m">{v && h ? fmt(v.price - h.price, 0) : "–"}</td></tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">Bunkers er den største variable kostnaden på en seilas. Scrubberspread = VLSFO minus HSFO: jo større forskjell, jo mer tjener skip med
          scrubber (som kan brenne billig HSFO) mot skip uten. Det er en fordel for rederier med mange scrubbere, for eksempel Frontline og Okeanis.
          Historikken bygges opp fra første henting.</p>
        {sgV.length > 1 && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ flex: "1 1 360px" }}><div className="src">Singapore VLSFO (USD/tonn)</div><TimeChart daily={sgV} periods={["1M", "3M", "6M", "1Å"]} initial="3M" decimals={0} /></div>
            <div style={{ flex: "1 1 360px" }}><div className="src">Singapore scrubberspread (USD/tonn)</div><TimeChart daily={sgScrub} periods={["1M", "3M", "6M", "1Å"]} initial="3M" decimals={0} color="#5BA8FF" /></div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-arb">
        <div className="ph"><h2 id="h-arb">Arbitrasjevinduer og marginer</h2><span className="src">Beregnet fra terminpriser hos Yahoo Finance (front-måned)</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {spreads.map((s) => {
            const last = s.pts.at(-1);
            const w = change(s.pts, 7), m = change(s.pts, 30);
            return (
              <div key={s.id} style={{ border: "1px solid var(--line2)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <b>{s.title}</b>
                  <span className="m" style={{ fontSize: 18 }}>{last ? fmt(last.v, 2) : "–"} <span className="src">{s.unit}</span></span>
                </div>
                <div className="src" style={{ marginBottom: 6 }}>
                  1 uke: <span className={up(w) ? "upc" : "downc"}>{w === null ? "–" : `${w > 0 ? "+" : ""}${fmt(w, 2)}`}</span> ·
                  1 mnd: <span className={up(m) ? "upc" : "downc"}>{m === null ? "–" : `${m > 0 ? "+" : ""}${fmt(m, 2)}`}</span>
                </div>
                {s.pts.length > 1 ? <TimeChart daily={s.pts} periods={["1M", "3M", "6M", "1Å"]} initial="6M" decimals={2} height={160} />
                  : <div className="empty">Dataene hentes ved neste kjøring.</div>}
                <p className="note" style={{ marginBottom: 0 }}>{s.why}</p>
              </div>
            );
          })}
        </div>
        <p className="note">Marginene er forenklede (bruker front-måneds termin, ikke fysiske priser i hver region, og 1 fat = 42 gallon, 1 MWh = 3,412 MMBtu).
          De viser retning og nivå, ikke nøyaktig fortjeneste.</p>
      </section>
    </>
  );
}
