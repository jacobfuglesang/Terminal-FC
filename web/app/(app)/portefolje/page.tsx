import PortfolioApp, { FACTORS } from "@/components/PortfolioApp";
import { getAllDaily, getQuotes } from "@/lib/db";
import type { Series } from "@/lib/pfmath";
import { listTrades } from "@/lib/portfolio";
import { COMPANIES } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function Portefolje() {
  const syms = [...COMPANIES.map((c) => c.symbol), ...FACTORS.map((f) => f.sym)];
  const [trades, quotes, daily] = await Promise.all([listTrades(), getQuotes(), getAllDaily(syms)]);
  const q = Object.fromEntries(quotes.filter((x) => x.price !== null).map((x) => [x.symbol, { price: Number(x.price), change_pct: x.change_pct }]));
  // Kompakt form til nettleseren: datoer og sluttkurser per symbol
  const series: Record<string, Series> = {};
  for (const [s, pts] of Object.entries(daily)) series[s] = { d: pts.map((p) => p.t.slice(0, 10)), v: pts.map((p) => p.v) };
  return (
    <PortfolioApp
      initial={trades}
      quotes={q}
      series={series}
      companies={COMPANIES.map((c) => ({ symbol: c.symbol, name: c.name, segment: c.segment, id: c.id }))}
    />
  );
}
