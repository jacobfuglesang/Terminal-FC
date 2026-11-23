import Link from "next/link";
import { notFound } from "next/navigation";
import IndicatorTable from "@/components/IndicatorTable";
import NoteList from "@/components/NoteList";
import { type Note, notesByTopic, noteByUrl } from "@/lib/knowledge";
import { indicators, worldNews } from "@/lib/society";
import { THEMES } from "@/lib/themes";

export const dynamic = "force-dynamic";

export default async function Tema({ params }: { params: Promise<{ tema: string }> }) {
  const { tema } = await params;
  const t = THEMES.find((x) => x.id === tema);
  if (!t) notFound();
  const [synth, notes, news, ind] = await Promise.all([
    Promise.all((t.synth ?? []).map((u) => noteByUrl(u))).then((l) => l.filter(Boolean) as Note[]),
    notesByTopic(t.topics, 40, t.kinds),
    worldNews(t.news, 10, 25),
    t.indicators ? indicators(t.indicators) : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="panel" aria-labelledby="h-t">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-t">{t.label}</h2>
          <Link href="/samfunn" className="src" style={{ color: "#FF8A5B" }}>← Samfunnssituasjon</Link>
        </div>
        <p className="note" style={{ marginTop: 0 }}>{t.sub}. Notatene er skrevet av KI ut fra kildene (IMF, IEA, WTO, Verdensbanken, UNCTAD, SEC, forskning og Wikipedia) og sjekket mot dem. Ikke investeringsråd.</p>
      </section>

      {synth.length > 0 && (
        <section className="panel" aria-labelledby="h-s">
          <div className="ph"><h2 id="h-s">Sammenfatninger</h2><span className="src">Binder notatene sammen</span></div>
          <NoteList notes={synth} open empty="" />
        </section>
      )}

      {ind.length > 0 && (
        <section className="panel" aria-labelledby="h-i">
          <div className="ph"><h2 id="h-i">Indikatorer</h2></div>
          <IndicatorTable rows={ind} />
        </section>
      )}

      <section className="panel" aria-labelledby="h-n">
        <div className="ph"><h2 id="h-n">Notater</h2><span className="src">{notes.length} nyeste</span></div>
        <NoteList notes={notes} empty="Ingen notater om dette ennå. Lesejobben går hver lørdag." />
      </section>

      <section className="panel" aria-labelledby="h-x">
        <div className="ph"><h2 id="h-x">Nyheter siste 10 dager</h2></div>
        {news.length === 0 ? <div className="empty">Ingen saker funnet.</div> : (
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
            {news.map((n) => (
              <li key={n.id} style={{ marginBottom: 6 }}>
                <Link href={`/nyheter/${n.id}`} style={{ color: "inherit" }}><b>{n.title}</b></Link>
                <span className="src"> · {n.source} · {new Date(n.published).toLocaleDateString("nb-NO", { day: "numeric", month: "short", timeZone: "Europe/Oslo" })}</span>
                {n.lead && <div className="src">{n.lead}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
