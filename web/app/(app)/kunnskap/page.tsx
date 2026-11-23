import Link from "next/link";
import NoteList from "@/components/NoteList";
import { CAP, CRED, knowledgeStats, searchKnowledge } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  syntese: "Sammenfatninger", selskap: "Selskaper", mønster: "Kursmønstre", hendelser: "Siste 30 dager", rapport: "Rapporter (IMF, IEA, SEC …)",
  begrep: "Begreper, verden og metode", forskning: "Forskning",
};
const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;

export default async function Kunnskap({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q = "", type } = await searchParams;
  const kind = type && KINDS[type] ? type : undefined;
  const [stats, notes] = await Promise.all([knowledgeStats(), searchKnowledge(q, q ? 40 : 60, kind)]);
  const total = stats?.kinds.reduce((a, k) => a + k.n, 0) ?? 0;
  const used = stats ? stats.dbBytes / stats.limitBytes : 0;
  const chip = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} className="chip" style={on ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>{label}</Link>
  );

  return (
    <>
      <section className="panel" aria-labelledby="h-kb">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-kb">Kunnskapsbank</h2>
          <span className="src">{total} notater{stats?.last ? ` · sist skrevet ${stats.last.slice(0, 16).replace("T", " ")} UTC` : ""}</span>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          KI leser om shipping og shippingtrading, verdensøkonomien og geopolitikken, råvarer, aksjemarkedet og hvordan proffe analytikere jobber, og skriver korte notater med kilde. Kildene er blant annet IMF, IEA, WTO, Verdensbanken, UNCTAD, årsrapporter hos SEC, forskning (arXiv) og Wikipedia.
          Hvert notat sjekkes mot kilden, og punkter med tall som ikke står der fjernes. Kursmønstrene er regnet ut fra kursdataene, ikke skrevet av KI.
          Morgenrapporten og analytikeren søker her for å forklare sammenhenger. Hvert notat er merket med kildetype:{" "}
          {Object.values(CRED).map((c) => <span key={c.label} title={c.help} style={{ color: c.color, marginRight: 8 }}>{c.label}</span>)}
          Offisielle kilder leses først og veier tyngst. Wikipedia brukes til begreper og bakgrunn.
        </p>
        {stats && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="kpi"><div className="l">Database brukt</div><div className="v m">{mb(stats.dbBytes)}</div>
              <div style={{ height: 6, background: "var(--inset)", borderRadius: 3, marginTop: 6, position: "relative" }}>
                <div style={{ width: `${Math.min(100, used * 100)}%`, height: 6, background: used > CAP ? "#FF6B6B" : "#3DDC97", borderRadius: 3 }} />
                <div title={`Tak: ${Math.round(CAP * 100)} %`} style={{ position: "absolute", left: `${CAP * 100}%`, top: -3, height: 12, width: 2, background: "#F5C451" }} />
              </div>
              <div className="src">{(used * 100).toFixed(0)} % av {mb(stats.limitBytes)}, tak {Math.round(CAP * 100)} %</div>
            </div>
            <div className="kpi"><div className="l">Kunnskapsbanken</div><div className="v m">{mb(stats.kbBytes)}</div></div>
            <div className="kpi"><div className="l">Kilder</div><div className="v m">{stats.sources.done ?? 0} lest</div>
              <div className="src">{stats.sources.pending ?? 0} i kø · {stats.sources.skip ?? 0} hoppet over · {stats.sources.error ?? 0} feil</div></div>
          </div>
        )}
        <form action="/kunnskap" style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input name="q" defaultValue={q} placeholder="Søk, f.eks. Hormuz, VLCC, utbytte, Frontline" aria-label="Søk i kunnskapsbanken"
            style={{ flex: 1, background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px" }} />
          {kind && <input type="hidden" name="type" value={kind} />}
          <button className="btn" type="submit">Søk</button>
        </form>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chip(q ? `/kunnskap?q=${encodeURIComponent(q)}` : "/kunnskap", "Alle", !kind)}
          {Object.entries(KINDS).map(([k, label]) => chip(`/kunnskap?type=${encodeURIComponent(k)}${q ? `&q=${encodeURIComponent(q)}` : ""}`, `${label}${stats ? ` (${stats.kinds.find((x) => x.kind === k)?.n ?? 0})` : ""}`, kind === k))}
        </div>
      </section>

      <section className="panel" aria-labelledby="h-notes">
        <div className="ph"><h2 id="h-notes">{q ? `Treff for «${q}»` : "Nyeste notater"}</h2><span className="src">{notes.length} vist</span></div>
        {notes.length === 0 ? (
          <div className="empty">{total === 0 ? "Ingen notater ennå. Kunnskapsbanken fylles når den lokale modellen har lest." : "Ingen treff."}</div>
        ) : <NoteList notes={notes} empty="" />}
      </section>
    </>
  );
}
