import { ALARM, FOUNDATION_SHARE, RESEARCH_CAP, type StorageInfo } from "@/lib/storage";

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: b < 10 * 1024 * 1024 ? 1 : 0 })} MB`;
const pct = (v: number) => `${(v * 100).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;

export default function StoragePanel({ info }: { info: StorageInfo | null }) {
  if (!info) return (
    <section className="panel"><div className="ph"><h2>Lagring</h2></div><div className="empty">Fikk ikke lest lagringsbruken fra databasen.</div></section>
  );
  const used = info.total / info.limit;
  const left = Math.max(0, info.limit - info.total);
  const parts = [...info.groups.map((g) => ({ label: g.label, color: g.color, bytes: g.bytes })), { label: "Postgres (system)", color: "#4A4F58", bytes: info.other }];
  return (
    <section className="panel" aria-labelledby="h-lagring">
      <div className="ph"><h2 id="h-lagring">Lagring</h2><span className="src">Neon gratis: {mb(info.limit)} per prosjekt</span></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="kpi"><div className="l">Brukt</div><div className="v m">{mb(info.total)}</div><div className="src">{pct(used)} av grensen</div></div>
        <div className="kpi"><div className="l">Igjen</div><div className="v m">{mb(left)}</div><div className="src">{pct(1 - used)} ledig</div></div>
        <div className="kpi"><div className="l">Tak for lesingen</div><div className="v m">{mb(info.limit * RESEARCH_CAP)}</div><div className="src">{Math.round(RESEARCH_CAP * 100)} %, rydding fra {Math.round(ALARM * 100)} %</div></div>
      </div>
      <div style={{ position: "relative", height: 16, background: "var(--inset)", borderRadius: 4, overflow: "hidden", display: "flex" }} aria-label={`Brukt ${pct(used)} av lagringen`}>
        {parts.map((p) => <div key={p.label} title={`${p.label}: ${mb(p.bytes)}`} style={{ width: `${(p.bytes / info.limit) * 100}%`, background: p.color }} />)}
        <div title={`Tak for lesingen (${Math.round(RESEARCH_CAP * 100)} %)`} style={{ position: "absolute", left: `${RESEARCH_CAP * 100}%`, top: 0, bottom: 0, width: 2, background: "#F5C451" }} />
      </div>
      <div className="src" style={{ marginTop: 4 }}>Gul strek: taket for kunnskapsbanken. Ved 100 % stopper all oppdatering i terminalen.</div>
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table className="tbl">
          <thead><tr><th>Brukt til</th><th>Størrelse</th><th>Andel av grensen</th><th>Hva det er</th></tr></thead>
          <tbody>
            {info.groups.map((g) => (
              <tr key={g.id}>
                <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: g.color, marginRight: 6 }} />{g.label}</td>
                <td className="m">{mb(g.bytes)}</td>
                <td className="m">{pct(g.bytes / info.limit)}</td>
                <td className="src" title={g.tables.map((t) => `${t.name}: ${mb(t.bytes)}`).join("\n")}>{g.about}</td>
              </tr>
            ))}
            <tr><td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#4A4F58", marginRight: 6 }} />Postgres (system)</td>
              <td className="m">{mb(info.other)}</td><td className="m">{pct(info.other / info.limit)}</td><td className="src">Databasens egne tabeller og oversikter</td></tr>
            <tr><td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#7FD1C7", marginRight: 6 }} />Fundamentet (i koden)</td>
              <td className="m">{mb(info.foundation)}</td><td className="m">{pct(info.foundation / info.limit)}</td>
              <td className="src">Fast dokument på GitHub, ikke i databasen. Tak {mb(info.limit * FOUNDATION_SHARE)} ({Math.round(FOUNDATION_SHARE * 100)} %): eldste måned i arkivet slettes først.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        Blir det trangt, slettes først de eldste notatene fra lørdagslesingen (kildene kan leses på nytt senere), deretter eldre rådata.
        Dine egne notater, handler og bookingjusteringer slettes aldri automatisk. Hold musen over en rad for å se tabellene.
      </p>
    </section>
  );
}
