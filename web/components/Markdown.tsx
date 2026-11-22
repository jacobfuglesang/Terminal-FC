// Enkel visning av analytikerens tekst: overskrifter (##), punktlister (-, *) og uthevet (**tekst**).
function inline(text: string, key: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{p}</span>));
}

export default function Markdown({ text, limitSections }: { text: string; limitSections?: number }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let sections = 0;
  const flush = (k: string) => {
    if (list.length) {
      out.push(<ul key={`ul-${k}`} style={{ margin: "0 0 10px", paddingLeft: 18, lineHeight: 1.6 }}>{list.map((l, i) => <li key={i}>{inline(l, `${k}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flush(String(i));
      sections++;
      if (limitSections && sections > limitSections) break;
      out.push(<h3 key={i} style={{ fontSize: 13, margin: "14px 0 6px", color: "#E8EAED", letterSpacing: ".02em" }}>{h[1].replace(/\*\*/g, "")}</h3>);
      continue;
    }
    const b = l.match(/^[-*•]\s+(.*)$/) || l.match(/^\d+\.\s+(.*)$/);
    if (b) { list.push(b[1]); continue; }
    flush(String(i));
    if (l) out.push(<p key={i} style={{ margin: "0 0 10px", lineHeight: 1.6 }}>{inline(l, String(i))}</p>);
  }
  flush("end");
  return <div style={{ color: "#D5D9DF" }}>{out}</div>;
}
