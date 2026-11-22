import Link from "next/link";
import type { RepRate, Report } from "@/lib/db";
import { COMPANIES } from "@/lib/universe";

const nf = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? "–" : Number(v).toLocaleString("nb-NO", { maximumFractionDigits: d });

const day = (iso: string) => new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Oslo" });

// Grønn hake: tallet står i kildeteksten. Gult spørsmålstegn: fant det ikke, så sjekk selv.
function Ok({ ok }: { ok?: boolean }) {
  if (ok === undefined) return null;
  return ok ? (
    <span title="Tallet står i rapporten" style={{ color: "#3DDC97", marginLeft: 4 }} aria-label="kontrollert">✓</span>
  ) : (
    <span title="Fant ikke tallet ordrett i rapporten. Sjekk kilden." style={{ color: "#F5C451", marginLeft: 4 }} aria-label="ikke kontrollert">?</span>
  );
}

const TONE: Record<string, string> = { positiv: "#3DDC97", nøytral: "#A0A7B2", negativ: "#FF6B6B" };

function RateTable({ title, rows, share }: { title: string; rows?: RepRate[]; share?: boolean }) {
  const list = (rows ?? []).filter((r) => r.rate !== null && r.rate !== undefined);
  if (!list.length) return null;
  return (
    <div style={{ flex: "1 1 240px" }}>
      <div className="src" style={{ marginBottom: 4 }}>{title}</div>
      <table className="tbl">
        <tbody>
          {list.map((r, i) => (
            <tr key={i}>
              <td>{r.segment ?? "–"}{r.period ? <span className="src"> · {r.period}</span> : null}{r.note ? <div className="src">{r.note}</div> : null}</td>
              {share && <td className="m">{r.share_pct === null || r.share_pct === undefined ? "–" : `${nf(r.share_pct, 0)} %`}<Ok ok={r.share_pct_ok} /></td>}
              <td className="m" style={{ textAlign: "right" }}>{nf(r.rate, 0)} <span className="src">{r.unit ?? ""}</span><Ok ok={r.rate_ok} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportCard({ r, showCompany = true, compact = false }: { r: Report; showCompany?: boolean; compact?: boolean }) {
  const d = r.data ?? {};
  const co = COMPANIES.find((c) => c.symbol === r.symbol);
  const tone = (d.tone ?? "").toLowerCase().split(/[\s|]/)[0];
  const nums = [
    ...(d.numbers ?? []),
    ...(d.dividend?.per_share !== null && d.dividend?.per_share !== undefined
      ? [{ label: "Utbytte per aksje", value: d.dividend.per_share, unit: d.dividend.unit, value_ok: d.dividend.per_share_ok }]
      : []),
    ...(d.balance ?? []),
  ].filter((n) => n.value !== null && n.value !== undefined);

  return (
    <article style={{ borderTop: "1px solid var(--line2)", padding: "14px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {showCompany && co && <Link href={`/selskap/${co.id}`} style={{ fontWeight: 600, color: "#FF8A5B" }}>{co.name}</Link>}
        <span style={{ fontWeight: 600 }}>{r.period}</span>
        <span className="src">{day(r.published)} · {co?.segment}</span>
        {tone && TONE[tone] && <span className="tag" style={{ color: TONE[tone], borderColor: TONE[tone] }}>Tone: {tone}</span>}
      </div>
      {d.headline && <p style={{ margin: "6px 0 8px", fontSize: 15 }}>{d.headline}</p>}
      {d.summary && d.summary.length > 0 && (
        <ul style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.6 }}>
          {d.summary.slice(0, compact ? 3 : 8).map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <RateTable title="Booket for neste periode" rows={d.bookings} share />
        <RateTable title="Oppnådd dagrate (TCE)" rows={d.tce} />
        <RateTable title="Dødpunkt (break-even)" rows={d.breakeven} />
      </div>

      {!compact && nums.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {nums.slice(0, 10).map((n, i) => (
            <div key={i} className="kpi" style={{ minWidth: 150, flex: "0 1 auto" }}>
              <div className="l">{n.label}{n.period ? ` · ${n.period}` : ""}</div>
              <div className="v m" style={{ fontSize: 16 }}>{nf(n.value)} <span className="src">{n.unit ?? ""}</span><Ok ok={n.value_ok} /></div>
            </div>
          ))}
        </div>
      )}

      {!compact && d.fleet && <p style={{ margin: "4px 0" }}><span className="src">Flåte: </span>{d.fleet}</p>}
      {d.outlook && <p style={{ margin: "4px 0" }}><span className="src">Ledelsen om markedet: </span>{d.outlook}</p>}
      {!compact && d.watch && d.watch.length > 0 && (
        <p style={{ margin: "4px 0" }}><span className="src">Følg med på: </span>{d.watch.join(" · ")}</p>
      )}

      <div className="src" style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>Kilder:</span>
        {r.messageIds.map((id) => <Link key={id} href={`/melding/${id}`} style={{ color: "#FF8A5B" }}>Børsmelding {id}</Link>)}
        {(d.files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf")).map((f) => (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer" style={{ color: "#FF8A5B" }}>{f.name}</a>
        ))}
      </div>
      {d.check && (
        <div className="src" style={{ marginTop: 4 }}>
          Lest av KI ({r.model}). {d.check.checked - d.check.unverified} av {d.check.checked} tall funnet ordrett i rapporten
          {d.check.unverified > 0 ? ". Tall merket ? må sjekkes mot kilden." : "."} KI kan ta feil. Ikke investeringsråd.
        </div>
      )}
    </article>
  );
}
