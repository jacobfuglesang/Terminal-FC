"use client";

import { useState } from "react";

const EXAMPLES = [
  "Hvorfor har tankaksjene beveget seg slik den siste uken?",
  "Hva betyr trafikken gjennom Hormuz for Frontline og Okeanis?",
  "Hvilke rapporter kommer de neste to ukene, og hva venter analytikerne?",
  "Forklar forskjellen på BWET og Baltic Dry Index.",
];

type QA = { q: string; a: string; model?: string; notes?: string[] };

export default function AskBox() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [log, setLog] = useState<QA[]>([]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const js = await r.json();
      if (!r.ok) throw new Error(js.error || `Feil ${r.status}`);
      setLog((l) => [{ q: question, a: js.answer, model: js.model, notes: js.notes }, ...l]);
      setQ("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spør om frakt, trafikk, rederiene eller nyhetene …" aria-label="Spørsmål til analytikeren"
          style={{ flex: "1 1 320px", background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "9px 12px", fontSize: 14 }} />
        <button type="submit" className="btn" disabled={busy}>{busy ? "Tenker …" : "Spør"}</button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {EXAMPLES.map((e) => <button key={e} type="button" className="btn" style={{ fontSize: 12 }} onClick={() => { setQ(e); void ask(e); }} disabled={busy}>{e}</button>)}
      </div>
      {err && <p className="note" style={{ color: "#FF6B6B" }}>{err}</p>}
      <div aria-live="polite">
        {log.map((x, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--line2)", marginTop: 12, paddingTop: 12 }}>
            <div className="src" style={{ marginBottom: 4 }}>Du spurte: {x.q}</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#D5D9DF" }}>{x.a}</div>
            {x.model && <div className="src" style={{ marginTop: 4 }}>Svar fra {x.model}. Kan inneholde feil; sjekk tallene i terminalen.</div>}
            {x.notes && x.notes.length > 0 && <div className="src" style={{ marginTop: 2 }}>Brukte fra kunnskapsbanken: {x.notes.join(" · ")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
