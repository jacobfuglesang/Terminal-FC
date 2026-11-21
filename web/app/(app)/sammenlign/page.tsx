import CompareChart, { type Series } from "@/components/CompareChart";
import { getAllDaily, getFeed, getSalmon } from "@/lib/db";
import { weekDate } from "@/lib/dates";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = { "MOWI.OL": "#FF8A5B", "SALM.OL": "#5BA8FF", "BAKKA.OL": "#B98CFF", "LSG.OL": "#4FD1C5", "GSF.OL": "#F2C94C" };

export default async function Sammenlign() {
  const [daily, salmon, feed] = await Promise.all([getAllDaily(), getSalmon(70), getFeed()]);
  const series: Series[] = [
    ...COMPANIES.map((c) => ({ id: c.symbol, name: c.name, color: COLORS[c.symbol], pts: daily[c.symbol] ?? [] })),
    { id: "laks", name: "Laksepris SSB", color: "#F4F5F7", dash: "6 4", pts: salmon.filter((s) => s.fresh_price).map((s) => ({ t: weekDate(s.year, s.week), v: s.fresh_price as number })) },
    { id: "for", name: "Fôrråvareindeks", color: "#A0A7B2", dash: "2 3", pts: feed.index.map((f) => ({ t: `${f.month}T00:00:00Z`, v: f.nok ?? f.usd })) },
    { id: "EURNOK=X", name: "EUR/NOK", color: "#7FB8FF", dash: "1 3", pts: daily["EURNOK=X"] ?? [] },
  ];
  return (
    <section className="panel" aria-labelledby="h-sml">
      <div className="ph">
        <h2 id="h-sml">Kurser mot laksepris, fôr og valuta</h2>
        <span className="src">Yahoo Finance · SSB · IMF/FRED</span>
      </div>
      <CompareChart series={series} initialOn={["MOWI.OL", "SALM.OL", "laks", "for"]} />
    </section>
  );
}
