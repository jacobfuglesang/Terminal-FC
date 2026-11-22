"use client";

import { useMemo, useState } from "react";
import TimeChart from "@/components/TimeChart";

export type ChokeSeries = { id: string; name: string; pts: { day: string; total: number; tanker: number; container: number; bulk: number }[] };
type Metric = "total" | "tanker" | "container" | "bulk";
const METRIC: Record<Metric, string> = { total: "Alle skip", tanker: "Tankskip", container: "Containerskip", bulk: "Bulkskip" };

export default function ChokeExplorer({ series, initial = "chokepoint6" }: { series: ChokeSeries[]; initial?: string }) {
  const [id, setId] = useState(series.find((s) => s.id === initial) ? initial : series[0]?.id);
  const [m, setM] = useState<Metric>("total");
  const s = series.find((x) => x.id === id);

  // 7-dagers glidende snitt; enkeltdager hopper mye
  const pts = useMemo(() => {
    if (!s) return [];
    const out: { t: string; v: number }[] = [];
    for (let i = 6; i < s.pts.length; i++) {
      const win = s.pts.slice(i - 6, i + 1);
      out.push({ t: `${s.pts[i].day}T12:00:00Z`, v: win.reduce((a, x) => a + x[m], 0) / 7 });
    }
    return out;
  }, [s, m]);

  if (!s) return <div className="empty">PortWatch-dataene hentes ved neste daglige kjøring.</div>;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {series.map((x) => (
          <button key={x.id} type="button" className="btn" aria-pressed={x.id === id} onClick={() => setId(x.id)}
            style={{ background: x.id === id ? "#2A2E36" : undefined, borderColor: x.id === id ? "#4A505A" : undefined }}>{x.name}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {(Object.keys(METRIC) as Metric[]).map((k) => (
          <button key={k} type="button" className="btn" aria-pressed={k === m} onClick={() => setM(k)}
            style={{ background: k === m ? "#2A2E36" : undefined, borderColor: k === m ? "#4A505A" : undefined, fontSize: 12 }}>{METRIC[k]}</button>
        ))}
      </div>
      <TimeChart daily={pts} periods={["1M", "3M", "6M", "1Å"]} initial="1Å" color="#4FD1C5" decimals={0} height={240} />
      <p className="note">{s.name}: {METRIC[m].toLowerCase()} per dag, 7-dagers snitt. Kilde: IMF PortWatch (AIS), publisert med noen dagers forsinkelse.</p>
    </div>
  );
}
