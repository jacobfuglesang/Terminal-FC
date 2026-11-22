import Link from "next/link";
import Markdown from "@/components/Markdown";
import ReadAloud from "@/components/ReadAloud";
import ReportCard from "@/components/ReportCard";
import { getBriefs, getReports } from "@/lib/db";

export const dynamic = "force-dynamic";

const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function Morgenrapport({ searchParams }: { searchParams: Promise<{ dag?: string }> }) {
  const { dag } = await searchParams;
  const [briefs, reports] = await Promise.all([getBriefs(60), getReports({ limit: 12 })]);
  const idx = Math.max(0, dag ? briefs.findIndex((b) => b.day === dag) : 0);
  const b = briefs[idx];
  const newer = briefs[idx - 1], older = briefs[idx + 1];
  const fresh = b ? reports.filter((r) => new Date(r.published) > new Date(new Date(`${b.day}T12:00:00Z`).getTime() - 10 * 864e5) && new Date(r.published) <= new Date(`${b.day}T23:59:59Z`)) : [];

  return (
    <>
      <section className="panel" aria-labelledby="h-mr">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-mr">{b ? `Morgenrapport ${longDay(b.day)}` : "Morgenrapport"}</h2>
          <span className="src">
            {older && <Link href={`/morgenrapport?dag=${older.day}`} style={{ color: "#FF8A5B", marginRight: 12 }}>← Forrige dag</Link>}
            {newer && <Link href={idx - 1 === 0 ? "/morgenrapport" : `/morgenrapport?dag=${newer.day}`} style={{ color: "#FF8A5B" }}>Neste dag →</Link>}
          </span>
        </div>
        {b ? (
          <>
            <div style={{ marginBottom: 12 }}><ReadAloud text={b.text} /></div>
            <Markdown text={b.text} />
            <p className="note">
              Skrevet av KI ({b.model}) {new Date(b.created).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Oslo" })} ut fra
              dataene i terminalen. Ny rapport kommer hver morgen kl. 06:35. KI kan ta feil, og dette er ikke investeringsråd.
            </p>
            <details style={{ marginTop: 10 }}>
              <summary className="src" style={{ cursor: "pointer" }}>Vis tallene rapporten bygger på</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#A0A7B2", background: "var(--inset)", padding: 12, borderRadius: 8, marginTop: 8 }}>{b.snapshot}</pre>
            </details>
          </>
        ) : (
          <div className="empty">Første rapport skrives ved neste morgenkjøring.</div>
        )}
      </section>

      {fresh.length > 0 && (
        <section className="panel" aria-labelledby="h-mr-rep">
          <div className="ph">
            <h2 id="h-mr-rep">Kvartalsrapporter KI har lest siste dager</h2>
            <Link href="/rapporter" className="src" style={{ color: "#FF8A5B" }}>Alle rapporter →</Link>
          </div>
          {fresh.map((r) => <ReportCard key={r.key} r={r} compact />)}
        </section>
      )}

      {briefs.length > 1 && (
        <section className="panel" aria-labelledby="h-mr-arkiv">
          <div className="ph"><h2 id="h-mr-arkiv">Arkiv</h2><span className="src">{briefs.length} rapporter</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {briefs.map((x, i) => (
              <Link key={x.day} href={i === 0 ? "/morgenrapport" : `/morgenrapport?dag=${x.day}`} className="chip"
                style={i === idx ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>
                {new Date(`${x.day}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" })}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
