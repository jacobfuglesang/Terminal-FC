"use client";

import { useEffect, useRef, useState } from "react";

// Leser en tekst høyt med nettleserens innebygde talesyntese (gratis, ingen data sendes til oss).
// Teksten deles i setninger, fordi enkelte nettlesere stopper midt i lange avsnitt.
function plain(md: string): string[] {
  const text = md
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^#{1,4}\s+(.*)$/, "$1.").replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, ""))
    .join(" ")
    .replace(/\*\*/g, "")
    .replace(/\s+%/g, " prosent")
    .replace(/\bUSD\b/g, "dollar")
    .replace(/\bNOK\b/g, "kroner")
    .replace(/(\d)\s(\d{3})/g, "$1$2");
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

export default function ReadAloud({ text, label = "Les høyt" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState(1);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supported, setSupported] = useState(true);
  const [noNorwegian, setNoNorwegian] = useState(false);
  const queue = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      if (!vs.length) return;
      const no = vs.find((v) => /^(nb|no|nn)(-|_|$)/i.test(v.lang)) ?? null;
      setVoice(no);
      setNoNorwegian(!no);
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speakNext = () => {
    const s = queue.current.shift();
    if (!s) {
      setState("idle");
      return;
    }
    const u = new SpeechSynthesisUtterance(s);
    u.lang = voice?.lang ?? "nb-NO";
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = speakNext;
    u.onerror = () => setState("idle");
    window.speechSynthesis.speak(u);
  };

  const start = () => {
    window.speechSynthesis.cancel();
    queue.current = plain(text);
    setState("playing");
    speakNext();
  };

  if (!supported) return <span className="src">Nettleseren din kan ikke lese opp tekst.</span>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {state === "idle" && <button className="btn" onClick={start} aria-label="Les rapporten høyt">▶ {label}</button>}
      {state === "playing" && <button className="btn" onClick={() => { window.speechSynthesis.pause(); setState("paused"); }}>⏸ Pause</button>}
      {state === "paused" && <button className="btn" onClick={() => { window.speechSynthesis.resume(); setState("playing"); }}>▶ Fortsett</button>}
      {state !== "idle" && <button className="btn" onClick={() => { queue.current = []; window.speechSynthesis.cancel(); setState("idle"); }}>⏹ Stopp</button>}
      <label className="src" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Fart
        <select value={rate} onChange={(e) => setRate(Number(e.target.value))} disabled={state !== "idle"}
          style={{ background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line2)", borderRadius: 6, padding: "2px 4px" }}>
          {[0.9, 1, 1.15, 1.3].map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
      </label>
      {noNorwegian && <span className="src">Fant ingen norsk stemme i nettleseren, så den bruker standardstemmen.</span>}
    </div>
  );
}
