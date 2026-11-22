"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ScreenRow = {
  id: string; name: string; ticker: string; segment: string;
  price: number | null; d1: number | null; w1: number | null; m1: number | null; m3: number | null; y1: number | null;
  ttm: number | null; run: number | null; short: number | null; fwdPE: number | null; epsRev: number | null; next: string | null;
};

type Key = keyof ScreenRow;
const COLS: { key: Key; label: string; title?: string }[] = [
  { key: "name", label: "Rederi" },
  { key: "segment", label: "Segment" },
  { key: "price", label: "Kurs" },
  { key: "d1", label: "1 d" },
  { key: "w1", label: "1 u" },
  { key: "m1", label: "1 m" },
  { key: "m3", label: "3 m" },
  { key: "y1", label: "1 år" },
  { key: "ttm", label: "Utbytte 12 m", title: "Utbetalt utbytte siste 12 måneder delt på kursen" },
  { key: "run", label: "Siste ×", title: "Siste utbytte omregnet til et helt år (månedlig ×12, kvartalsvis ×4)" },
  { key: "fwdPE", label: "P/E neste år", title: "Kurs delt på forventet resultat per aksje (Yahoo)" },
  { key: "epsRev", label: "Estimat 30 d", title: "Endring i analytikernes resultatestimat for i år siste 30 dager" },
  { key: "short", label: "Short", title: "Offentlig shortandel, Finanstilsynet" },
  { key: "next", label: "Neste rapport" },
];

const n = (v: number | null, d = 1, suffix = "") => (v === null || Number.isNaN(v) ? "–" : `${v.toFixed(d).replace(".", ",")}${suffix}`);
const sgn = (v: number | null) => (v === null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")} %`);

export default function ScreenerTable({ rows, compact = false }: { rows: ScreenRow[]; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: compact ? "d1" : "m1", dir: -1 });
  const [seg, setSeg] = useState("Alle");
  const segments = ["Alle", ...Array.from(new Set(rows.map((r) => r.segment)))];

  const shown = useMemo(() => {
    const list = rows.filter((r) => seg === "Alle" || r.segment === seg);
    return [...list].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y), "nb") : (x as number) - (y as number)) * sort.dir;
    });
  }, [rows, seg, sort]);

  const cols = compact ? COLS.filter((c) => ["name", "segment", "price", "d1", "w1", "m1", "ttm"].includes(c.key)) : COLS;

  return (
    <>
      {!compact && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {segments.map((s) => (
            <button key={s} type="button" className="btn" aria-pressed={s === seg} onClick={() => setSeg(s)}
              style={{ background: s === seg ? "#2A2E36" : undefined, borderColor: s === seg ? "#4A505A" : undefined }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: compact ? 560 : 1100 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} title={c.title} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "name" || c.key === "segment" || c.key === "next" ? 1 : -1 }))}
                    style={{ background: "none", border: 0, padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => {
                  const v = r[c.key];
                  if (c.key === "name") return <td key={c.key}><Link href={`/selskap/${r.id}`}>{r.name}</Link> <span className="src">{r.ticker}</span></td>;
                  if (c.key === "segment") return <td key={c.key} style={{ color: "#A0A7B2" }}>{r.segment}</td>;
                  if (c.key === "next") return <td key={c.key} className="m" style={{ color: "#A0A7B2" }}>{r.next ? new Date(`${r.next}T12:00:00Z`).toLocaleDateString("nb-NO", { day: "numeric", month: "short" }) : "–"}</td>;
                  if (c.key === "price") return <td key={c.key} className="m">{n(r.price, 2)}</td>;
                  if (["d1", "w1", "m1", "m3", "y1", "epsRev"].includes(c.key)) {
                    const x = v as number | null;
                    return <td key={c.key} className={`m ${x === null ? "" : x >= 0 ? "upc" : "downc"}`}>{sgn(x)}</td>;
                  }
                  if (c.key === "fwdPE") return <td key={c.key} className="m">{n(v as number | null, 1)}</td>;
                  return <td key={c.key} className="m">{n(v as number | null, 1, " %")}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
