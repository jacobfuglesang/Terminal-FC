import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
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
  const context = [
    snap ? `Datagrunnlag fra ${snap.day}:\n${snap.snapshot}` : "Ingen morgenrapport ennå.",
    "\nSiste kurser:\n" + quotes.map((q) => `- ${q.name} (${q.symbol}): ${q.price} (${q.change_pct === null ? "–" : q.change_pct.toFixed(2)} % i dag)`).join("\n"),
    "\nNyheter siste 3 dager:\n" + news.map((n) => `- ${n.title} (${n.source}): ${(n.s ?? "").trim()}`).join("\n"),
  ].join("\n").slice(0, 16000);

  const system =
    "Du er analytiker i en privat shippingterminal. Svar på norsk bokmål, kort og konkret, ut fra dataene du får. " +
    "Hvis dataene ikke dekker spørsmålet, si det tydelig i stedet for å gjette. Ikke finn på tall. " +
    "Gi aldri kjøps- eller salgsråd, kursmål eller personlige investeringsråd, og ikke gjengi analytikeres anbefalinger. " +
    "Du kan forklare sammenhenger, hva tallene betyr og hva som kan påvirke dem.";

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
    if (text) return NextResponse.json({ answer: text, model, basis: snap?.day ?? null });
  }
  return NextResponse.json({ error: "Fikk ikke svar fra Groq. Prøv igjen om litt." }, { status: 502 });
}
