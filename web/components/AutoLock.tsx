"use client";

import { useEffect } from "react";

// Logger ut automatisk etter en periode uten aktivitet, og når du kommer tilbake til en fane som har vært skjult lenge.
export default function AutoLock({ idleMinutes }: { idleMinutes: number }) {
  useEffect(() => {
    const limit = idleMinutes * 60_000;
    let last = Date.now();
    let hiddenAt: number | null = null;
    let done = false;
    const lock = async () => {
      if (done) return;
      done = true;
      try {
        await fetch("/api/logout", { method: "POST" });
      } finally {
        window.location.href = "/login";
      }
    };
    const touch = () => { last = Date.now(); };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > limit) lock();
      else { hiddenAt = null; touch(); }
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => { if (Date.now() - last > limit) lock(); }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [idleMinutes]);
  return null;
}
