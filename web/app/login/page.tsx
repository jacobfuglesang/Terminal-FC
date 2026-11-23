"use client";

import { useEffect, useRef, useState } from "react";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [lockLeft, setLockLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [len, setLen] = useState(6);
  const input = useRef<HTMLInputElement>(null);

  // Sjekk om sperren er aktiv når siden åpnes
  useEffect(() => {
    fetch("/api/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setLockLeft(Number(d.lockedFor) || 0);
        if (Number(d.length) > 0) setLen(Number(d.length));
      })
      .catch(() => {});
  }, []);

  // Nedtelling
  useEffect(() => {
    if (lockLeft <= 0) {
      input.current?.focus();
      return;
    }
    const t = setTimeout(() => setLockLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [lockLeft]);

  async function submit(code: string) {
    if (busy || lockLeft > 0 || code.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // Tilbake til siden du var på (bare interne adresser)
        const next = new URLSearchParams(window.location.search).get("neste") ?? "/";
        window.location.href = /^\/(?!\/)[\w\-/æøåÆØÅ%.]*$/.test(next) ? next : "/";
        return;
      }
      setPin("");
      if (r.status === 429) {
        setLockLeft(Number(d.lockedFor) || 300);
        setMsg("");
      } else if (r.status === 401) {
        const n = Number(d.triesLeft);
        setMsg(`Feil kode. ${n} ${n === 1 ? "forsøk" : "forsøk"} igjen før sperre.`);
      } else {
        setMsg(d.error || "Noe gikk galt. Prøv igjen.");
      }
    } catch {
      setMsg("Fikk ikke kontakt med serveren.");
    } finally {
      setBusy(false);
    }
  }

  const hh = Math.floor(lockLeft / 3600);
  const mm = Math.floor((lockLeft % 3600) / 60);
  const ss = String(lockLeft % 60).padStart(2, "0");
  const left = hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;

  return (
    <div className="login">
      <img className="bg" src="/bakgrunn.jpg" alt="" aria-hidden="true" />
      <div className="shade" aria-hidden="true" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(pin);
        }}
      >
        <div className="avatar">
          <img src="/aksjer.png" alt="Aksjekurser" />
        </div>
        <div className="who">TERMINAL FC</div>
        <div className="pinbox">
          <label htmlFor="pin" className="sr">
            Kode
          </label>
          <input
            ref={input}
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={len}
            placeholder="Kode"
            value={pin}
            disabled={lockLeft > 0 || busy}
            autoFocus
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, len);
              setPin(v);
              setMsg("");
              if (v.length === len) submit(v);
            }}
          />
        </div>
        <div className="msg" role="alert">
          {lockLeft > 0 ? (
            <>
              For mange feil forsøk.
              <br />
              Prøv igjen om <b className="m">{left}</b>
            </>
          ) : (
            msg
          )}
        </div>
      </form>
    </div>
  );
}
