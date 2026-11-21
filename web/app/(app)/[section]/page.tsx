import { notFound } from "next/navigation";
import { MARKET, TOOLS } from "@/lib/menu";

export const dynamic = "force-dynamic";

export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = [...MARKET, ...TOOLS].find((m) => m.href === `/${section}`);
  if (!item || !item.phase) notFound();
  return (
    <section className="panel">
      <div className="empty">
        <b style={{ color: "#E8EAED", fontSize: 15 }}>{item.label}</b>
        <br />
        Denne siden bygges i fase {item.phase}. Designet er klart i modellen.
      </div>
    </section>
  );
}
