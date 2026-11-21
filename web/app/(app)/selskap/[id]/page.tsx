import { notFound } from "next/navigation";
import TimeChart from "@/components/TimeChart";
import NewsList from "@/components/NewsList";
import { getDaily, getIntraday, getNews, getQuotes } from "@/lib/db";
import { compact, fmt, osloTime, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const co = COMPANIES.find((c) => c.id === id);
  if (!co) notFound();
  const [quotes, daily, intra, allNews] = await Promise.all([getQuotes(), getDaily(co.symbol), getIntraday(co.symbol), getNews(400)]);
  const news = allNews.filter((n) => n.companies.includes(co.symbol));
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
          <h2 id="h-graf">Kursutvikling</h2>
          <span className="src">15-minutters kurser for 1 dag og 1 uke, ellers sluttkurs · Yahoo Finance</span>
        </div>
        <TimeChart daily={daily.map((d) => ({ t: `${d.day}T16:00:00Z`, v: d.close }))} intraday={intra} decimals={2} />
      </section>
      <section className="panel" aria-labelledby="h-conews">
        <div className="ph">
          <h2 id="h-conews">Nyheter om {co.name}</h2>
          <span className="src">{news.length} saker siste 90 dager</span>
        </div>
        <NewsList items={news} filters={news.length > 8} />
      </section>
      <section className="panel">
        <div className="empty">
          Markedsposisjon, kvartalsrapporter, planer, forventet resultat og interne forhold kommer i fase 4.
        </div>
      </section>
    </>
  );
}
