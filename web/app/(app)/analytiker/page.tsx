import Link from "next/link";
import AskBox from "@/components/AskBox";
import Markdown from "@/components/Markdown";
import { getBriefs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Analytiker() {
  const [today] = await getBriefs(1);
  return (
    <>
      <section className="panel" aria-labelledby="h-ask">
        <div className="ph"><h2 id="h-ask">Spør analytikeren</h2><span className="src">KI (Groq) som svarer ut fra dataene, kvartalsrapportene og nyhetene i terminalen</span></div>
        <AskBox />
        <p className="note">Svarene bygger på siste morgenrapports datagrunnlag, dagens kurser, siste kvartalsrapport per rederi og nyhetene fra de siste tre dagene. KI kan ta feil, og gir ikke investeringsråd.</p>
      </section>

      <section className="panel" aria-labelledby="h-kort">
        <div className="ph">
          <h2 id="h-kort">Dagens morgenrapport, kort</h2>
          <Link href="/morgenrapport" className="src" style={{ color: "#FF8A5B" }}>Hele rapporten, opplesning og arkiv →</Link>
        </div>
        {today ? <Markdown text={today.text} limitSections={1} /> : <div className="empty">Første rapport skrives ved neste morgenkjøring.</div>}
      </section>
    </>
  );
}
