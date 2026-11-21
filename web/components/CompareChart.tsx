"use client";

import { useMemo, useState } from "react";

export type Series = { id: string; name: string; color: string; dash?: string; pts: { t: string; v: number }[] };
type Period = "1M" | "3M" | "6M" | "1Å";
const DAYS: Record<Period, number> = { "1M": 31, "3M": 92, "6M": 183, "1Å": 366 };
const LABEL: Record<Period, string> = { "1M": "1 mnd", "3M": "3 mnd", "6M": "6 mnd", "1Å": "1 år" };

// Verdien som gjaldt på et tidspunkt (siste kjente før eller lik t). Gir trapper for uke- og månedstall.
function valueAt(pts: { ms: number; v: number }[], ms: number): number | null {
  let lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].ms <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? pts[ans].v : null;
}

function corr(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : null;
}

const f1 = (v: number) => v.toFixed(1).replace(".", ",");
const f2 = (v: number) => v.toFixed(2).replace(".", ",");

export default function CompareChart({ series, initialOn }: { series: Series[]; initialOn: string[] }) {
  const [period, setPeriod] = useState<Period>("6M");
  const [on, setOn] = useState<Set<string>>(new Set(initialOn));

  const calc = useMemo(() => {
    const all = series.map((s) => ({ ...s, ms: s.pts.map((p) => ({ ms: new Date(p.t).getTime(), v: p.v })) }));
    const end = Math.max(...all.flatMap((s) => (s.ms.length ? [s.ms[s.ms.length - 1].ms] : [0])));
    const start = end - DAYS[period] * 86400_000;
    // Felles tidsakse: hver handelsdag fra aksjene (fallback: ukentlig)
    const grid = Array.from(new Set(all.filter((s) => !s.dash).flatMap((s) => s.ms.map((p) => p.ms)).filter((t) => t >= start && t <= end))).sort((a, b) => a - b);
    const lines = all.map((s) => {
      const vals = grid.map((t) => valueAt(s.ms, t));
      const base = vals.find((v) => v !== null) ?? null;
      const idx = vals.map((v) => (v !== null && base ? (v / base) * 100 : null));
      return { ...s, idx };
    });
    return { grid, lines, start, end };
  }, [series, period]);

  const visible = calc.lines.filter((l) => on.has(l.id));
  const vals = visible.flatMap((l) => l.idx.filter((v): v is number => v !== null));
  let min = Math.min(100, ...vals), max = Math.max(100, ...vals);
  const pad = (max - min) * 0.08 || 1;
  min -= pad; max += pad;
  const n = calc.grid.length;
  const y = (v: number) => (270 - ((v - min) / (max - min)) * 260).toFixed(1);
  const x = (i: number) => ((i / Math.max(1, n - 1)) * 800).toFixed(1);
  const ticks = n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))) : [];
  const tickLabel = (i: number) =>
    new Intl.DateTimeFormat("nb-NO", period === "1Å" ? { month: "short", year: "2-digit", timeZone: "Europe/Oslo" } : { day: "2-digit", month: "2-digit", timeZone: "Europe/Oslo" }).format(new Date(calc.grid[i]));
  const laks = calc.lines.find((l) => l.id === "laks");
  const fôr = calc.lines.find((l) => l.id === "for");
  const clean = (a: (number | null)[], b: (number | null)[]) => {
    const A: number[] = [], B: number[] = [];
    a.forEach((v, i) => { if (v !== null && b[i] !== null) { A.push(v); B.push(b[i] as number); } });
    return [A, B] as const;
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div role="group" aria-label="Serier" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {calc.lines.map((l) => {
            const last = [...l.idx].reverse().find((v) => v !== null);
            const ch = last !== undefined && last !== null ? last - 100 : null;
            return (
              <button key={l.id} type="button" className="btn" aria-pressed={on.has(l.id)} onClick={() => setOn((s) => { const t = new Set(s); if (t.has(l.id)) t.delete(l.id); else t.add(l.id); return t; })} style={{ display: "flex", alignItems: "center", gap: 8, opacity: on.has(l.id) ? 1 : 0.45 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: l.color }} />
                {l.name}
                <span className={`m ${ch !== null && ch >= 0 ? "upc" : "downc"}`}>{ch === null ? "–" : `${ch >= 0 ? "+" : "−"}${f1(Math.abs(ch))} %`}</span>
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Periode" style={{ display: "flex", gap: 4 }}>
          {(Object.keys(DAYS) as Period[]).map((p) => (
            <button key={p} type="button" className="btn" aria-pressed={p === period} onClick={() => setPeriod(p)} style={{ background: p === period ? "#2A2E36" : undefined, borderColor: p === period ? "#4A505A" : undefined }}>
              {LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      {n < 2 ? (
        <div className="empty">For lite data for denne perioden ennå.</div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <div className="m" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, color: "#8A919C", height: 420, textAlign: "right", minWidth: 38 }}>
            <span>{f1(max)}</span>
            <span>{f1((max + min) / 2)}</span>
            <span>{f1(min)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox="0 0 800 280" preserveAspectRatio="none" style={{ width: "100%", height: 420, display: "block", background: "#0F1114", borderRadius: 6 }} role="img" aria-label="Indeksert sammenligning, start = 100">
              {ticks.map((i) => <line key={i} x1={x(i)} y1="0" x2={x(i)} y2="280" stroke="#22262D" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
              <line x1="0" y1={y(100)} x2="800" y2={y(100)} stroke="#4A505A" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              {visible.map((l) => {
                const pts = l.idx.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(" ");
                return <polyline key={l.id} points={pts} fill="none" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            <div className="m" style={{ position: "relative", height: 18, marginTop: 6, fontSize: 11, color: "#8A919C" }}>
              {ticks.map((i, k) => (
                <span key={i} style={{ position: "absolute", left: `${(i / Math.max(1, n - 1)) * 100}%`, transform: k === 0 ? "none" : k === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)", whiteSpace: "nowrap" }}>{tickLabel(i)}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table className="tbl" style={{ minWidth: 520 }}>
          <thead>
            <tr><th>Serie</th><th>Endring i perioden</th><th>Korrelasjon med laksepris</th><th>Korrelasjon med fôr</th></tr>
          </thead>
          <tbody>
            {calc.lines.map((l) => {
              const last = [...l.idx].reverse().find((v) => v !== null);
              const ch = last !== undefined && last !== null ? last - 100 : null;
              const cl = laks && l.id !== "laks" ? corr(...clean(l.idx, laks.idx)) : null;
              const cf = fôr && l.id !== "for" ? corr(...clean(l.idx, fôr.idx)) : null;
              return (
                <tr key={l.id}>
                  <td><span style={{ display: "inline-block", width: 14, height: 3, borderRadius: 2, background: l.color, marginRight: 8, verticalAlign: "middle" }} />{l.name}</td>
                  <td className={`m ${ch !== null && ch >= 0 ? "upc" : "downc"}`}>{ch === null ? "–" : `${ch >= 0 ? "+" : "−"}${f1(Math.abs(ch))} %`}</td>
                  <td className="m">{cl === null ? "–" : f2(cl)}</td>
                  <td className="m">{cf === null ? "–" : f2(cf)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">Alle linjer = 100 ved periodens start. Laksepris (ukentlig) og fôrindeks (månedlig) går i trapper. Korrelasjon fra −1 til 1: nær 1 betyr at linjene beveger seg likt. Sammenheng er ikke det samme som årsak.</p>
    </div>
  );
}
