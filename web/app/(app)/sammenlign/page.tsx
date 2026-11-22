import CompareChart, { type Series } from "@/components/CompareChart";
import { getAllDaily, getFreight } from "@/lib/db";
import { COMPANIES, MARKET_NAME } from "@/lib/universe";

export const dynamic = "force-dynamic";

const PALETTE = ["#FF8A5B", "#5BA8FF", "#B98CFF", "#4FD1C5", "#F2C94C", "#7BE3A6", "#FF6B9A", "#9CC8FF", "#FFB08F", "#C3E88D", "#89DDFF", "#F78C6C", "#D4BFFF", "#FFCB6B", "#82AAFF"];

export default async function Sammenlign() {
  const syms = [...COMPANIES.map((c) => c.symbol), "BWET", "BDRY", "BZ=F", "TIO=F", "OSEBX.OL"];
  const [daily, fr] = await Promise.all([getAllDaily(syms), getFreight(["BDI", "SCFI"])]);
  const series: Series[] = [
    ...COMPANIES.map((c, i) => ({ id: c.symbol, name: c.name, color: PALETTE[i % PALETTE.length], pts: daily[c.symbol] ?? [] })),
    { id: "BWET", name: MARKET_NAME.BWET, color: "#F4F5F7", dash: "6 4", pts: daily.BWET ?? [] },
    { id: "BDRY", name: MARKET_NAME.BDRY, color: "#A0A7B2", dash: "6 4", pts: daily.BDRY ?? [] },
    { id: "BDI", name: "Baltic Dry Index", color: "#7FB8FF", dash: "2 3", pts: (fr.BDI ?? []).map((x) => ({ t: `${x.day}T12:00:00Z`, v: x.value })) },
    { id: "SCFI", name: "SCFI", color: "#FFD27F", dash: "2 3", pts: (fr.SCFI ?? []).map((x) => ({ t: `${x.day}T12:00:00Z`, v: x.value })) },
    { id: "BZ=F", name: "Brent", color: "#FF9E7A", dash: "1 3", pts: daily["BZ=F"] ?? [] },
    { id: "TIO=F", name: "Jernmalm", color: "#8FC1FF", dash: "1 3", pts: daily["TIO=F"] ?? [] },
    { id: "OSEBX.OL", name: "Oslo Børs", color: "#6E7581", dash: "1 3", pts: daily["OSEBX.OL"] ?? [] },
  ];
  return (
    <section className="panel" aria-labelledby="h-sml">
      <div className="ph">
        <h2 id="h-sml">Rederiene mot fraktrater og råvarer</h2>
        <span className="src">Yahoo Finance · Baltic Exchange · Shanghai Shipping Exchange</span>
      </div>
      <CompareChart
        series={series}
        initialOn={["FRO.OL", "OET.OL", "BWET"]}
        refs={[{ id: "BWET", label: "tankfrakt" }, { id: "BDRY", label: "tørrbulkfrakt" }, { id: "OSEBX.OL", label: "Oslo Børs" }]}
        note="Ukentlige serier (SCFI) går i trapper."
      />
    </section>
  );
}
