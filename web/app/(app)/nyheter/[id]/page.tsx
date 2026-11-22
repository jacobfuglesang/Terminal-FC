import Link from "next/link";
import { notFound } from "next/navigation";
import { getNewsItem } from "@/lib/db";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

const NAME: Record<string, string> = Object.fromEntries(COMPANIES.map((c) => [c.symbol, c.name]));

function when(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" });
}

function paragraphs(text: string) {
  return text
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default async function Artikkel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await getNewsItem(id);
  if (!n) notFound();
  const body = n.body ? paragraphs(n.body) : [];
  const fallback = !body.length && n.excerpt ? paragraphs(n.excerpt) : [];

  return (
    <article className="panel" style={{ maxWidth: 820 }}>
      <Link href="/nyheter" className="src" style={{ color: "#FF8A5B" }}>← Alle nyheter</Link>
      <div className="src" style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "14px 0 6px" }}>
        <span style={{ color: "var(--accent)" }}>{n.category}</span>
        <span>{n.source}</span>
        <span>{when(n.published)}</span>
        {n.companies.map((c) => (
          <span key={c} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: "0 5px" }}>{NAME[c] ?? c}</span>
        ))}
      </div>
      <h1 style={{ fontSize: 22, lineHeight: 1.3, margin: "0 0 14px" }}>{n.title}</h1>

      {n.summary && (
        <div style={{ background: "var(--inset)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
          <div className="src" style={{ marginBottom: 4 }}>Kort fortalt · KI-sammendrag</div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{n.summary}</p>
        </div>
      )}

      {n.image && n.bodyStatus === "full" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={n.image} alt="" referrerPolicy="no-referrer" style={{ width: "100%", maxHeight: 380, objectFit: "cover", borderRadius: 8, marginBottom: 16 }} />
      )}

      <div style={{ fontSize: 15, lineHeight: 1.75, color: "#D5D9DF" }}>
        {(body.length ? body : fallback).map((p, i) => (
          <p key={i} style={{ margin: "0 0 14px", whiteSpace: n.feed === "newsweb" ? "pre-wrap" : undefined }}>{p}</p>
        ))}
      </div>

      {n.bodyStatus === "partial" && (
        <div className="empty" style={{ textAlign: "left", marginTop: 8 }}>
          Dette er bare starten av saken. Resten ligger bak betalingsmur hos {n.source}. Har du abonnement, kan du lese hele saken der.
        </div>
      )}
      {!body.length && !fallback.length && (
        <div className="empty" style={{ textAlign: "left" }}>
          {n.bodyStatus === "none"
            ? `${n.source} tillater ikke at teksten hentes automatisk. Åpne saken hos kilden for å lese den.`
            : "Teksten hentes i løpet av noen minutter. Prøv igjen litt senere, eller åpne saken hos kilden."}
        </div>
      )}

      <p style={{ marginTop: 18 }}>
        <a href={n.url} target="_blank" rel="noopener noreferrer">Åpne originalen hos {n.source || "kilden"} ↗</a>
      </p>
      <p className="note">Teksten er hentet fra kilden for privat lesing i terminalen. Opphavsretten tilhører {n.source || "kilden"}.</p>
    </article>
  );
}
