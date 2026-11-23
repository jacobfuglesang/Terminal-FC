"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BookingInput } from "@/lib/bookings";
import { cmpQuarter, estimate, quarterDays, quarterElapsed, quarterOf, type SegResult } from "@/lib/earnings";

export type SegData = {
  segment: string; share: number; rate: number; note: string; ok: boolean;
  vessels: { count: number | null; days: number | null; ok: boolean };
  breakeven: { rate: number; ok: boolean; segment: string } | null;
  tce: { rate: number; period: string } | null;
  proxy: "BWET" | "BDRY" | null;
};
export type CoData = {
  symbol: string; name: string; segment: string; id: string;
  shares: number | null; price: number | null; currency: string | null;
  eps: { date: string; est: number | null } | null;
  report: { key: string; period: string; published: string; byRule: boolean; reading: boolean } | null;
  bookPeriod: string | null;
  segs: SegData[];
  dividend: { perShare: number; unit: string } | null;
};
type Series = { d: string[]; v: number[] };
type Mode = "booket" | "forrige" | "futures";
type Draft = Record<string, { vessels: string; rest_rate: string; breakeven: string; util: string }>;

const MODES: { id: Mode; label: string; help: string }[] = [
  { id: "booket", label: "Samme som booket", help: "Resten av dagene går til samme rate som de som er booket." },
  { id: "forrige", label: "Som forrige kvartal", help: "Resten går til raten selskapet oppnådde i kvartalet rapporten gjelder." },
  { id: "futures", label: "Følg fraktfutures", help: "Booket rate justert med endringen i BWET (tank) eller BDRY (tørrbulk) siden rapporten kom. Andre skipstyper står uendret." },
];

const nf = (v: number, d = 0) => v.toLocaleString("nb-NO", { maximumFractionDigits: d, minimumFractionDigits: d });
const usd = (v: number | null) => (v === null ? "–" : `${nf(v)}`);
const musd = (v: number | null) => (v === null ? "–" : `${v >= 0 ? "" : "−"}${nf(Math.abs(v) / 1e6, 1)}`);
const pct = (v: number | null, d = 0) => (v === null || !Number.isFinite(v) ? "–" : `${nf(v * 100, d)} %`);
const col = (v: number | null) => (v === null ? undefined : v > 0 ? "#3DDC97" : v < 0 ? "#FF6B6B" : undefined);
const input = { background: "var(--inset)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 6px", width: 92 } as const;
const num = (s: string) => {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const x = Number(t);
  return Number.isFinite(x) ? x : NaN;
};

/** Endring i en markedsserie fra dagen rapporten kom til siste kurs. */
function changeSince(s: Series | undefined, day: string): number | null {
  if (!s || s.v.length < 2) return null;
  let i = -1;
  for (let k = 0; k < s.d.length; k++) if (s.d[k] <= day) i = k;
  if (i < 0) return null;
  const a = s.v[i], b = s.v[s.v.length - 1];
  return a > 0 ? b / a - 1 : null;
}

export default function BookingApp({ cos, inputs, usdnok, proxies }: {
  cos: CoData[]; inputs: BookingInput[]; usdnok: number | null; proxies: Record<"BWET" | "BDRY", Series>;
}) {
  const [mode, setMode] = useState<Mode>("booket");
  const [adj, setAdj] = useState(0);
  const [util, setUtil] = useState(97);
  const [saved, setSaved] = useState<BookingInput[]>(inputs);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const now = new Date();
  const curQ = quarterOf(now);
  const ov = (sym: string, seg: string) => saved.find((x) => x.symbol === sym && x.segment === seg);

  const results = useMemo(() => cos.map((c) => {
    const segs: (SegResult & { src: SegData; rateNote: string; proxyChg: number | null; own: BookingInput | undefined })[] = [];
    if (!c.report || !c.bookPeriod) return { c, segs, sum: null, perShare: null, perShareNok: null, ofPrice: null, booked: null };
    const qd = quarterDays(c.bookPeriod);
    for (const s of c.segs) {
      const own = ov(c.symbol, s.segment);
      const proxyChg = s.proxy ? changeSince(proxies[s.proxy], c.report.published.slice(0, 10)) : null;
      let base = s.rate, rateNote = "som booket";
      if (mode === "forrige" && s.tce) { base = s.tce.rate; rateNote = `oppnådd ${s.tce.period}`; }
      if (mode === "futures" && proxyChg !== null) { base = s.rate * (1 + proxyChg); rateNote = `${s.proxy} ${proxyChg >= 0 ? "+" : ""}${nf(proxyChg * 100, 0)} %`; }
      let rest = base * (1 + adj / 100);
      if (adj) rateNote += ` ${adj > 0 ? "+" : ""}${adj} %`;
      if (own?.rest_rate != null) { rest = own.rest_rate; rateNote = "din rate"; }
      const r = estimate({
        segment: s.segment, share: s.share, bookedRate: s.rate,
        vessels: own?.vessels ?? s.vessels.count,
        days: own?.vessels != null ? null : s.vessels.days,
        restRate: rest,
        breakeven: own?.breakeven ?? s.breakeven?.rate ?? null,
        util: own?.util ?? util / 100,
      }, qd);
      segs.push({ ...r, src: s, rateNote, proxyChg, own });
    }
    const all = segs.every((s) => s.surplus !== null) && segs.length > 0;
    const sum = all ? segs.reduce((a, s) => a + (s.surplus ?? 0), 0) : null;
    const perShare = sum !== null && c.shares ? sum / c.shares : null;
    const perShareNok = perShare !== null && usdnok ? perShare * usdnok : null;
    const ofPrice = perShareNok !== null && c.price ? perShareNok / c.price : null;
    const days = segs.reduce((a, s) => a + (s.totalDays ?? 0), 0);
    const booked = segs.length ? (days > 0 && segs.every((s) => s.totalDays !== null)
      ? segs.reduce((a, s) => a + (s.bookedDays ?? 0), 0) / days
      : segs.reduce((a, s) => a + s.share, 0) / segs.length) : null;
    return { c, segs, sum, perShare, perShareNok, ofPrice, booked };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cos, saved, mode, adj, util, usdnok, proxies]);

  const withData = results.filter((r) => r.segs.length > 0).sort((a, b) => (b.ofPrice ?? -9) - (a.ofPrice ?? -9));
  const without = results.filter((r) => r.segs.length === 0);

  const draftOf = (sym: string, seg: string, own: BookingInput | undefined) =>
    drafts[sym]?.[seg] ?? {
      vessels: own?.vessels != null ? String(own.vessels) : "",
      rest_rate: own?.rest_rate != null ? String(own.rest_rate) : "",
      breakeven: own?.breakeven != null ? String(own.breakeven) : "",
      util: own?.util != null ? String(Math.round(own.util * 100)) : "",
    };
  const setDraft = (sym: string, seg: string, own: BookingInput | undefined, k: keyof Draft[string], v: string) =>
    setDrafts((d) => ({ ...d, [sym]: { ...(d[sym] ?? {}), [seg]: { ...draftOf(sym, seg, own), [k]: v } } }));

  async function save(c: CoData) {
    const rows = [];
    for (const s of c.segs) {
      const dft = draftOf(c.symbol, s.segment, ov(c.symbol, s.segment));
      const v = num(dft.vessels), r = num(dft.rest_rate), b = num(dft.breakeven), u = num(dft.util);
      if ([v, r, b, u].some((x) => Number.isNaN(x))) { setMsg((m) => ({ ...m, [c.symbol]: `Sjekk tallene for ${s.segment}: bare tall er lov.` })); return; }
      rows.push({ segment: s.segment, vessels: v, rest_rate: r, breakeven: b, util: u === null ? null : u / 100 });
    }
    setBusy(c.symbol);
    try {
      const res = await fetch("/api/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: c.symbol, rows }) });
      const j = await res.json();
      if (!res.ok) { setMsg((m) => ({ ...m, [c.symbol]: j.error ?? "Kunne ikke lagre" })); return; }
      setSaved(j);
      setDrafts((d) => { const x = { ...d }; delete x[c.symbol]; return x; });
      setMsg((m) => ({ ...m, [c.symbol]: "Lagret" }));
    } catch {
      setMsg((m) => ({ ...m, [c.symbol]: "Fikk ikke kontakt. Prøv igjen." }));
    } finally {
      setBusy(null);
    }
  }

  async function reset(c: CoData) {
    setBusy(c.symbol);
    try {
      const res = await fetch(`/api/bookings?symbol=${encodeURIComponent(c.symbol)}`, { method: "DELETE" });
      const j = await res.json();
      if (res.ok) { setSaved(j); setDrafts((d) => { const x = { ...d }; delete x[c.symbol]; return x; }); setMsg((m) => ({ ...m, [c.symbol]: "Tilbake til tallene fra rapporten" })); }
      else setMsg((m) => ({ ...m, [c.symbol]: j.error ?? "Kunne ikke nullstille" }));
    } finally {
      setBusy(null);
    }
  }

  const status = (p: string) => {
    const d = cmpQuarter(p, curQ);
    if (d < 0) return { t: "utdatert", c: "#F5C451", help: "Kvartalet er over. Venter på neste rapport." };
    if (d === 0) return { t: `${pct(quarterElapsed(p, now))} gått`, c: undefined, help: "Kvartalet vi er i nå" };
    return { t: "neste kvartal", c: undefined, help: "" };
  };

  return (
    <>
      <section className="panel" aria-labelledby="h-book">
        <div className="ph"><h2 id="h-book">Bookinger og anslått inntjening</h2><span className="src">Fra kvartalsrapportene, lest av KI · beløp i USD</span></div>
        <p className="note" style={{ marginTop: 0 }}>
          Mange rederier skriver hvor stor del av dagene i neste kvartal som allerede er booket, og til hvilken rate. Tabellen samler
          dette og regner ut et grovt anslag: <b>booket del × booket rate + resten × antatt rate − dødpunkt</b>, ganget med antall skipsdager.
          Svaret er kontantoverskudd over dødpunkt (omtrent det som kan gå til utbytte og nedbetaling), ikke regnskapsresultat.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span className="src">Rate for dagene som ikke er booket:</span>
          {MODES.map((m) => (
            <button key={m.id} type="button" className="chip" title={m.help} onClick={() => setMode(m.id)}
              style={mode === m.id ? { borderColor: "#FF8A5B", color: "#FF8A5B" } : undefined}>{m.label}</button>
          ))}
        </div>
        <div className="src" style={{ marginBottom: 8 }}>{MODES.find((m) => m.id === mode)?.help}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <label className="src" style={{ display: "flex", gap: 8, alignItems: "center" }}>Juster resten
            <input type="range" min={-50} max={50} step={5} value={adj} onChange={(e) => setAdj(Number(e.target.value))} aria-label="Juster raten for dagene som ikke er booket" />
            <span className="m" style={{ minWidth: 48 }}>{adj > 0 ? "+" : ""}{adj} %</span>
          </label>
          <label className="src" style={{ display: "flex", gap: 8, alignItems: "center" }}>Utnyttelse
            <input type="number" min={50} max={100} value={util} onChange={(e) => setUtil(Math.min(100, Math.max(50, Number(e.target.value) || 97)))} style={{ ...input, width: 64 }} aria-label="Utnyttelse i prosent" />
            <span title="Andel av kalenderdagene skipene tjener penger. Resten er verksted, posisjonering og ventetid.">% av dagene ⓘ</span>
          </label>
          {usdnok && <span className="src">USD/NOK {nf(usdnok, 2)}</span>}
        </div>
      </section>

      <section className="panel" aria-labelledby="h-sum">
        <div className="ph"><h2 id="h-sum">Oversikt</h2><span className="src">Sortert etter anslag i prosent av aksjekursen</span></div>
        {withData.length === 0 ? (
          <div className="empty">Ingen bookingtall ennå. De kommer når rapportleseren har lest kvartalsrapportene.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Selskap</th><th>Kvartal</th><th title="Andel av dagene som er booket">Booket</th>
                  <th title="Snittrate for hele kvartalet med antakelsen din (USD/dag)">Snittrate</th>
                  <th title="Kontantoverskudd over dødpunkt for kvartalet, millioner USD">Overskudd (MUSD)</th>
                  <th>Per aksje</th><th title="Anslag per aksje i kroner delt på aksjekursen">Av kurs</th><th>Siste utbytte</th>
                </tr>
              </thead>
              <tbody>
                {withData.map(({ c, segs, sum, perShare, perShareNok, ofPrice, booked }) => {
                  const st = status(c.bookPeriod!);
                  const days = segs.reduce((a, s) => a + (s.totalDays ?? 0), 0);
                  const blended = days > 0 && segs.every((s) => s.totalDays) ? segs.reduce((a, s) => a + s.blended * (s.totalDays ?? 0), 0) / days
                    : segs.length === 1 ? segs[0].blended : null;
                  return (
                    <tr key={c.symbol}>
                      <td><a href={`#b-${c.id}`} style={{ color: "inherit" }}>{c.name}</a></td>
                      <td className="m">{c.bookPeriod} <span className="src" style={{ color: st.c }} title={st.help}>· {st.t}</span></td>
                      <td className="m">{pct(booked)}</td>
                      <td className="m">{blended !== null ? usd(blended) : "–"}</td>
                      <td className="m" style={{ color: col(sum) }}>{sum !== null ? musd(sum) : <span className="src">mangler tall</span>}</td>
                      <td className="m">{perShare !== null ? `${nf(perShare, 2)} USD${perShareNok !== null ? ` · ${nf(perShareNok, 1)} kr` : ""}` : "–"}</td>
                      <td className="m" style={{ color: col(ofPrice) }}>{pct(ofPrice, 1)}</td>
                      <td className="m">{c.dividend ? `${nf(c.dividend.perShare, 2)} ${c.dividend.unit}` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          «Mangler tall» betyr at antall skip eller dødpunkt ikke stod i rapporten. Fyll dem inn under selskapet, så regnes resten ut.
          Overskudd per kvartal sammenlignet med siste utbytte gir en pekepinn på om utbyttet kan gå opp eller ned, men selskapene holder ofte igjen penger.
        </p>
      </section>

      {withData.map(({ c, segs, sum, perShare, perShareNok }) => {
        const r = c.report!;
        return (
          <section key={c.symbol} id={`b-${c.id}`} className="panel" aria-labelledby={`h-${c.id}`}>
            <div className="ph" style={{ flexWrap: "wrap", gap: 8 }}>
              <h2 id={`h-${c.id}`}>{c.name} · {c.bookPeriod}</h2>
              <span className="src">
                Fra rapporten for {r.period} ({r.published.slice(0, 10)}){r.reading ? " · leses på nytt nå" : ""}{r.byRule ? " · bookingtall lest med faste regler" : ""} ·{" "}
                <Link href={`/rapporter?selskap=${c.id}`} style={{ color: "#FF8A5B" }}>se rapporten</Link>
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Skipstype</th><th>Booket</th><th>Booket rate</th><th>Skip</th><th>Dager</th>
                    <th>Rate resten</th><th>Dødpunkt</th><th title="Utnyttelse i prosent for denne skipstypen (tomt = felles verdi)">Utn. %</th><th>Overskudd (MUSD)</th>
                  </tr>
                </thead>
                <tbody>
                  {segs.map((s) => {
                    const dft = draftOf(c.symbol, s.segment, s.own);
                    return (
                      <tr key={s.segment}>
                        <td>{s.segment}{s.src.note ? <span className="src"> · {s.src.note}</span> : null}</td>
                        <td className="m">{pct(s.share)}{s.src.ok ? " ✓" : <span title="Tallet ble ikke funnet sammen i rapporten. Sjekk kilden." style={{ color: "#F5C451" }}> ?</span>}</td>
                        <td className="m">{usd(s.bookedRate)}</td>
                        <td>
                          <input inputMode="numeric" value={dft.vessels} placeholder={s.src.vessels.count != null ? String(s.src.vessels.count) : "antall"}
                            onChange={(e) => setDraft(c.symbol, s.segment, s.own, "vessels", e.target.value)} style={{ ...input, width: 70 }}
                            aria-label={`Antall skip ${s.segment}`} title={s.src.vessels.count != null ? `Fra rapporten: ${s.src.vessels.count}${s.src.vessels.ok ? "" : " (ikke bekreftet)"}` : "Ikke oppgitt i rapporten"} />
                        </td>
                        <td className="m">{s.totalDays !== null ? nf(s.totalDays) : "–"}</td>
                        <td>
                          <input inputMode="numeric" value={dft.rest_rate} placeholder={nf(Math.round(s.restRate))}
                            onChange={(e) => setDraft(c.symbol, s.segment, s.own, "rest_rate", e.target.value)} style={input} aria-label={`Rate resten ${s.segment}`} />
                          <div className="src">{s.rateNote}</div>
                        </td>
                        <td>
                          <input inputMode="numeric" value={dft.breakeven} placeholder={s.src.breakeven ? nf(s.src.breakeven.rate) : "USD/dag"}
                            onChange={(e) => setDraft(c.symbol, s.segment, s.own, "breakeven", e.target.value)} style={input} aria-label={`Dødpunkt ${s.segment}`}
                            title={s.src.breakeven ? `Fra rapporten (${s.src.breakeven.segment || "flåten"})${s.src.breakeven.ok ? "" : ", ikke bekreftet"}` : "Ikke oppgitt i rapporten"} />
                        </td>
                        <td>
                          <input inputMode="numeric" value={dft.util} placeholder={String(Math.round(s.util * 100))}
                            onChange={(e) => setDraft(c.symbol, s.segment, s.own, "util", e.target.value)} style={{ ...input, width: 54 }} aria-label={`Utnyttelse ${s.segment}`} />
                        </td>
                        <td className="m" style={{ color: col(s.surplus) }}>{s.surplus !== null ? musd(s.surplus) : <span className="src">{s.totalDays === null ? "trenger skip" : "trenger dødpunkt"}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" className="btn" disabled={busy === c.symbol} onClick={() => void save(c)}>Lagre mine tall</button>
              {segs.some((s) => s.own) && <button type="button" className="btn" disabled={busy === c.symbol} onClick={() => void reset(c)}>Tilbake til rapporten</button>}
              {msg[c.symbol] && <span className="src">{msg[c.symbol]}</span>}
            </div>
            <div className="src" style={{ marginTop: 8 }}>
              Sum: {sum !== null ? `${musd(sum)} MUSD` : "–"}
              {perShare !== null ? ` · ${nf(perShare, 2)} USD per aksje${perShareNok !== null ? ` (${nf(perShareNok, 1)} kr)` : ""}` : ""}
              {c.shares ? ` · ${nf(c.shares / 1e6, 1)} mill. aksjer` : " · antall aksjer mangler"}
              {c.eps?.est != null ? ` · analytikersnitt for regnskapsresultat per aksje neste rapport (${c.eps.date}): ${nf(c.eps.est, 2)}${c.currency ? ` ${c.currency}` : ""}. Det er resultat etter avskrivninger, så det blir ofte lavere enn kontantoverskuddet.` : ""}
            </div>
          </section>
        );
      })}

      {without.length > 0 && (
        <section className="panel" aria-labelledby="h-uten">
          <div className="ph"><h2 id="h-uten">Uten bookingtall</h2><span className="src">{without.length} selskaper</span></div>
          <table className="tbl"><tbody>
            {without.map(({ c }) => (
              <tr key={c.symbol}>
                <td>{c.name}</td>
                <td className="src">
                  {!c.report ? "Ingen rapport lest ennå."
                    : `Rapporten for ${c.report.period} oppgir ikke booket andel og rate for neste kvartal. ${["Container", "Bilskip", "Maritime tjenester", "Kjemikalietank"].includes(c.segment) ? "Vanlig for selskaper med lange kontrakter." : ""}`}
                </td>
              </tr>
            ))}
          </tbody></table>
        </section>
      )}

      <section className="panel" aria-labelledby="h-obs">
        <div className="ph"><h2 id="h-obs">Viktig å vite</h2></div>
        <ul className="note" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Anslaget er grovt. Booket andel gjelder ofte bare spotdagene, og dødpunktet kan være regnet på ulike måter hos ulike selskaper.</li>
          <li>Tall merket ? ble ikke bekreftet i rapporten. Sjekk kilden før du stoler på dem.</li>
          <li>Antall skip leses fra nye rapporter. Mangler det, kan du skrive det inn selv. Dine tall lagres og brukes til du trykker «Tilbake til rapporten».</li>
          <li>«Følg fraktfutures» er en snarvei: BWET følger VLCC-futures og BDRY tørrbulkfutures, ikke den nøyaktige raten selskapet får.</li>
          <li>Dette er ikke investeringsråd.</li>
        </ul>
      </section>
    </>
  );
}
