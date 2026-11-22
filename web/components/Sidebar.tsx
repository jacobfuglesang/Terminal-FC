"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPANIES, COMPANY_ICON, MARKET, TOOLS } from "@/lib/menu";
import { SEGMENTS } from "@/lib/universe";

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
          <path d="M3 17h18l-2 4H5zM6 17V9h12v8M9 9V5h6v4M12 2v3" />
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
          <div className="navtitle">Rederier</div>
          {SEGMENTS.map((seg) => {
            const list = COMPANIES.filter((c) => c.segment === seg);
            if (!list.length) return null;
            return (
              <div key={seg}>
                <div style={{ fontSize: 10, color: "#6E7581", padding: "6px 10px 2px", letterSpacing: ".04em" }}>{seg}</div>
                {list.map((c) => {
                  const href = `/selskap/${c.id}`;
                  const ch = changes[c.symbol];
                  return (
                    <Link key={c.id} href={href} className={`navlink${path === href ? " on" : ""}`} aria-current={path === href ? "page" : undefined} style={{ minHeight: 32, paddingTop: 4, paddingBottom: 4 }}>
                      <Icon d={COMPANY_ICON} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span className={`badge m ${ch === null || ch === undefined ? "" : ch >= 0 ? "upc" : "downc"}`}>
                        {ch === null || ch === undefined ? "" : `${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(1).replace(".", ",")}`}
                      </span>
                    </Link>
                  );
                })}
              </div>
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
