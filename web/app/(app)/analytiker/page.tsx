import AskBox from "@/components/AskBox";
import Markdown from "@/components/Markdown";
import { getBriefs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Analytiker() {
  const briefs = await getBriefs(10);
  const [today, ...older] = briefs;
  return (
    <>
      <section className="panel" aria-labelledby="h-ask">
        <div className="ph"><h2 id="h-ask">Spør analytikeren</h2><span className="src">KI (Groq) som svarer ut fra dataene og nyhetene i terminalen</span></div>
        <AskBox />
        <p className="note">Svarene bygger på siste morgenrapports datagrunnlag, dagens kurser og nyhetene fra de siste tre dagene. KI kan ta feil, og gir ikke investeringsråd.</p>
      </section>

      <section className="panel" aria-labelledby="h-rapport">
        <div className="ph">
          <h2 id="h-rapport">Morgenrapport {today ? new Date(`${today.day}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" }) : ""}</h2>
          <span className="src">{today ? `Skrevet ${new Date(today.created).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" })} av ${today.model}` : ""}</span>
        </div>
        {today ? <Markdown text={today.text} /> : <div className="empty">Første rapport skrives ved neste morgenkjøring.</div>}
        {today && (
          <details style={{ marginTop: 10 }}>
            <summary className="src" style={{ cursor: "pointer" }}>Vis tallene rapporten bygger på</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#A0A7B2", background: "var(--inset)", padding: 12, borderRadius: 8, marginTop: 8 }}>{today.snapshot}</pre>
          </details>
        )}
      </section>

      {older.length > 0 && (
        <section className="panel" aria-labelledby="h-eldre">
          <div className="ph"><h2 id="h-eldre">Tidligere rapporter</h2><span className="src">Siste {older.length} dager</span></div>
          {older.map((b) => (
            <details key={b.day} style={{ borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
              <summary style={{ cursor: "pointer" }}>{new Date(`${b.day}T12:00:00Z`).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}</summary>
              <div style={{ marginTop: 8 }}><Markdown text={b.text} /></div>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
