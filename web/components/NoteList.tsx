import { CRED, type Note } from "@/lib/knowledge";

// Notater fra kunnskapsbanken, sammenfoldet (klikk for å åpne)
export default function NoteList({ notes, open = false, empty }: { notes: Note[]; open?: boolean; empty: string }) {
  if (!notes.length) return <div className="empty">{empty}</div>;
  return (
    <>
      {notes.map((n, i) => (
        <details key={n.id} open={open && i === 0} style={{ borderTop: "1px solid var(--line2)", padding: "8px 0" }}>
          <summary style={{ cursor: "pointer" }}>
            <b>{n.title}</b>{" "}
            <span title={CRED[n.credibility].help} style={{ fontSize: 11, border: `1px solid ${CRED[n.credibility].color}`, color: CRED[n.credibility].color, borderRadius: 4, padding: "0 5px", marginLeft: 4 }}>{CRED[n.credibility].label}</span>
            {" "}<span className="src">· {n.created.slice(0, 10)}{n.model.startsWith("lokal/") ? " · lokal modell" : ""}</span>
          </summary>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6, lineHeight: 1.5 }}>{n.body}</div>
          <div className="src" style={{ marginTop: 6 }}>
            Kilde: {n.link ? <a href={n.link} target="_blank" rel="noreferrer" style={{ color: "#FF8A5B" }}>{n.source}</a> : n.source}
            {" · "}{n.model === "utregnet" ? "regnet ut fra data" : `skrevet av ${n.model}`}
            {n.unverified > 0 ? ` · ${n.unverified} punkter fjernet fordi tallene ikke stod i kilden` : ""}
          </div>
        </details>
      ))}
    </>
  );
}
