// Små regnefunksjoner som brukes på flere sider.

export type P = { t: string; v: number };

// Endring i prosent over et antall kalenderdager (fra siste kjente verdi før startdatoen)
export function change(pts: P[], days: number): number | null {
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const target = new Date(last.t).getTime() - days * 86400000;
  let ref: P | null = null;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (new Date(pts[i].t).getTime() <= target) { ref = pts[i]; break; }
  }
  if (!ref || !ref.v) return null;
  return (last.v / ref.v - 1) * 100;
}

// Utbytte siste 12 måneder delt på kurs (Yahoo oppgir utbytte i samme valuta som kursen på Oslo Børs)
export function ttmYield(divs: { date: string; value: number | null }[] | undefined, price: number | null | undefined): number | null {
  if (!divs?.length || !price) return null;
  const since = Date.now() - 365 * 86400000;
  const sum = divs.filter((d) => new Date(d.date).getTime() >= since).reduce((s, d) => s + (d.value ?? 0), 0);
  return sum > 0 ? (sum / price) * 100 : null;
}

// Siste utbytte omregnet til et årstall: månedlig ×12, ellers ×4
export function runRateYield(divs: { date: string; value: number | null }[] | undefined, price: number | null | undefined): number | null {
  if (!divs?.length || !price) return null;
  const last = divs[divs.length - 1];
  if (!last.value) return null;
  const prev = divs[divs.length - 2];
  const gap = prev ? (new Date(last.date).getTime() - new Date(prev.date).getTime()) / 86400000 : 90;
  const perYear = gap < 45 ? 12 : gap < 120 ? 4 : gap < 240 ? 2 : 1;
  return ((last.value * perYear) / price) * 100;
}

export function corr(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 8) return null;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n, mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : null;
}

// Korrelasjon mellom ukentlige endringer (mindre støy enn daglige, og tåler ulike handelsdager)
export function weeklyCorr(a: P[], b: P[], days = 183): number | null {
  const end = Math.min(new Date(a[a.length - 1]?.t ?? 0).getTime(), new Date(b[b.length - 1]?.t ?? 0).getTime());
  if (!end) return null;
  const at = (pts: P[], ms: number) => { let v: number | null = null; for (const p of pts) { if (new Date(p.t).getTime() <= ms) v = p.v; else break; } return v; };
  const ra: number[] = [], rb: number[] = [];
  for (let ms = end - days * 86400000; ms + 7 * 86400000 <= end; ms += 7 * 86400000) {
    const a0 = at(a, ms), a1 = at(a, ms + 7 * 86400000), b0 = at(b, ms), b1 = at(b, ms + 7 * 86400000);
    if (a0 && a1 && b0 && b1) { ra.push(a1 / a0 - 1); rb.push(b1 / b0 - 1); }
  }
  return corr(ra, rb);
}
