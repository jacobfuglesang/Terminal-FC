import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar, { type TickerItem } from "@/components/TopBar";
import { getQuotes } from "@/lib/db";
import { fmt, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";
import { MARKET_NAME } from "@/lib/universe";
import { COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!(await verifySession(token))) redirect("/login");

  const quotes = await getQuotes();
  const bySym = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  // Fraktfutures og råvarer først, så rederiene
  const ticker: TickerItem[] = [];
  for (const [sym, label, dec] of [["BWET", "Tankfrakt", 2], ["BDRY", "Tørrbulkfrakt", 2], ["BZ=F", "Brent", 2], ["TIO=F", "Jernmalm", 2], ["NOK=X", "USD/NOK", 3]] as const) {
    const q = bySym[sym];
    if (q) ticker.push({ label: label || MARKET_NAME[sym], price: fmt(q.price, dec), change: pct(q.change_pct), up: up(q.change_pct) });
  }
  for (const c of COMPANIES) {
    const q = bySym[c.symbol];
    if (q) ticker.push({ label: c.ticker, price: fmt(q.price), change: pct(q.change_pct), up: up(q.change_pct) });
  }

  const changes = Object.fromEntries(COMPANIES.map((c) => [c.symbol, bySym[c.symbol]?.change_pct ?? null]));

  return (
    <div className="shell">
      <Sidebar changes={changes} />
      <div className="content">
        <TopBar ticker={ticker} />
        <main>{children}</main>
      </div>
    </div>
  );
}
