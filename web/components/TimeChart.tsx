"use client";

import { useMemo, useState } from "react";

export type Pt = { t: string; v: number }; // t = ISO-dato eller -tidspunkt
export type Period = "1D" | "1U" | "1M" | "3M" | "6M" | "1Å";

const DAYS: Record<Period, number> = { "1D": 1, "1U": 7, "1M": 31, "3M": 92, "6M": 183, "1Å": 366 };
const LABEL: Record<Period, string> = { "1D": "1 dag", "1U": "1 uke", "1M": "1 mnd", "3M": "3 mnd", "6M": "6 mnd", "1Å": "1 år" };

const fmtTick = (d: Date, p: Period) => {
  const o: Intl.DateTimeFormatOptions =
    p === "1D" ? { hour: "2-digit", minute: "2-digit" } : p === "1U" ? { weekday: "short", day: "2-digit", month: "2-digit" } : p === "1Å" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "2-digit" };
  return new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", ...o }).format(d);
};

export default function TimeChart({
  daily,
  intraday = [],
  periods = ["1D", "1U", "1M", "3M", "6M", "1Å"],
  initial = "6M",
  color = "#FF8A5B",
  height = 220,
  decimals = 1,
}: {
  daily: Pt[];
  intraday?: Pt[];
  periods?: Period[];
  initial?: Period;
  color?: string;
  height?: number;
  decimals?: number;
}) {
  const [p, setP] = useState<Period>(periods.includes(initial) ? initial : periods[periods.length - 1]);

  const pts = useMemo(() => {
    const src = (p === "1D" || p === "1U") && intraday.length > 1 ? intraday : daily;
    if (src.length === 0) return [];
    let end = new Date(src[src.length - 1].t).getTime();
    if (p === "1D") {
      // Siste handelsdag (norsk tid)
      const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date(end));
      return src.filter((x) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date(x.t)) === day);
    }
    const from = end - DAYS[p] * 86400_000;
    return src.filter((x) => new Date(x.t).getTime() >= from);
  }, [p, daily, intraday]);

  const fmt = (v: number) => v.toFixed(decimals).replace(".", ",");

  let body: React.ReactNode;
  if (pts.length < 2) {
    body = <div className="empty" style={{ height }}>For lite data for denne perioden ennå.</div>;
  } else {
    const t0 = new Date(pts[0].t).getTime();
    const t1 = new Date(pts[pts.length - 1].t).getTime();
    const span = t1 - t0 || 1;
    const vals = pts.map((x) => x.v);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
    const min = lo - pad, max = hi + pad;
    // Intradag: plasser etter rekkefølge, så natt og helg ikke blir lange flate streker
    const useIndex = p === "1D" || p === "1U";
    const xOf = (i: number, t: string) => (useIndex ? (i / (pts.length - 1)) * 100 : ((new Date(t).getTime() - t0) / span) * 100);
    const line = pts.map((x, i) => `${(xOf(i, x.t) * 8).toFixed(1)},${(270 - ((x.v - min) / (max - min)) * 260).toFixed(1)}`).join(" ");
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const i = Math.round(f * (pts.length - 1));
      const x = useIndex ? f * 100 : xOf(i, pts[i].t);
      return { x, label: fmtTick(new Date(pts[i].t), p) };
    });
    const first = pts[0].v, last = pts[pts.length - 1].v;
    const chg = (last / first - 1) * 100;
    body = (
      <>
        <div className="m" style={{ fontSize: 12, marginBottom: 6, color: chg >= 0 ? "#3DD68C" : "#FF6B6B" }}>
          {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(2).replace(".", ",")} % i perioden
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="m" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, color: "#8A919C", height, textAlign: "right", minWidth: 38 }}>
            <span>{fmt(max)}</span>
            <span>{fmt((max + min) / 2)}</span>
            <span>{fmt(min)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <svg viewBox="0 0 800 280" preserveAspectRatio="none" style={{ width: "100%", height, display: "block", background: "#0F1114", borderRadius: 6 }} role="img" aria-label={`Graf, ${LABEL[p]}`}>
              <line x1="0" y1="140" x2="800" y2="140" stroke="#1F2228" vectorEffect="non-scaling-stroke" />
              {ticks.map((tk, i) => (
                <line key={i} x1={tk.x * 8} y1="0" x2={tk.x * 8} y2="280" stroke="#22262D" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              ))}
              <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="m" style={{ position: "relative", height: 18, marginTop: 6, fontSize: 11, color: "#8A919C" }}>
              {ticks.map((tk, i) => (
                <span key={i} style={{ position: "absolute", left: `${tk.x}%`, transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)", whiteSpace: "nowrap" }}>
                  {tk.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <div role="group" aria-label="Velg periode" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {periods.map((x) => (
          <button key={x} type="button" className="btn" aria-pressed={x === p} onClick={() => setP(x)} style={{ background: x === p ? "#2A2E36" : undefined, borderColor: x === p ? "#4A505A" : undefined }}>
            {LABEL[x]}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
