import Link from "next/link";
import { getBrokerReports } from "@/lib/db";
import { osloTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const GROUPS: Record<string, RegExp> = {
  Tank: /vlcc|suezmax|aframax|lr1|lr2|mr\b|tank|crude|product|clean|dirty|handy.*tank/i,
  Tørrbulk: /cape|panamax|kamsarmax|supramax|ultramax|handysize|bulk|dry/i,
  Container: /container|teu|feeder/i,
  Gass: /lpg|lng|vlgc|gas/i,
};
const DIR: Record<string, [string, string]> = { opp: ["▲", "#3DDC97"], ned: ["▼", "#FF6B6B"], flat: ["▬", "#A0A7B2"], blandet: ["◆", "#F5C451"] };
const SENT: Record<string, string> = { positiv: "#3DDC97", negativ: "#FF6B6B", "nøytral": "#A0A7B2", blandet: "#F5C451" };

export default async function Meglerrapporter({ searchParams }: { searchParams: Promise<{ seg?: string }> }) {
  const { seg } = await searchParams;
  const all = await getBrokerReports(120);
  const rx = seg ? GROUPS[seg] : null;
  const list = rx ? all.filter((r) => (r.data.segments ?? []).some((s) => rx.test(s.segment ?? ""))) : all;

  // Retning per segmentgruppe siste 7 dager, som en enkel «stemning»
  const week = all.filter((r) => Date.now() - new Date(r.published).getTime() < 7 * 864e5);
  const mood = Object.entries(GROUPS).map(([g, re]) => {
    let upN = 0, down = 0, n = 0;
    for (const r of week) for (const s of r.data.segments ?? []) if (re.test(s.segment ?? "")) {
      n++;
      if (s.direction === "opp") upN++;
      if (s.direction === "ned") down++;
    }
    return { g, upN, down, n };
  });

  return (
    <>
      <section className="panel" aria-labelledby="h-mr">
        <div className="ph"><h2 id="h-mr">Meglerrapporter lest av KI</h2><span className="src">Ukentlige markedsrapporter fra meglerhus, via Hellenic Shipping News</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {mood.map((m) => (
            <div key={m.g} className="kpi" style={{ minWidth: 160 }}>
              <div className="l">{m.g} siste 7 dager</div>
              <div className="v m" style={{ fontSize: 15 }}>
                <span style={{ color: "#3DDC97" }}>▲ {m.upN}</span> <span style={{ color: "#FF6B6B", marginLeft: 8 }}>▼ {m.down}</span>
                <span className="src" style={{ marginLeft: 8 }}>av {m.n}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <Link href="/meglerrapporter" className="chip" style={!seg ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>Alle</Link>
          {Object.keys(GROUPS).map((g) => (
            <Link key={g} href={`/meglerrapporter?seg=${encodeURIComponent(g)}`} className="chip" style={seg === g ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>{g}</Link>
          ))}
        </div>
        <p className="note" style={{ marginTop: 0 }}>▲/▼ teller hvor mange segmentvurderinger i ukens rapporter som sier at ratene gikk opp eller ned. KI kan ta feil; les kilden før du bruker et tall.</p>
        {list.length === 0 ? <div className="empty">Ingen rapporter lest ennå. Nye rapporter leses ved hver kjøring.</div> : list.map((r) => {
          const d = r.data;
          return (
            <article key={r.url} style={{ borderTop: "1px solid var(--line2)", padding: "14px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ color: "#FF8A5B" }}>{d.broker || r.broker}</b>
                {d.week && <span>{d.week}</span>}
                <span className="src">{osloTime(r.published)}</span>
                {d.sentiment && <span className="tag" style={{ color: SENT[d.sentiment] ?? "#A0A7B2", borderColor: SENT[d.sentiment] ?? "#A0A7B2" }}>{d.sentiment}</span>}
              </div>
              {d.headline && <p style={{ margin: "6px 0", fontSize: 15 }}>{d.headline}</p>}
              {d.summary && d.summary.length > 0 && <ul style={{ margin: "0 0 8px", paddingLeft: 18, lineHeight: 1.6 }}>{d.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>}
              {(d.segments ?? []).length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl" style={{ minWidth: 560 }}>
                    <tbody>
                      {(d.segments ?? []).map((s, i) => {
                        const [arrow, c] = DIR[s.direction ?? ""] ?? ["·", "#A0A7B2"];
                        return (
                          <tr key={i}>
                            <td style={{ whiteSpace: "nowrap" }}><span style={{ color: c, marginRight: 6 }}>{arrow}</span>{s.segment}</td>
                            <td>{s.comment}</td>
                            <td className="m src">{(s.rates ?? []).filter((x) => x.value !== null && x.value !== undefined).slice(0, 3)
                              .map((x) => `${x.label}: ${Number(x.value).toLocaleString("nb-NO")} ${x.unit ?? ""}`).join(" · ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="src" style={{ marginTop: 6, lineHeight: 1.6 }}>
                {d.sale_purchase && <div>Brukte skip: {d.sale_purchase}</div>}
                {d.newbuilding && <div>Nybygg: {d.newbuilding}</div>}
                {d.demolition && <div>Opphugging: {d.demolition}</div>}
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#FF8A5B" }}>Les hele rapporten hos kilden</a> · lest av {r.model}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
