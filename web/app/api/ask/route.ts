import { NextResponse } from "next/server";
import { bookingLines } from "@/lib/bookingdata";
import { sql } from "@/lib/db";
import { searchKnowledge } from "@/lib/knowledge";
import { authed, deny } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREF = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile"];

async function models(key: string): Promise<string[]> {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const js = await r.json();
    const have = new Set<string>((js.data ?? []).map((m: { id: string }) => m.id));
    const ok = PREF.filter((m) => have.has(m));
    return ok.length ? ok : PREF.slice(0, 2);
  } catch {
    return PREF.slice(0, 2);
  }
}

export async function POST(req: Request) {
  if (!(await authed())) return deny();
  const key = (process.env.GROQ_API_KEY ?? "").trim();
  if (!key) return NextResponse.json({ error: "GROQ_API_KEY mangler i Vercel (Settings > Environment Variables). Legg den inn og gjør en ny deploy." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim().slice(0, 600);
  if (question.length < 3) return NextResponse.json({ error: "Skriv et spørsmål." }, { status: 400 });

  const db = sql();
  const [snap] = (await db`SELECT snapshot, day::text AS day FROM briefs ORDER BY day DESC LIMIT 1`) as { snapshot: string; day: string }[];
  const quotes = (await db`SELECT name, symbol, price, change_pct FROM quotes ORDER BY name`) as { name: string; symbol: string; price: number; change_pct: number | null }[];
  const news = (await db`SELECT title, source, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 220)) AS s FROM news
    WHERE published > now() - interval '3 days' AND body_status IS DISTINCT FROM 'blocked' ORDER BY published DESC LIMIT 30`) as { title: string; source: string; s: string }[];
  // Siste kvartalsrapport per selskap, lest av KI-rapportleseren (kort form)
  type Rep = { symbol: string; period: string; data: { headline?: string; outlook?: string; bookings?: { segment?: string; period?: string; share_pct?: number; rate?: number; unit?: string }[]; breakeven?: { segment?: string; rate?: number; unit?: string }[]; dividend?: { per_share?: number; unit?: string } } };
  let reps: Rep[] = [];
  try {
    reps = (await db`SELECT DISTINCT ON (symbol) symbol, period, data FROM reports WHERE (status = 'ok' OR (status = 'pending' AND data ? 'v')) ORDER BY symbol, published DESC`) as Rep[];
  } catch {
    reps = []; // tabellen finnes ikke før rapportleseren har kjørt første gang
  }
  const repText = reps.map((r) => {
    const d = r.data ?? {};
    const bk = (d.bookings ?? []).filter((b) => b.rate).slice(0, 3).map((b) => `${b.segment} ${b.share_pct ?? "?"} % til ${b.rate} ${b.unit ?? ""} (${b.period ?? ""})`).join("; ");
    const be = (d.breakeven ?? []).filter((b) => b.rate).slice(0, 2).map((b) => `${b.segment} ${b.rate} ${b.unit ?? ""}`).join("; ");
    const dv = d.dividend?.per_share ? `utbytte ${d.dividend.per_share} ${d.dividend.unit ?? ""}` : "";
    return `- ${r.symbol} ${r.period}: ${d.headline ?? ""}${bk ? ` Booket: ${bk}.` : ""}${be ? ` Dødpunkt: ${be}.` : ""}${dv ? ` ${dv}.` : ""}${d.outlook ? ` Utsikter: ${d.outlook}` : ""}`;
  }).join("\n").slice(0, 3500);
  // Bookingtabellen (samme regning som på bookingsiden) og kunnskapsbanken (notater som passer til spørsmålet)
  const [books, notes] = await Promise.all([bookingLines().catch(() => [] as string[]), searchKnowledge(question, 6)]);
  const noteText = notes.map((n) => `### ${n.title} (${n.source || n.kind})\n${n.body.slice(0, 900)}`).join("\n\n").slice(0, 4500);
  // Morgenrapportens datagrunnlag har egne avsnitt for bookinger og kunnskap; de hentes ferskt over, så de kuttes her
  const snapText = snap ? snap.snapshot.replace(/\n## (Bookinger|Bakgrunn fra kunnskapsbanken)[\s\S]*?(?=\n## |$)/g, "") : "";
  const context = [
    noteText ? `Fra kunnskapsbanken (bakgrunn lest tidligere, ikke dagens tall):\n${noteText}` : "",
    books.length ? `\nBookinger og anslått inntjening (grovt anslag fra kvartalsrapportene, resten av dagene antatt til samme rate):\n${books.join("\n")}` : "",
    snap ? `\nDatagrunnlag fra ${snap.day}:\n${snapText}` : "Ingen morgenrapport ennå.",
    "\nSiste kurser:\n" + quotes.map((q) => `- ${q.name} (${q.symbol}): ${q.price} (${q.change_pct === null ? "–" : q.change_pct.toFixed(2)} % i dag)`).join("\n"),
    repText ? `\nSiste kvartalsrapporter (lest av KI):\n${repText}` : "",
    "\nNyheter siste 3 dager:\n" + news.map((n) => `- ${n.title} (${n.source}): ${(n.s ?? "").trim()}`).join("\n"),
  ].join("\n").slice(0, 17000);

  const system =
    "Du er analytiker i en privat shippingterminal. Svar på norsk bokmål, kort og konkret, ut fra dataene du får. " +
    "Hvis dataene ikke dekker spørsmålet, si det tydelig i stedet for å gjette. Ikke finn på tall. " +
    "Gi aldri kjøps- eller salgsråd, kursmål eller personlige investeringsråd, og ikke gjengi analytikeres anbefalinger. " +
    "Du kan forklare sammenhenger, hva tallene betyr og hva som kan påvirke dem. " +
    "Bruk kunnskapsbanken til å forklare begreper og mønstre, og si fra når noe bygger på den. Bookinganslagene er grove; si det når du bruker dem.";

  for (const model of await models(key)) {
    const payload: Record<string, unknown> = {
      model, temperature: 0.3, max_completion_tokens: 1800,
      messages: [{ role: "system", content: system }, { role: "user", content: `${context}\n\nSPØRSMÅL: ${question}` }],
    };
    if (model.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!r.ok) continue;
    const js = await r.json();
    const text = String(js.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (text) return NextResponse.json({ answer: text, model, basis: snap?.day ?? null, notes: notes.map((n) => n.title) });
  }
  // Reserve: Mistral (hvis MISTRAL_API_KEY er lagt inn i Vercel), når Groq er tom for kvote eller ikke svarer
  const mkey = (process.env.MISTRAL_API_KEY ?? "").trim();
  if (mkey) {
    for (const model of ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"]) {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${mkey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0.3, max_tokens: 1800, messages: [{ role: "system", content: system }, { role: "user", content: `${context}\n\nSPØRSMÅL: ${question}` }] }),
      });
      if (!r.ok) continue;
      const js = await r.json();
      const text = String(js.choices?.[0]?.message?.content ?? "").trim();
      if (text) return NextResponse.json({ answer: text, model: `mistral/${model}`, basis: snap?.day ?? null, notes: notes.map((n) => n.title) });
    }
  }
  return NextResponse.json({ error: "Fikk ikke svar fra KI-leverandørene. Prøv igjen om litt." }, { status: 502 });
}
