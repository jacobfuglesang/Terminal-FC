"use client";

import { useMemo, useState } from "react";
import { type FactorFit, type Series, type TradeIn, fitStock, positions, stressed } from "@/lib/pfmath";

export type Co = { symbol: string; name: string; segment: string; id: string };
export type Q = { price: number; change_pct: number | null };

export const FACTORS: { sym: string; label: string; short: string }[] = [
  { sym: "BWET", label: "Tankfrakt (BWET, VLCC-futures)", short: "Tankfrakt" },
  { sym: "BDRY", label: "Tørrbulkfrakt (BDRY, futures)", short: "Tørrbulk" },
  { sym: "BZ=F", label: "Brent", short: "Brent" },
  { sym: "NOK=X", label: "USD/NOK (opp = svakere krone)", short: "USD/NOK" },
  { sym: "OSEBX.OL", label: "Oslo Børs (OSEBX)", short: "OSEBX" },
  { sym: "TIO=F", label: "Jernmalm", short: "Jernmalm" },
  { sym: "TTF=F", label: "Gass Europa (TTF)", short: "Gass TTF" },
];

// Ferdige scenarier (prosent). Bare utgangspunkt: du kan justere alle tallene selv.
const PRESETS: { name: string; shocks: Record<string, number> }[] = [
  { name: "Hormuz stenges", shocks: { "BZ=F": 25, BWET: 40, "OSEBX.OL": -5, "NOK=X": 3 } },
  { name: "Global resesjon", shocks: { "BZ=F": -25, BWET: -20, BDRY: -30, "OSEBX.OL": -15, "TIO=F": -20, "NOK=X": 8 } },
  { name: "Tankrally", shocks: { BWET: 30 } },
  { name: "Tørrbulkfall", shocks: { BDRY: -25, "TIO=F": -15 } },
  { name: "Sterk krone", shocks: { "NOK=X": -8 } },
  { name: "Børsfall", shocks: { "OSEBX.OL": -10 } },
];

const kr = (v: number, d = 0) => v.toLocaleString("nb-NO", { maximumFractionDigits: d, minimumFractionDigits: d });
const pc = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("nb-NO", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
const col = (v: number | null) => (v === null ? undefined : v > 0 ? "#3DDC97" : v < 0 ? "#FF6B6B" : undefined);
const input = { background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "7px 10px" } as const;

function daysSince(day: string | null) {
  if (!day) return null;
  return Math.max(0, Math.round((Date.now() - new Date(`${day}T12:00:00Z`).getTime()) / 864e5));
}

export default function PortfolioApp({ initial, quotes, series, companies }: {
  initial: TradeIn[]; quotes: Record<string, Q>; series: Record<string, Series>; companies: Co[];
}) {
  const [trades, setTrades] = useState<TradeIn[]>(initial);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ day: new Date().toISOString().slice(0, 10), symbol: companies[0]?.symbol ?? "", side: "kjøp", qty: "", price: "", fee: "0", note: "" });
  const [del, setDel] = useState<number | null>(null);
  const [sel, setSel] = useState<string[]>(["BWET", "BDRY", "BZ=F", "OSEBX.OL"]);
  const [shock, setShock] = useState<Record<string, number>>({ BWET: -20, BDRY: 0, "BZ=F": 0, "NOK=X": 0, "OSEBX.OL": 0, "TIO=F": 0, "TTF=F": 0 });
  const [freq, setFreq] = useState<"uke" | "dag">("uke");
  const [win, setWin] = useState<"6m" | "1y" | "2y">("1y");

  const name = (s: string) => companies.find((c) => c.symbol === s)?.name ?? s;
  const pos = useMemo(() => positions(trades), [trades]);
  const open = Object.values(pos).filter((p) => p.qty > 0);
  const rows = open.map((p) => {
    const q = quotes[p.symbol];
    const price = q?.price ?? p.avg;
    const value = price * p.qty;
    const unreal = value - p.cost;
    const day = q?.change_pct != null ? value - value / (1 + q.change_pct / 100) : 0;
    return { ...p, price, value, unreal, unrealPct: p.cost > 0 ? unreal / p.cost : null, day, days: daysSince(p.since) };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const unreal = rows.reduce((s, r) => s + r.unreal, 0);
  const dayChg = rows.reduce((s, r) => s + r.day, 0);
  const realized = Object.values(pos).reduce((s, p) => s + p.realized, 0);
  const realizedYear = Object.values(pos).reduce((s, p) => s + p.realizedYear, 0);

  const bySeg: Record<string, number> = {};
  for (const r of rows) {
    const seg = companies.find((c) => c.symbol === r.symbol)?.segment ?? "Annet";
    bySeg[seg] = (bySeg[seg] ?? 0) + r.value;
  }

  // Faktorbetaer for alle selskaper med valgte faktorer, frekvens og periode
  const from = useMemo(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - (win === "6m" ? 6 : win === "1y" ? 12 : 24));
    return d.toISOString().slice(0, 10);
  }, [win]);
  const chosen = FACTORS.filter((f) => sel.includes(f.sym) && series[f.sym]);
  const fits = useMemo(() => {
    const out: Record<string, FactorFit> = {};
    for (const c of companies) {
      const s = series[c.symbol];
      out[c.symbol] = s ? fitStock(s, chosen.map((f) => series[f.sym]), freq, from) : null;
    }
    return out;
  }, [companies, series, chosen.map((f) => f.sym).join(","), freq, from]); // eslint-disable-line react-hooks/exhaustive-deps
  const shocks = chosen.map((f) => (shock[f.sym] ?? 0) / 100);
  const effect = (sym: string) => stressed(fits[sym], shocks);
  const stressRows = rows.map((r) => ({ ...r, est: effect(r.symbol) })).map((r) => ({ ...r, kr: r.est === null ? null : r.est * r.value }));
  const stressTotal = stressRows.reduce((s, r) => s + (r.kr ?? 0), 0);

  // Følsomhet: kroner per 1 % bevegelse i hver faktor (porteføljevektet beta)
  const sens = chosen.map((f, i) => ({ f, kr: rows.reduce((s, r) => s + (fits[r.symbol]?.beta[i] ?? 0) * r.value * 0.01, 0) }));

  async function addTrade(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, qty: Number(form.qty.replace(",", ".")), price: Number(form.price.replace(",", ".")), fee: Number(form.fee.replace(",", ".") || 0) }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) return void (window.location.href = "/login?neste=/portefolje");
    if (!r.ok) return setErr(d.error || "Kunne ikke lagre handelen");
    setTrades((t) => [...t, d as TradeIn]);
    setForm((f) => ({ ...f, qty: "", price: "", note: "" }));
  }

  async function removeTrade(id: number) {
    const r = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    if (r.ok) setTrades((t) => t.filter((x) => x.id !== id));
    setDel(null);
  }

  function preset(p: (typeof PRESETS)[number]) {
    setSel(FACTORS.filter((f) => f.sym in p.shocks).map((f) => f.sym));
    setShock(Object.fromEntries(FACTORS.map((f) => [f.sym, p.shocks[f.sym] ?? 0])));
  }

  const kpi = (l: string, v: string, c?: string) => (
    <div className="kpi" style={{ minWidth: 150 }}><div className="l">{l}</div><div className="v m" style={{ color: c }}>{v}</div></div>
  );

  return (
    <>
      <section className="panel" aria-labelledby="h-pf">
        <div className="ph"><h2 id="h-pf">Portefølje</h2><span className="src">Kurser fra Yahoo, oppdatert hvert 15. minutt i børstiden. Ikke investeringsråd.</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {kpi("Markedsverdi", `${kr(total)} kr`)}
          {kpi("I dag", `${dayChg >= 0 ? "+" : ""}${kr(dayChg)} kr`, col(dayChg))}
          {kpi("Urealisert gevinst/tap", `${unreal >= 0 ? "+" : ""}${kr(unreal)} kr (${pc(cost > 0 ? unreal / cost : null)})`, col(unreal))}
          {kpi("Realisert i år", `${realizedYear >= 0 ? "+" : ""}${kr(realizedYear)} kr`, col(realizedYear))}
          {kpi("Realisert totalt", `${realized >= 0 ? "+" : ""}${kr(realized)} kr`, col(realized))}
        </div>
        {rows.length === 0 ? (
          <div className="empty">Ingen åpne posisjoner. Registrer et kjøp nederst på siden.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Selskap</th><th>Antall</th><th>Snittkost</th><th>Kurs nå</th><th>Verdi</th><th>Andel</th><th>I dag</th><th>Gevinst/tap</th><th>Dager eid</th></tr></thead>
              <tbody>
                {rows.sort((a, b) => b.value - a.value).map((r) => (
                  <tr key={r.symbol}>
                    <td>{name(r.symbol)}</td>
                    <td className="m">{kr(r.qty)}</td>
                    <td className="m">{kr(r.avg, 2)}</td>
                    <td className="m">{kr(r.price, 2)}</td>
                    <td className="m">{kr(r.value)}</td>
                    <td className="m">{total > 0 ? `${kr((r.value / total) * 100, 1)} %` : "–"}</td>
                    <td className="m" style={{ color: col(r.day) }}>{r.day >= 0 ? "+" : ""}{kr(r.day)}</td>
                    <td className="m" style={{ color: col(r.unreal) }}>{r.unreal >= 0 ? "+" : ""}{kr(r.unreal)} ({pc(r.unrealPct)})</td>
                    <td className="m">{r.days ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-eks">
        <div className="ph"><h2 id="h-eks">Eksponering</h2><span className="src">Fordeling på segment og følsomhet for faktorene du har valgt i stresstesten</span></div>
        {rows.length === 0 ? <div className="empty">Vises når du har åpne posisjoner.</div> : (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 280px" }}>
              <div className="src" style={{ marginBottom: 6 }}>Segment</div>
              {Object.entries(bySeg).sort((a, b) => b[1] - a[1]).map(([seg, v]) => (
                <div key={seg} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>{seg}</span><span className="m">{kr((v / total) * 100, 1)} %</span></div>
                  <div style={{ height: 6, background: "var(--inset)", borderRadius: 3 }}><div style={{ width: `${(v / total) * 100}%`, height: 6, background: "#FF8A5B", borderRadius: 3 }} /></div>
                </div>
              ))}
            </div>
            <div style={{ flex: "1 1 320px" }}>
              <div className="src" style={{ marginBottom: 6 }}>Hvis faktoren stiger 1 % (alt annet likt)</div>
              <table className="tbl"><tbody>
                {sens.map(({ f, kr: v }) => (
                  <tr key={f.sym}><td>{f.label}</td><td className="m" style={{ textAlign: "right", color: col(v) }}>{v >= 0 ? "+" : ""}{kr(v)} kr</td></tr>
                ))}
              </tbody></table>
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-stress">
        <div className="ph"><h2 id="h-stress">Stresstest</h2><span className="src">Velg faktorer og hvor mye de beveger seg. Anslagene bygger på historiske sammenhenger.</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="src" style={{ alignSelf: "center" }}>Scenarier:</span>
          {PRESETS.map((p) => <button key={p.name} type="button" className="chip" onClick={() => preset(p)}>{p.name}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, marginBottom: 10 }}>
          {FACTORS.map((f) => {
            const on = sel.includes(f.sym);
            return (
              <div key={f.sym} style={{ border: "1px solid var(--line2)", borderRadius: 8, padding: 10, opacity: on ? 1 : 0.6 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={on} disabled={!series[f.sym]}
                    onChange={(e) => setSel((s) => (e.target.checked ? [...s, f.sym] : s.filter((x) => x !== f.sym)))} />
                  <span>{f.label}</span>
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                  <input type="range" min={-60} max={60} step={1} value={shock[f.sym] ?? 0} disabled={!on} aria-label={`Endring i ${f.short}`}
                    onChange={(e) => setShock((s) => ({ ...s, [f.sym]: Number(e.target.value) }))} style={{ flex: 1 }} />
                  <input type="number" value={shock[f.sym] ?? 0} disabled={!on} aria-label={`Endring i ${f.short} i prosent`}
                    onChange={(e) => setShock((s) => ({ ...s, [f.sym]: Number(e.target.value) }))} style={{ ...input, width: 64, padding: "4px 6px" }} />
                  <span className="src">%</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <label className="src">Beregnet fra
            <select value={freq} onChange={(e) => setFreq(e.target.value as "uke" | "dag")} style={{ ...input, marginLeft: 6 }}>
              <option value="uke">ukeavkastning (anbefalt)</option><option value="dag">dagsavkastning</option>
            </select>
          </label>
          <label className="src">Periode
            <select value={win} onChange={(e) => setWin(e.target.value as "6m" | "1y" | "2y")} style={{ ...input, marginLeft: 6 }}>
              <option value="6m">6 måneder</option><option value="1y">1 år</option><option value="2y">2 år</option>
            </select>
          </label>
        </div>

        {chosen.length === 0 ? <div className="empty">Velg minst én faktor.</div> : (
          <>
            {rows.length > 0 && (
              <div className="kpi" style={{ marginBottom: 10, maxWidth: 420 }}>
                <div className="l">Anslått effekt på porteføljen</div>
                <div className="v m" style={{ color: col(stressTotal) }}>{stressTotal >= 0 ? "+" : ""}{kr(stressTotal)} kr ({pc(total > 0 ? stressTotal / total : null)})</div>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Selskap</th>
                    {chosen.map((f) => <th key={f.sym} title={`Beta mot ${f.label}`}>β {f.short}</th>)}
                    <th title="Hvor mye av kursbevegelsene faktorene forklarer historisk">Forklart</th>
                    <th>Anslag</th>
                    <th>Din effekt</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c) => {
                    const fit = fits[c.symbol];
                    const est = effect(c.symbol);
                    const held = stressRows.find((r) => r.symbol === c.symbol);
                    return (
                      <tr key={c.symbol} style={held ? { background: "rgba(255,138,91,0.07)" } : undefined}>
                        <td>{c.name}{held ? " ●" : ""}</td>
                        {chosen.map((f, i) => <td key={f.sym} className="m">{fit ? fit.beta[i].toFixed(2).replace(".", ",") : "–"}</td>)}
                        <td className="m" style={{ color: fit && fit.r2 < 0.15 ? "#F5C451" : undefined }}>{fit ? `${Math.round(fit.r2 * 100)} %` : "–"}</td>
                        <td className="m" style={{ color: col(est) }}>{pc(est)}</td>
                        <td className="m" style={{ color: col(held?.kr ?? null) }}>{held?.kr != null ? `${held.kr >= 0 ? "+" : ""}${kr(held.kr)} kr` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note">
              Slik regnes det: for hvert selskap finner vi hvor mye aksjen historisk har beveget seg når faktorene beveget seg (beta, med
              flere faktorer samtidig), og ganger med endringene du har valgt. «Forklart» viser hvor mye av kursbevegelsene faktorene
              forklarer; under 15 % (gult) betyr at anslaget er svært usikkert. Kursene er ikke justert for utbytte, så store utbyttedager
              kan påvirke. Store sjokk gir ofte større utslag enn modellen viser. Dette er et grovt anslag, ikke investeringsråd.
            </p>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="h-trade">
        <div className="ph"><h2 id="h-trade">Registrer handel</h2><span className="src">Kurs og kurtasje i kroner. Snittkostmetoden brukes.</span></div>
        <form onSubmit={addTrade} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="src" style={{ display: "grid", gap: 4 }}>Dato<input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} style={input} required /></label>
          <label className="src" style={{ display: "grid", gap: 4 }}>Selskap
            <select value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value, price: quotes[e.target.value]?.price ? String(quotes[e.target.value].price) : form.price })} style={input}>
              {companies.map((c) => <option key={c.symbol} value={c.symbol}>{c.name}</option>)}
            </select>
          </label>
          <label className="src" style={{ display: "grid", gap: 4 }}>Type
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} style={input}><option value="kjøp">Kjøp</option><option value="salg">Salg</option></select>
          </label>
          <label className="src" style={{ display: "grid", gap: 4 }}>Antall<input inputMode="decimal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} style={{ ...input, width: 100 }} required /></label>
          <label className="src" style={{ display: "grid", gap: 4 }}>Kurs (kr)
            <input inputMode="decimal" value={form.price} placeholder={quotes[form.symbol]?.price ? String(quotes[form.symbol].price) : ""} onChange={(e) => setForm({ ...form, price: e.target.value })} style={{ ...input, width: 110 }} required />
          </label>
          <label className="src" style={{ display: "grid", gap: 4 }}>Kurtasje (kr)<input inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} style={{ ...input, width: 90 }} /></label>
          <label className="src" style={{ display: "grid", gap: 4, flex: "1 1 180px" }}>Notat (valgfritt)<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={input} maxLength={500} /></label>
          <button type="submit" className="btn">Lagre</button>
        </form>
        {err && <p className="note" style={{ color: "#FF6B6B" }}>{err}</p>}
      </section>

      <section className="panel" aria-labelledby="h-handler">
        <div className="ph"><h2 id="h-handler">Handler</h2><span className="src">{trades.length} registrert</span></div>
        {trades.length === 0 ? <div className="empty">Ingen handler ennå.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Dato</th><th>Selskap</th><th>Type</th><th>Antall</th><th>Kurs</th><th>Kurtasje</th><th>Beløp</th><th /></tr></thead>
              <tbody>
                {[...trades].sort((a, b) => (a.day < b.day ? 1 : -1)).map((t) => (
                  <tr key={t.id}>
                    <td className="m">{t.day}</td><td>{name(t.symbol)}</td><td>{t.side}</td><td className="m">{kr(t.qty)}</td>
                    <td className="m">{kr(t.price, 2)}</td><td className="m">{kr(t.fee)}</td><td className="m">{kr(t.qty * t.price)}</td>
                    <td>
                      {del === t.id ? (
                        <span style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="btn" onClick={() => setDel(null)}>Avbryt</button>
                          <button type="button" className="btn" style={{ color: "#FF6B6B", borderColor: "#FF6B6B" }} onClick={() => void removeTrade(t.id)}>Slett</button>
                        </span>
                      ) : <button type="button" className="btn" onClick={() => setDel(t.id)}>Slett</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
