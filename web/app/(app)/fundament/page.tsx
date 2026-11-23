import { readFoundation, sections } from "@/lib/foundation";

export const dynamic = "force-dynamic";

// Lenker [tekst](url), **uthevet** og vanlig tekst
function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={k}>{p.slice(2, -2)}</strong>;
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
    if (m) return <a key={k} href={m[2]} target="_blank" rel="noreferrer" style={{ color: "#FF8A5B" }}>{m[1]}</a>;
    return <span key={k}>{p}</span>;
  });
}

function Body({ text, id }: { text: string; id: string }) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: string) => {
    if (list.length) {
      out.push(<ul key={`ul-${k}`} style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.6 }}>{list.map((l, i) => <li key={i}>{inline(l, `${id}-${k}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  text.split("\n").forEach((raw, i) => {
    const l = raw.trim();
    const h = /^###\s+(.*)$/.exec(l);
    if (h) { flush(String(i)); out.push(<h3 key={i} style={{ fontSize: 13.5, margin: "16px 0 6px", color: "#E8EAED" }}>{h[1]}</h3>); return; }
    const b = /^[-*•]\s+(.*)$/.exec(l) || /^\d+\.\s+(.*)$/.exec(l);
    if (b) { list.push(b[1]); return; }
    flush(String(i));
    if (l) out.push(<p key={i} style={{ margin: "0 0 10px", lineHeight: 1.6 }}>{inline(l, `${id}-${i}`)}</p>);
  });
  flush("end");
  return <div style={{ color: "#D5D9DF" }}>{out}</div>;
}

export default function Fundament() {
  const md = readFoundation();
  const title = /^#\s+(.*)$/m.exec(md)?.[1] ?? "Fundament";
  const updated = /^Sist oppdatert:\s*(.*)$/m.exec(md)?.[1] ?? "";
  const secs = sections(md);
  return (
    <>
      <section className="panel" aria-labelledby="h-fund">
        <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 id="h-fund">{title}</h2>
          <span className="src">{updated ? `Sist oppdatert: ${updated}` : ""}</span>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          Terminalens faste grunnlag for analyse av shippingaksjer, skrevet av Claude fra troverdige kilder og oppdatert én gang i måneden.
          Dokumentet slettes aldri, og alle tidligere versjoner ligger i repoet. Morgenrapporten og analytikeren bruker det som bakgrunn. Ikke investeringsråd.
        </p>
        {secs.length > 1 && (
          <nav aria-label="Innhold" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {secs.map((s) => <a key={s.id} href={`#${s.id}`} className="chip">{s.title}</a>)}
          </nav>
        )}
      </section>
      {secs.map((s) => (
        <section key={s.id} id={s.id} className="panel" aria-labelledby={`h-${s.id}`}>
          <div className="ph"><h2 id={`h-${s.id}`}>{s.title}</h2><a href="#h-fund" className="src" style={{ color: "#FF8A5B" }}>Til toppen</a></div>
          <Body text={s.text} id={s.id} />
        </section>
      ))}
    </>
  );
}
