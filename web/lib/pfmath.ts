// Regnestykkene for porteføljen: posisjoner (snittkost), gevinst/tap, faktorbetaer og stresstest.
// Ren matematikk uten nettverk, så den kan brukes både på server og i nettleseren.

export type TradeIn = { id: number; day: string; symbol: string; side: "kjøp" | "salg"; qty: number; price: number; fee: number };
export type Position = {
  symbol: string; qty: number; avg: number; cost: number; since: string | null;
  realized: number; realizedYear: number; fees: number; trades: number;
};

/** Snittkostmetoden: kurtasje på kjøp legges i kostprisen, kurtasje på salg trekkes fra gevinsten. */
export function positions(trades: TradeIn[], year = new Date().getFullYear()): Record<string, Position> {
  const out: Record<string, Position> = {};
  const sorted = [...trades].sort((a, b) => (a.day === b.day ? a.id - b.id : a.day < b.day ? -1 : 1));
  for (const t of sorted) {
    const p = (out[t.symbol] ||= { symbol: t.symbol, qty: 0, avg: 0, cost: 0, since: null, realized: 0, realizedYear: 0, fees: 0, trades: 0 });
    p.trades += 1;
    p.fees += t.fee;
    if (t.side === "kjøp") {
      if (p.qty <= 1e-9) p.since = t.day;
      const cost = p.avg * p.qty + t.price * t.qty + t.fee;
      p.qty += t.qty;
      p.avg = cost / p.qty;
    } else {
      const q = Math.min(t.qty, p.qty);
      const gain = (t.price - p.avg) * q - t.fee;
      p.realized += gain;
      if (Number(t.day.slice(0, 4)) === year) p.realizedYear += gain;
      p.qty -= q;
      if (p.qty <= 1e-9) {
        p.qty = 0;
        p.avg = 0;
        p.since = null;
      }
    }
    p.cost = p.avg * p.qty;
  }
  return out;
}

export type Series = { d: string[]; v: number[] };

function weekKey(day: string): string {
  // ISO-uke: torsdag i samme uke bestemmer året
  const dt = new Date(`${day}T12:00:00Z`);
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd + 3);
  const y = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((dt.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-${String(w).padStart(2, "0")}`;
}

/** Sluttkurs per periode (dag eller uke), fra en gitt startdato. */
export function closes(s: Series, freq: "dag" | "uke", from: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.d.length; i++) {
    if (s.d[i] < from || !(s.v[i] > 0)) continue;
    m.set(freq === "uke" ? weekKey(s.d[i]) : s.d[i], s.v[i]); // siste verdi i perioden vinner
  }
  return m;
}

/** Avkastning (enkel) for perioder der alle seriene har verdi både denne og forrige periode. */
export function alignedReturns(series: Map<string, number>[]): number[][] {
  const keys = [...series[0].keys()].filter((k) => series.every((s) => s.has(k))).sort();
  const rows: number[][] = [];
  for (let i = 1; i < keys.length; i++) {
    rows.push(series.map((s) => s.get(keys[i])! / s.get(keys[i - 1])! - 1));
  }
  return rows;
}

/** Minste kvadraters metode med konstantledd: y = a + Σ b_i x_i. Returnerer betaer, R² og antall observasjoner. */
export function ols(rows: number[][]): { beta: number[]; r2: number; n: number } | null {
  // rows: [y, x1, x2, ...]
  const n = rows.length;
  const k = rows[0]?.length ? rows[0].length - 1 : 0;
  if (n < k + 8) return null;
  const p = k + 1;
  const A = Array.from({ length: p }, () => new Array(p + 1).fill(0));
  for (const r of rows) {
    const x = [1, ...r.slice(1)];
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) A[i][j] += x[i] * x[j];
      A[i][p] += x[i] * r[0];
    }
  }
  // Gauss-eliminasjon med delvis pivotering
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= p; j++) A[r][j] -= f * A[c][j];
    }
  }
  const coef = A.map((row, i) => row[p] / row[i]);
  const ys = rows.map((r) => r[0]);
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  let ssr = 0, sst = 0;
  for (const r of rows) {
    const fit = coef[0] + r.slice(1).reduce((s, x, i) => s + x * coef[i + 1], 0);
    ssr += (r[0] - fit) ** 2;
    sst += (r[0] - mean) ** 2;
  }
  return { beta: coef.slice(1), r2: sst > 0 ? 1 - ssr / sst : 0, n };
}

export type FactorFit = { beta: number[]; r2: number; n: number } | null;

/** Betaer for én aksje mot valgte faktorer. */
export function fitStock(stock: Series, factors: Series[], freq: "dag" | "uke", from: string): FactorFit {
  if (!factors.length) return null;
  const rows = alignedReturns([closes(stock, freq, from), ...factors.map((f) => closes(f, freq, from))]);
  // Fjern ekstreme utliggere (f.eks. utbytte-dager uten justering) som ellers kan styre betaene
  const clean = rows.filter((r) => Math.abs(r[0]) < 0.6 && r.slice(1).every((x) => Math.abs(x) < 0.6));
  return ols(clean);
}

/** Anslått avkastning gitt sjokk i faktorene (lineært anslag). */
export function stressed(fit: FactorFit, shocks: number[]): number | null {
  if (!fit) return null;
  return fit.beta.reduce((s, b, i) => s + b * (shocks[i] ?? 0), 0);
}
