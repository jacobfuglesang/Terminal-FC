import Link from "next/link";
import IndicatorTable from "@/components/IndicatorTable";
import Markdown from "@/components/Markdown";
import NoteList from "@/components/NoteList";
import ReadAloud from "@/components/ReadAloud";
import { notesByTopic, noteByUrl } from "@/lib/knowledge";
import { indicators, societyReports, worldNews } from "@/lib/society";
import { SYN, THEMES } from "@/lib/themes";

export const dynamic = "force-dynamic";

export default async function Samfunn({ searchParams }: { searchParams: Promise<{ uke?: string }> }) {
  const { uke } = await searchParams;
  const [reports, ind, news, world, fresh] = await Promise.all([
    societyReports(20), indicators(), worldNews(undefined, 7, 25),
    noteByUrl(SYN("Verdensøkonomien og geopolitikken: hva driver fraktratene nå")),
    notesByTopic(["geopolitikk", "verdensøkonomi", "makro", "råvarer", "hendelser", "shippingtrading", "analysemetode"], 12, ["syntese"]),
  ]);
  const idx = Math.max(0, uke ? reports.findIndex((r) => r.week === uke) : 0);
  const r = reports[idx];
  const weekLabel = (w: string) => `uke ${Number(w.split("-")[1])}, ${w.split("-")[0]}`;

  return (
    <>
      <section className="panel" aria-labelledby="h-sr">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-sr">{r ? `Samfunnssituasjonen ${weekLabel(r.week)}` : "Samfunnssituasjonen"}</h2>
          <span className="src">
            {reports[idx + 1] && <Link href={`/samfunn?uke=${reports[idx + 1].week}`} style={{ color: "#FF8A5B", marginRight: 12 }}>← Forrige uke</Link>}
            {idx > 0 && <Link href={idx === 1 ? "/samfunn" : `/samfunn?uke=${reports[idx - 1].week}`} style={{ color: "#FF8A5B" }}>Neste uke →</Link>}
          </span>
        </div>
        {r ? (
          <>
            <div style={{ marginBottom: 12 }}><ReadAloud text={r.text} /></div>
            <Markdown text={r.text} />
            <p className="note">
              Skrevet av KI ({r.model}) {new Date(r.created).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Oslo" })} ut fra
              kunnskapsbanken, ukens nyheter og markedsdata. {r.removed > 0 ? `${r.removed} setninger med tall som ikke stod i kildene ble fjernet. ` : ""}
              Ny rapport hver lørdag. KI kan ta feil, og dette er ikke investeringsråd.
            </p>
          </>
        ) : (
          <div className="empty">Den første rapporten skrives lørdag, når lesejobben har Groq-kvoten. Til da kan du lese notatene under.</div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-th">
        <div className="ph"><h2 id="h-th">Temaer</h2><span className="src">Det lesejobben har funnet ut, sortert</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {THEMES.map((t) => (
            <Link key={t.id} href={`/samfunn/${t.id}`} style={{ border: "1px solid var(--line2)", borderRadius: 8, padding: 12, color: "inherit", textDecoration: "none" }}>
              <b>{t.label}</b>
              <div className="src" style={{ marginTop: 4 }}>{t.sub}</div>
            </Link>
          ))}
        </div>
      </section>

      {world && (
        <section className="panel" aria-labelledby="h-world">
          <div className="ph"><h2 id="h-world">Hva driver fraktratene nå</h2><span className="src">Sammenfatning fra kunnskapsbanken</span></div>
          <NoteList notes={[world]} open empty="" />
        </section>
      )}

      <section className="panel" aria-labelledby="h-ind">
        <div className="ph"><h2 id="h-ind">Indikatorer</h2><span className="src">Energi, råvarer, valuta, børs og frakt · sluttkurser</span></div>
        <IndicatorTable rows={ind} />
      </section>

      <section className="panel" aria-labelledby="h-wn">
        <div className="ph"><h2 id="h-wn">Verden siste 7 dager</h2><span className="src">Nyheter om krig, handel, økonomi og energi</span></div>
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

      <section className="panel" aria-labelledby="h-new">
        <div className="ph"><h2 id="h-new">Nytt fra lesejobben</h2><Link href="/kunnskap" className="src" style={{ color: "#FF8A5B" }}>Hele kunnskapsbanken →</Link></div>
        <NoteList notes={fresh} empty="Ingen notater ennå. Lesejobben går hver lørdag." />
      </section>
    </>
  );
}
