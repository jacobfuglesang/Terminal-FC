import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar, { type TickerItem } from "@/components/TopBar";
import { getQuotes, getSalmon } from "@/lib/db";
import { fmt, pct, up } from "@/lib/format";
import { COMPANIES } from "@/lib/menu";
import { COOKIE, verifySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!(await verifySession(token))) redirect("/login");

  const [quotes, salmon] = await Promise.all([getQuotes(), getSalmon(2)]);
  const bySym = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  const ticker: TickerItem[] = [];
  for (const c of COMPANIES) {
    const q = bySym[c.symbol];
    if (q) ticker.push({ label: c.ticker, price: fmt(q.price), change: pct(q.change_pct), up: up(q.change_pct) });
  }
  const fx = bySym["EURNOK=X"];
  if (fx) ticker.push({ label: "EUR/NOK", price: fmt(fx.price, 4), change: pct(fx.change_pct), up: up(fx.change_pct) });
  const last = salmon[salmon.length - 1];
  if (last) ticker.push({ label: `SSB U${last.week}`, price: `${fmt(last.fresh_price)} kr/kg`, change: "", up: null });

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
