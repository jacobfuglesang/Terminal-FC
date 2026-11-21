"use client";

import { useMemo, useState } from "react";
import type { NewsItem } from "@/lib/db";
import { COMPANIES } from "@/lib/menu";

const CATS = ["Alle", "Politikk", "Toll og handel", "Marked", "Selskap", "Biologi"];
const NAME: Record<string, string> = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c.name]));

function ago(iso: string) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "nå";
  if (m < 60) return `${m} min siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.round(h / 24);
  if (d < 8) return `${d} d siden`;
  return new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short", timeZone: "Europe/Oslo" });
}

function Card({ n }: { n: NewsItem }) {
  const [open, setOpen] = useState(false);
  const text = n.summary || n.excerpt;
  const long = text.length > 220;
  return (
    <article style={{ padding: "12px 0", borderTop: "1px solid var(--line2)" }}>
      <div className="src" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "var(--accent)" }}>{n.category}</span>
        <span>{n.source}</span>
        <span>{ago(n.published)}</span>
        {n.companies.map((c) => (
          <span key={c} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "0 5px" }}>{NAME[c] ?? c}</span>
        ))}
      </div>
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
        <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)" }}>{n.title}</a>
      </h3>
      {text && (
        <p style={{ margin: "0 0 6px", color: "var(--muted)", lineHeight: 1.55 }}>
          {open || !long ? text : text.slice(0, 220).replace(/\s+\S*$/, "") + " …"}
          {n.summary && <span className="src"> · AI-sammendrag</span>}
        </p>
      )}
      <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
        {long && (
          <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, padding: 0, color: "var(--muted)", fontSize: 12 }}>
            {open ? "Vis mindre" : "Les mer"}
          </button>
        )}
        <a href={n.url} target="_blank" rel="noopener noreferrer">Åpne hos {n.source || "kilden"} ↗</a>
      </div>
    </article>
  );
}

export default function NewsList({ items, filters = true, limit }: { items: NewsItem[]; filters?: boolean; limit?: number }) {
  const [cat, setCat] = useState("Alle");
  const [co, setCo] = useState("");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { Alle: items.length };
    for (const n of items) c[n.category] = (c[n.category] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = items.filter(
      (n) =>
        (cat === "Alle" || n.category === cat) &&
        (!co || n.companies.includes(co)) &&
        (!s || `${n.title} ${n.excerpt} ${n.summary ?? ""}`.toLowerCase().includes(s)),
    );
    if (limit) out = out.slice(0, limit);
    return out;
  }, [items, cat, co, q, limit]);

  if (!items.length) return <div className="empty">Ingen nyheter ennå. De hentes automatisk hvert kvarter i børstiden og hver time ellers.</div>;

  return (
    <>
      {filters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
          {CATS.map((c) => (
            <button key={c} type="button" className="btn" aria-pressed={c === cat} onClick={() => setCat(c)}
              style={{ background: c === cat ? "#2A2E36" : undefined, borderColor: c === cat ? "#4A505A" : undefined }}>
              {c} <span className="src">{counts[c] ?? 0}</span>
            </button>
          ))}
          <select value={co} onChange={(e) => setCo(e.target.value)} aria-label="Selskap"
            style={{ background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px" }}>
            <option value="">Alle selskaper</option>
            {COMPANIES.map((c) => <option key={c.symbol} value={c.symbol}>{c.name}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i nyheter" aria-label="Søk i nyheter"
            style={{ flex: "1 1 160px", background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px" }} />
        </div>
      )}
      {shown.length ? shown.map((n) => <Card key={n.id} n={n} />) : <div className="empty">Ingen treff med dette filteret.</div>}
    </>
  );
}
