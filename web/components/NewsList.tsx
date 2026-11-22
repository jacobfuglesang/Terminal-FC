"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { NewsItem } from "@/lib/db";
import { COMPANIES } from "@/lib/menu";

const CATS = ["Alle", "Børsmelding", "Politikk", "Toll og handel", "Marked", "Selskap", "Biologi"];
const NAME: Record<string, string> = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c.name]));

const osloDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

function dayHeading(iso: string) {
  const d = osloDay(iso);
  const today = osloDay(new Date().toISOString());
  const yesterday = osloDay(new Date(Date.now() - 86400000).toISOString());
  if (d === today) return "I dag";
  if (d === yesterday) return "I går";
  const s = new Date(iso).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Oslo" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ago(iso: string) {
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

// Maks to setninger og ca. 260 tegn i listen
export function shortLead(text: string) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const parts = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t];
  let out = parts.slice(0, 2).join("").trim();
  if (out.length > 260) out = out.slice(0, 260).replace(/\s+\S*$/, "") + " …";
  return out;
}

function Card({ n }: { n: NewsItem }) {
  const lead = shortLead(n.lead);
  return (
    <article style={{ borderTop: "1px solid var(--line2)" }}>
      <Link href={`/nyheter/${n.id}`} className="newscard" style={{ display: "block", padding: "12px 6px", color: "inherit", borderRadius: 6 }}>
        <div className="src" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "var(--accent)" }}>{n.category}</span>
          <span>{n.source}</span>
          <span>{ago(n.published)}</span>
          {n.companies.map((c) => (
            <span key={c} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "0 5px" }}>{NAME[c] ?? c}</span>
          ))}
        </div>
        <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: "var(--text)" }}>{n.title}</h3>
        {lead && <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.55 }}>{lead}</p>}
      </Link>
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
        (!s || `${n.title} ${n.lead}`.toLowerCase().includes(s)),
    );
    out = [...out].sort((a, b) => (b.published || "").localeCompare(a.published || ""));
    if (limit) out = out.slice(0, limit);
    return out;
  }, [items, cat, co, q, limit]);

  if (!items.length) return <div className="empty">Ingen nyheter siste 7 dager. Nye saker hentes hvert kvarter i børstiden og hver time ellers.</div>;

  return (
    <>
      {filters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
          {CATS.filter((c) => c === "Alle" || counts[c]).map((c) => (
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
      {shown.length ? (
        shown.map((n, i) => {
          const showDay = filters && n.published && (i === 0 || osloDay(shown[i - 1].published) !== osloDay(n.published));
          return (
            <Fragment key={n.id}>
              {showDay && (
                <h3 className="src" style={{ margin: i === 0 ? "4px 0 2px" : "18px 0 2px", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
                  {dayHeading(n.published)}
                </h3>
              )}
              <Card n={n} />
            </Fragment>
          );
        })
      ) : (
        <div className="empty">Ingen treff med dette filteret.</div>
      )}
    </>
  );
}
