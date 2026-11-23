import type { Indicator } from "@/lib/society";

const pc = (v: number | null) => (v === null ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`);
const col = (v: number | null) => (v === null ? undefined : v > 0 ? "#3DDC97" : v < 0 ? "#FF6B6B" : undefined);

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v), w = 90, h = 22;
  const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * w).toFixed(1)},${(h - ((x - min) / (max - min || 1)) * h).toFixed(1)}`).join("");
  return <svg width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke={v[v.length - 1] >= v[0] ? "#3DDC97" : "#FF6B6B"} strokeWidth="1.4" /></svg>;
}

export default function IndicatorTable({ rows }: { rows: Indicator[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tbl">
        <thead><tr><th>Indikator</th><th>Siste</th><th>1 uke</th><th>1 mnd</th><th>3 mnd</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sym}>
              <td>{r.label}</td>
              <td className="m">{r.last === null ? "–" : `${r.last.toLocaleString("nb-NO", { maximumFractionDigits: r.last < 10 ? 3 : 2 })} ${r.unit}`}</td>
              <td className="m" style={{ color: col(r.d7) }}>{pc(r.d7)}</td>
              <td className="m" style={{ color: col(r.d30) }}>{pc(r.d30)}</td>
              <td><Spark v={r.series} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
