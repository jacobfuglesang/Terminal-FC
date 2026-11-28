import type { CoData } from "@/components/BookingApp";
import { listBookingInputs } from "@/lib/bookings";
import { getAllDaily, getAllFundamentals, getQuotes, getReports } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import { cmpQuarter, estimate, isFleet, matchRate, matchVessels, nextQuarter, parseQuarter, pickBookings, proxyFor, quarterDays, quarterOf, segKey } from "@/lib/earnings";
import { COMPANIES } from "@/lib/universe";

type FleetRef = { symbol: string; segment: string; vessels: number | null; breakeven: number | null; breakeven_kind: string | null; source: string };

/** Fast reserve (content/fleet.json): antall skip og dødpunkt fra selskapenes rapporter, når rapportuttrekket mangler dem. */
function fleetRefs(): FleetRef[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "fleet.json"), "utf8")).rows ?? [];
  } catch {
    return [];
  }
}

function fleetRef(refs: FleetRef[], symbol: string, segment: string): FleetRef | null {
  const mine = refs.filter((r) => r.symbol === symbol);
  const k = segKey(segment);
  return mine.find((r) => segKey(r.segment) === k) ?? (k === "flåtesnitt" ? mine.find((r) => isFleet(r.segment)) ?? null : null);
}

// Samler alt bookingsiden og analytikeren trenger: siste rapport per selskap, antall aksjer, kurs og dine justeringer.
export async function loadBookingData() {
  const [reports, funds, quotes, daily, inputs] = await Promise.all([
    getReports({ limit: 300 }), getAllFundamentals(), getQuotes(), getAllDaily(["BWET", "BDRY"]), listBookingInputs(),
  ]);
  const quote = (s: string) => quotes.find((q) => q.symbol === s);
  const refs = fleetRefs();

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
      const ref = fleetRef(refs, c.symbol, seg);
      let vessels = matchVessels(d.vessels, seg);
      if (vessels.count == null && vessels.days == null && ref?.vessels) vessels = { count: ref.vessels, days: null, ok: true };
      const breakeven = be ? { rate: be.rate ?? 0, ok: be.rate_ok !== false, segment: be.segment ?? "" }
        : ref?.breakeven ? { rate: ref.breakeven, ok: ref.breakeven_kind !== "opex", segment: ref.breakeven_kind === "opex" ? "fast tabell, bare driftskostnad" : "fast tabell" } : null;
      return {
        segment: seg, share: (b.share_pct ?? 0) / 100, rate: b.rate ?? 0, note: b.note ?? "",
        ok: b.rate_ok !== false && b.share_pct_ok !== false,
        vessels,
        breakeven,
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
  return { cos, inputs, usdnok: quote("NOK=X")?.price ?? null, proxies: { BWET: compact("BWET"), BDRY: compact("BDRY") } };
}

/** Korte linjer til KI-analytikeren, med standardantakelser (resten til samme rate, 97 % utnyttelse) og dine lagrede tall. */
export async function bookingLines(): Promise<string[]> {
  const { cos, inputs, usdnok } = await loadBookingData();
  const curQ = quarterOf(new Date());
  const out: string[] = [];
  for (const c of cos) {
    if (!c.report || !c.bookPeriod || !c.segs.length) continue;
    const qd = quarterDays(c.bookPeriod);
    let sum = 0, missing = false;
    const parts: string[] = [];
    for (const s of c.segs) {
      const own = inputs.find((x) => x.symbol === c.symbol && x.segment === s.segment);
      const r = estimate({
        segment: s.segment, share: s.share, bookedRate: s.rate, vessels: own?.vessels ?? s.vessels.count,
        days: own?.vessels != null ? null : s.vessels.days, restRate: own?.rest_rate ?? s.rate,
        breakeven: own?.breakeven ?? s.breakeven?.rate ?? null, util: own?.util ?? 0.97,
      }, qd);
      parts.push(`${s.segment} ${Math.round(s.share * 100)} % til ${Math.round(s.rate)} USD/dag${s.ok ? "" : " (?)"}`);
      if (r.surplus === null) missing = true; else sum += r.surplus;
    }
    const ps = !missing && c.shares ? sum / c.shares : null;
    const nok = ps !== null && usdnok ? ps * usdnok : null;
    const when = cmpQuarter(c.bookPeriod, curQ) < 0 ? "utdatert" : cmpQuarter(c.bookPeriod, curQ) === 0 ? "kvartalet nå" : "neste kvartal";
    out.push(`- ${c.name} ${c.bookPeriod} (${when}, fra rapport ${c.report.period}): ${parts.join("; ")}.` +
      (missing ? " Mangler antall skip eller dødpunkt for fullt anslag." :
        ` Anslått overskudd over dødpunkt ${(sum / 1e6).toFixed(1)} MUSD${ps !== null ? `, ${ps.toFixed(2)} USD per aksje` : ""}${nok !== null && c.price ? ` (${((nok / c.price) * 100).toFixed(1)} % av kursen)` : ""}.`) +
      (!missing && c.segs.some((s) => s.breakeven?.segment.includes("bare driftskostnad")) ? " Dødpunktet er bare driftskostnad (renter og avdrag mangler), så overskuddet er for høyt." : "") +
      (c.dividend ? ` Siste utbytte ${c.dividend.perShare} ${c.dividend.unit} per aksje.` : ""));
  }
  return out;
}
