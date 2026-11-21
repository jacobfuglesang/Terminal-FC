"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { findPage } from "@/lib/menu";

export type TickerItem = { label: string; price: string; change: string; up: boolean | null };

export default function TopBar({ ticker }: { ticker: TickerItem[] }) {
  const path = usePathname();
  const router = useRouter();
  const page = findPage(path);
  const [now, setNow] = useState("");

  useEffect(() => {
    const f = () =>
      setNow(
        new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date()),
      );
    f();
    const clock = setInterval(f, 30_000);
    // Hent ferske tall fra serveren hvert minutt
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [router]);

  return (
    <header className="top">
      <div className="topbar">
        <div>
          <h1>{page.label}</h1>
          <div className="sub">{page.sub}</div>
        </div>
        <span className="m" style={{ fontSize: 12 }}>{now}</span>
      </div>
      <div className="ticker">
        <div className="m">
          {ticker.length === 0 ? <span style={{ color: "#8A919C" }}>Venter på første kurshenting …</span> : null}
          {ticker.map((t) => (
            <span key={t.label}>
              <span style={{ color: "#A0A7B2" }}>{t.label}</span> {t.price}{" "}
              <span className={t.up === null ? "" : t.up ? "upc" : "downc"}>{t.change}</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}
