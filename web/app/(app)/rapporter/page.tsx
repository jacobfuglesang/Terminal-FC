import Link from "next/link";
import ReportCard from "@/components/ReportCard";
import { getReportQueue, getReports } from "@/lib/db";
import { COMPANIES, SEGMENTS } from "@/lib/universe";

export const dynamic = "force-dynamic";

export default async function Rapporter({ searchParams }: { searchParams: Promise<{ seg?: string; selskap?: string }> }) {
  const { seg, selskap } = await searchParams;
  const [reports, queue] = await Promise.all([getReports({ limit: 200 }), getReportQueue()]);
  const co = COMPANIES.find((c) => c.id === selskap);
  const list = reports.filter((r) => {
    const c = COMPANIES.find((x) => x.symbol === r.symbol);
    if (co) return r.symbol === co.symbol;
    return !seg || c?.segment === seg;
  });
  const chip = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} className="chip" style={on ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>{label}</Link>
  );

  return (
    <>
      <section className="panel" aria-labelledby="h-rep">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-rep">Kvartalsrapporter lest av KI</h2>
          <span className="src">
            {queue.ok ?? 0} lest{queue.pending ? ` · ${queue.pending} i kø (leses et par om gangen)` : ""}{queue.error ? ` · ${queue.error} kunne ikke leses` : ""}
          </span>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          KI leser pressemelding, rapport og presentasjon fra Newsweb og henter ut booking for neste kvartal, oppnådd dagrate,
          dødpunkt, utbytte og hva ledelsen sier om markedet. Hvert tall sjekkes mot rapporten: ✓ betyr at tallet står der, ? betyr at du bør sjekke kilden.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          {chip("/rapporter", "Alle", !seg && !co)}
          {SEGMENTS.map((s) => chip(`/rapporter?seg=${encodeURIComponent(s)}`, s, seg === s && !co))}
        </div>
        {co && <div className="src" style={{ marginBottom: 8 }}>Viser bare {co.name}. <Link href="/rapporter" style={{ color: "#FF8A5B" }}>Vis alle</Link></div>}
        {list.length === 0 ? (
          <div className="empty">Ingen leste rapporter her ennå. Rapportleseren går gjennom køen ved hver kjøring.</div>
        ) : (
          list.map((r) => <ReportCard key={r.key} r={r} />)
        )}
      </section>
    </>
  );
}
