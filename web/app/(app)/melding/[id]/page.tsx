import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnnouncement } from "@/lib/db";
import { COMPANIES } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Melding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getAnnouncement(Number(id));
  if (!m) notFound();
  const co = COMPANIES.find((c) => c.symbol === m.symbol);
  return (
    <article className="panel" style={{ maxWidth: 820 }}>
      {co && <Link href={`/selskap/${co.id}`} className="src" style={{ color: "#FF8A5B" }}>← {co.name}</Link>}
      <div className="src" style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0 6px" }}>
        <span style={{ color: "var(--accent)" }}>{m.kind}</span>
        <span>{co?.name}</span>
        <span>{new Date(m.published).toLocaleString("nb-NO", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Oslo" })}</span>
        {m.attachments > 0 && <span>{m.attachments} vedlegg på Newsweb</span>}
      </div>
      <h1 style={{ fontSize: 21, lineHeight: 1.3, margin: "0 0 14px" }}>{m.title}</h1>
      <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7, color: "#D5D9DF" }}>{m.body || "Meldingen har ingen tekst. Se vedleggene på Newsweb."}</div>
      <p style={{ marginTop: 18 }}>
        <a href={`https://newsweb.oslobors.no/message/${m.id}`} target="_blank" rel="noopener noreferrer">Åpne på Newsweb (med vedlegg) ↗</a>
      </p>
    </article>
  );
}
