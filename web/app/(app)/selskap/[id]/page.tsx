import { notFound } from "next/navigation";
import { LineChart } from "@/components/Charts";
import { getDaily, getQuotes } from "@/lib/db";
import { compact, fmt, osloTime, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const co = COMPANIES.find((c) => c.id === id);
  if (!co) notFound();
  const [quotes, daily] = await Promise.all([getQuotes(), getDaily(co.symbol)]);
  const q = quotes.find((x) => x.symbol === co.symbol);
  const first = daily[0]?.close;
  const lastClose = daily[daily.length - 1]?.close;
  const yearChange = first && lastClose ? (lastClose / first - 1) * 100 : null;

  return (
    <>
      <section className="panel" style={{ display: "flex", flexWrap: "wrap", gap: "20px 36px", alignItems: "center" }}>
        <div>
          <div className="src">Kurs · {co.ticker}</div>
          <div className="m" style={{ fontSize: 26, fontWeight: 600 }}>
            {fmt(q?.price)} <span className={up(q?.change_pct) ? "upc" : "downc"} style={{ fontSize: 13 }}>{pct(q?.change_pct)}</span>
          </div>
        </div>
        <div>
          <div className="src">Volum i dag</div>
          <div className="m" style={{ fontSize: 18 }}>{compact(q?.volume)}</div>
        </div>
        <div>
          <div className="src">Siste år</div>
          <div className={`m ${up(yearChange) ? "upc" : "downc"}`} style={{ fontSize: 18 }}>{pct(yearChange)}</div>
        </div>
        <div>
          <div className="src">Sist hentet</div>
          <div className="m" style={{ fontSize: 18 }}>{osloTime(q?.updated_at)}</div>
        </div>
      </section>
      <section className="panel" aria-labelledby="h-graf">
        <div className="ph">
          <h2 id="h-graf">Kurs siste år</h2>
          <span className="src">Sluttkurs per dag · Yahoo Finance</span>
        </div>
        <LineChart values={daily.map((d) => d.close)} labels={daily.map((d) => d.day)} />
      </section>
      <section className="panel">
        <div className="empty">
          Markedsposisjon, kvartalsrapporter, planer, forventet resultat, interne forhold og nyheter kommer i fase 4.
        </div>
      </section>
    </>
  );
}
