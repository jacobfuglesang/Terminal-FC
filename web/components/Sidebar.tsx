"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPANIES, COMPANY_ICON, MARKET, TOOLS } from "@/lib/menu";

type Change = Record<string, number | null>;

function Icon({ d }: { d: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function Sidebar({ changes }: { changes: Change }) {
  const path = usePathname();

  async function lock() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="side">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FF8A5B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12c3-5 9-6 13-3l4-3v12l-4-3c-4 3-10 2-13-3z" />
        </svg>
        FUGLESANG
      </div>
      <nav aria-label="Hovedmeny" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="navgroup">
          <div className="navtitle">Marked</div>
          {MARKET.map((m) => (
            <Link key={m.href} href={m.href} className={`navlink${path === m.href ? " on" : ""}`} aria-current={path === m.href ? "page" : undefined}>
              <Icon d={m.icon} />
              {m.label}
              {m.phase ? <span className="badge" style={{ color: "#8A919C" }}>fase {m.phase}</span> : null}
            </Link>
          ))}
        </div>
        <div className="navgroup">
          <div className="navtitle">Selskaper</div>
          {COMPANIES.map((c) => {
            const href = `/selskap/${c.id}`;
            const ch = changes[c.symbol];
            return (
              <Link key={c.id} href={href} className={`navlink${path === href ? " on" : ""}`} aria-current={path === href ? "page" : undefined}>
                <Icon d={COMPANY_ICON} />
                {c.name}
                <span className={`badge m ${ch === null || ch === undefined ? "" : ch >= 0 ? "upc" : "downc"}`}>
                  {ch === null || ch === undefined ? "" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(1).replace(".", ",")}`}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="navgroup">
          <div className="navtitle">Verktøy</div>
          {TOOLS.map((m) => (
            <Link key={m.href} href={m.href} className={`navlink${path === m.href ? " on" : ""}`} aria-current={path === m.href ? "page" : undefined}>
              <Icon d={m.icon} />
              {m.label}
              {m.phase ? <span className="badge" style={{ color: "#8A919C" }}>fase {m.phase}</span> : null}
            </Link>
          ))}
        </div>
      </nav>
      <div className="sidefoot">
        <span>Kurser 15 min forsinket</span>
        <button type="button" className="btn" onClick={lock} style={{ alignSelf: "flex-start" }}>
          Lås
        </button>
      </div>
    </aside>
  );
}
