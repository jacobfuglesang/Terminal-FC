"use client";

import { useEffect, useRef, useState } from "react";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [lockLeft, setLockLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Sjekk om sperren er aktiv når siden åpnes
  useEffect(() => {
    fetch("/api/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLockLeft(Number(d.lockedFor) || 0))
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
        window.location.href = "/";
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

  const mm = Math.floor(lockLeft / 60);
  const ss = String(lockLeft % 60).padStart(2, "0");

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
        <div className="who">FUGLESANG</div>
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
            maxLength={4}
            placeholder="Kode"
            value={pin}
            disabled={lockLeft > 0 || busy}
            autoFocus
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(v);
              setMsg("");
              if (v.length === 4) submit(v);
            }}
          />
        </div>
        <div className="msg" role="alert">
          {lockLeft > 0 ? (
            <>
              For mange feil forsøk.
              <br />
              Prøv igjen om <b className="m">{mm}:{ss}</b>
            </>
          ) : (
            msg
          )}
        </div>
      </form>
    </div>
  );
}
