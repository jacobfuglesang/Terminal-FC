import type { ScreenRow } from "@/components/ScreenerTable";
import { change, runRateYield, ttmYield } from "@/lib/calc";
import { getAllDaily, getAllFundamentals, getQuotes, getShorts } from "@/lib/db";
import { COMPANIES } from "@/lib/universe";

// Samler alt som trengs for rederitabellen
export async function screenRows(): Promise<ScreenRow[]> {
  const [quotes, daily, funds, shorts] = await Promise.all([getQuotes(), getAllDaily(COMPANIES.map((c) => c.symbol)), getAllFundamentals(), getShorts()]);
  const q = Object.fromEntries(quotes.map((x) => [x.symbol, x]));
  const lastShort: Record<string, number> = {};
  for (const s of shorts) lastShort[s.symbol] = s.pct; // sortert etter dato, så siste vinner
  return COMPANIES.map((c) => {
    const pts = daily[c.symbol] ?? [];
    const f = funds[c.symbol];
    const price = q[c.symbol]?.price ?? pts[pts.length - 1]?.v ?? null;
    const eps1 = f?.eps?.["+1y"]?.avg ?? null;
    const tr = f?.eps_trend?.["0y"];
    const cur = tr?.current ?? null, ago = tr?.["30daysAgo"] ?? null;
    // P/E: resultat per aksje kan være i USD/EUR/DKK mens kursen er i NOK; Yahoo sin forwardPE tar høyde for det
    return {
      id: c.id, name: c.name, ticker: c.ticker, segment: c.segment, price,
      d1: q[c.symbol]?.change_pct ?? null, w1: change(pts, 7), m1: change(pts, 30), m3: change(pts, 91), y1: change(pts, 365),
      ttm: ttmYield(f?.dividends, price), run: runRateYield(f?.dividends, price),
      short: lastShort[c.symbol] ?? null,
      fwdPE: f?.info?.forwardPE ?? (eps1 && price && f?.info?.financialCurrency === "NOK" ? price / eps1 : null),
      epsRev: cur !== null && ago ? ((cur - ago) / Math.abs(ago)) * 100 : null,
      next: f?.next_report?.date ?? null,
    };
  });
}
