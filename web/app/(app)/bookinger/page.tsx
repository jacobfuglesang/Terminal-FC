import BookingApp, { type CoData } from "@/components/BookingApp";
import { listBookingInputs } from "@/lib/bookings";
import { getAllDaily, getAllFundamentals, getQuotes, getReports } from "@/lib/db";
import { cmpQuarter, matchRate, matchVessels, nextQuarter, parseQuarter, pickBookings, proxyFor } from "@/lib/earnings";
import { COMPANIES } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function Bookinger() {
  const [reports, funds, quotes, daily, inputs] = await Promise.all([
    getReports({ limit: 300 }), getAllFundamentals(), getQuotes(), getAllDaily(["BWET", "BDRY"]), listBookingInputs(),
  ]);
  const quote = (s: string) => quotes.find((q) => q.symbol === s);

  const cos: CoData[] = COMPANIES.map((c) => {
    // Nyeste leste rapport for selskapet (listen er sortert med nyeste først)
    const rep = reports.find((r) => r.symbol === c.symbol && r.data && parseQuarter(r.period));
    const f = funds[c.symbol];
    const base = {
      symbol: c.symbol, name: c.name, segment: c.segment, id: c.id,
      shares: f?.info?.sharesOutstanding ?? null, price: quote(c.symbol)?.price ?? null,
      eps: f?.next_report ? { date: f.next_report.date, est: f.next_report.eps_estimate } : null,
      currency: f?.info?.financialCurrency ?? null,
    };
    if (!rep?.data) return { ...base, report: null, bookPeriod: null, segs: [], dividend: null };
    const d = rep.data;
    let period = nextQuarter(rep.period);
    let rows = pickBookings(d.bookings ?? [], period);
    if (!rows.length) {
      // Rapporten kan oppgi booking for et annet kvartal (f.eks. to kvartaler fram). Ta det nærmeste etter rapporten.
      const later = (d.bookings ?? []).map((b) => b.period ?? "").filter((p) => parseQuarter(p) && cmpQuarter(p, rep.period) > 0).sort(cmpQuarter);
      if (later.length) {
        period = later[0];
        rows = pickBookings(d.bookings ?? [], period);
      }
    }
    const segs = rows.map((b) => {
      const seg = b.segment ?? "flåtesnitt";
      const be = matchRate(d.breakeven, seg);
      const tce = matchRate(d.tce, seg);
      return {
        segment: seg, share: (b.share_pct ?? 0) / 100, rate: b.rate ?? 0, note: b.note ?? "",
        ok: b.rate_ok !== false && b.share_pct_ok !== false,
        vessels: matchVessels(d.vessels, seg),
        breakeven: be ? { rate: be.rate ?? 0, ok: be.rate_ok !== false, segment: be.segment ?? "" } : null,
        tce: tce ? { rate: tce.rate ?? 0, period: tce.period ?? rep.period } : null,
        proxy: proxyFor(seg, c.segment),
      };
    });
    return {
      ...base,
      report: { key: rep.key, period: rep.period, published: rep.published, byRule: !!d.bookings_by_rule, reading: rep.status === "pending" },
      bookPeriod: rows.length ? period : null,
      segs,
      dividend: d.dividend?.per_share != null ? { perShare: d.dividend.per_share, unit: d.dividend.unit ?? "" } : null,
    };
  });

  const compact = (s: string) => ({ d: (daily[s] ?? []).map((p) => p.t.slice(0, 10)), v: (daily[s] ?? []).map((p) => p.v) });
  return (
    <BookingApp
      cos={cos}
      inputs={inputs}
      usdnok={quote("NOK=X")?.price ?? null}
      proxies={{ BWET: compact("BWET"), BDRY: compact("BDRY") }}
    />
  );
}
