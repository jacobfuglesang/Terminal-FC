// Inntjeningsmotor: anslår kvartalets inntjening fra bookingtall i kvartalsrapportene.
// Ren regning uten database, så den kan testes og brukes både på server og i nettleseren.

export type RateRow = { segment?: string; rate?: number | null; share_pct?: number | null; period?: string; note?: string; rate_ok?: boolean; share_pct_ok?: boolean };
export type VesselRow = { segment?: string; count?: number | null; days?: number | null; note?: string; count_ok?: boolean };

export type SegInput = {
  segment: string;
  share: number; // booket andel 0–1
  bookedRate: number; // USD/dag for de bookede dagene
  vessels: number | null; // antall skip
  days: number | null; // tilgjengelige dager oppgitt i rapporten (overstyrer skip × dager × utnyttelse)
  restRate: number; // USD/dag for dagene som ikke er booket ennå
  breakeven: number | null; // USD/dag (cash breakeven)
  util: number; // andel av kalenderdagene skipene tjener penger (verkstedopphold, posisjonering)
};

export type SegResult = SegInput & {
  totalDays: number | null; bookedDays: number | null; openDays: number | null;
  revenue: number | null; cost: number | null; surplus: number | null; blended: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
const FLEET = new Set(["flåtesnitt", "flåte", "fleet", "total", "alle", "samlet", ""]);
export const isFleet = (seg?: string) => FLEET.has(norm(seg ?? ""));

// Samme skipstype selv om rapporten skriver litt ulikt (LR2/Aframax, MR/MR2, Capesize/Newcastlemax regnes ikke som like)
const ALIAS: Record<string, string> = { aframaxlr2: "lr2", lr2aframax: "lr2", aframax: "lr2", mr2: "mr", mr1: "mr", handysize: "handy", vlgcs: "vlgc", vlccs: "vlcc", suezmaxes: "suezmax" };
export function segKey(seg?: string): string {
  const n = norm(seg ?? "");
  if (isFleet(seg)) return "flåtesnitt";
  return ALIAS[n] ?? n;
}

export function quarterOf(d: Date): string {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

export function parseQuarter(p?: string | null): { q: number; y: number } | null {
  const m = /Q([1-4])\s*(\d{4})/i.exec(p ?? "");
  return m ? { q: Number(m[1]), y: Number(m[2]) } : null;
}

export function nextQuarter(p: string): string {
  const x = parseQuarter(p);
  if (!x) return p;
  return x.q === 4 ? `Q1 ${x.y + 1}` : `Q${x.q + 1} ${x.y}`;
}

/** Sammenligner kvartaler: negativ hvis a er før b. */
export function cmpQuarter(a: string, b: string): number {
  const x = parseQuarter(a), y = parseQuarter(b);
  if (!x || !y) return 0;
  return (x.y - y.y) * 4 + (x.q - y.q);
}

export function quarterDays(p: string): number {
  const x = parseQuarter(p);
  if (!x) return 91;
  const start = Date.UTC(x.y, (x.q - 1) * 3, 1);
  const end = Date.UTC(x.q === 4 ? x.y + 1 : x.y, x.q === 4 ? 0 : x.q * 3, 1);
  return Math.round((end - start) / 864e5);
}

/** Hvor mye av kvartalet som har gått (0–1). */
export function quarterElapsed(p: string, now = new Date()): number {
  const x = parseQuarter(p);
  if (!x) return 0;
  const start = Date.UTC(x.y, (x.q - 1) * 3, 1);
  const len = quarterDays(p) * 864e5;
  return Math.min(1, Math.max(0, (now.getTime() - start) / len));
}

export function estimate(inp: SegInput, qdays: number): SegResult {
  const totalDays = inp.days != null && inp.days > 0 ? inp.days : inp.vessels != null && inp.vessels > 0 ? inp.vessels * qdays * inp.util : null;
  const share = Math.min(1, Math.max(0, inp.share));
  const blended = share * inp.bookedRate + (1 - share) * inp.restRate;
  if (totalDays === null) {
    return { ...inp, totalDays: null, bookedDays: null, openDays: null, revenue: null, cost: null, surplus: null, blended };
  }
  const bookedDays = totalDays * share;
  const openDays = totalDays - bookedDays;
  const revenue = bookedDays * inp.bookedRate + openDays * inp.restRate;
  const cost = inp.breakeven != null ? totalDays * inp.breakeven : null;
  return { ...inp, totalDays, bookedDays, openDays, revenue, cost, surplus: cost !== null ? revenue - cost : null, blended };
}

/**
 * Velger én bookingrad per skipstype for perioden.
 * Foretrekker bekreftede tall, deretter alle dager framfor bare spotdager.
 * Har selskapet tall per skipstype, droppes flåtesnittet (ellers telles dagene to ganger).
 */
export function pickBookings(rows: RateRow[], period: string): RateRow[] {
  const ok = rows.filter((r) => r.rate != null && r.rate > 0 && r.share_pct != null && r.share_pct > 0 && r.share_pct <= 100);
  const inPeriod = ok.filter((r) => !r.period || cmpQuarter(r.period, period) === 0 || !parseQuarter(r.period));
  const score = (r: RateRow) => (r.rate_ok === false ? 0 : 4) + (r.share_pct_ok === false ? 0 : 2) + (/spot/i.test(r.note ?? "") ? 0 : 1);
  const best = new Map<string, RateRow>();
  for (const r of inPeriod) {
    const k = segKey(r.segment);
    const cur = best.get(k);
    if (!cur || score(r) > score(cur)) best.set(k, r);
  }
  if (best.size > 1) best.delete("flåtesnitt");
  return [...best.values()];
}

/** Finner raten for skipstypen i en liste (dødpunkt, oppnådd TCE), ellers flåtesnittet. */
export function matchRate(rows: RateRow[] | undefined, segment: string): RateRow | null {
  const list = (rows ?? []).filter((r) => r.rate != null && r.rate > 0);
  const k = segKey(segment);
  return list.find((r) => segKey(r.segment) === k) ?? list.find((r) => isFleet(r.segment)) ?? (list.length === 1 ? list[0] : null);
}

/** Antall skip og eventuelle dager for skipstypen. Flåtesnitt = summen av alle skipstyper. */
export function matchVessels(rows: VesselRow[] | undefined, segment: string): { count: number | null; days: number | null; ok: boolean } {
  const list = (rows ?? []).filter((r) => (r.count ?? 0) > 0 || (r.days ?? 0) > 0);
  const k = segKey(segment);
  const hit = list.find((r) => segKey(r.segment) === k);
  if (hit) return { count: hit.count ?? null, days: hit.days ?? null, ok: hit.count_ok !== false };
  if (k === "flåtesnitt" && list.length) {
    const fleet = list.find((r) => isFleet(r.segment));
    if (fleet) return { count: fleet.count ?? null, days: fleet.days ?? null, ok: fleet.count_ok !== false };
    return { count: list.reduce((s, r) => s + (r.count ?? 0), 0) || null, days: null, ok: list.every((r) => r.count_ok !== false) };
  }
  return { count: null, days: null, ok: false };
}

// Hvilken markedsserie som best følger spotraten for skipstypen (grovt). null = ingen gratis serie.
const TANK = /vlcc|suezmax|aframax|lr2|lr1|crude|råolje/i;
const DRY = /cape|newcastle|panamax|kamsarmax|ultramax|supramax|handy|bulk|dry|tørr/i;
export function proxyFor(segment: string, companySegment: string): "BWET" | "BDRY" | null {
  if (TANK.test(segment)) return "BWET";
  if (DRY.test(segment)) return "BDRY";
  if (isFleet(segment)) {
    if (companySegment === "Råoljetank") return "BWET";
    if (companySegment === "Tørrbulk") return "BDRY";
  }
  return null;
}
