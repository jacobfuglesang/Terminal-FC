import { getStatus } from "@/lib/db";
import { osloTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PLAN = [
  { k: "Yahoo Finance", d: "Kurser for 15 rederier, fraktfutures (BWET, BDRY), råvarer og valuta", w: "Hver halvtime i børstiden", f: 1 },
  { k: "Oslo Børs Newsweb", d: "Børsmeldinger, rapporter, utbytte og innsidehandel", w: "Hver halvtime i børstiden", f: 1 },
  { k: "Nyheter + Groq", d: "Splash247, Hellenic, gCaptain, Maritime Executive, FreightWaves, TradeWinds, Lloyd's List, DN, E24", w: "Hver halvtime i børstiden", f: 1 },
  { k: "Drewry, SCFI, BDI, EIA", d: "Containerrater, tørrbulkindeks og USAs oljelagre", w: "Daglig", f: 1 },
  { k: "IMF PortWatch", d: "Skip gjennom ti viktige sund", w: "Daglig (data med noen dagers forsinkelse)", f: 1 },
  { k: "aisstream.io", d: "Skip i åtte nøkkelområder (krever gratis nøkkel)", w: "Daglig", f: 1 },
  { k: "Finanstilsynet", d: "Shortposisjoner", w: "Daglig", f: 1 },
  { k: "Yahoo Finance", d: "Konsensus, utbytte, rapportdatoer og kvartalstall", w: "Daglig", f: 1 },
  { k: "Groq", d: "Morgenrapport fra KI-analytikeren", w: "Hver morgen", f: 1 },
  { k: "Baltic Exchange, Clarksons", d: "Fullstendige rater for alle segmenter (betalt)", w: "–", f: 9 },
];

export default async function StatusPage() {
  const status = await getStatus();
  return (
    <>
      <section className="panel" aria-labelledby="h-siste">
        <div className="ph">
          <h2 id="h-siste">Siste hentinger</h2>
          <span className="src">Tider i norsk tid</span>
        </div>
        {status.length === 0 ? (
          <div className="empty">
            Ingen hentinger registrert ennå.
            <br />
            Kjør «Hent data» manuelt under Actions i GitHub-repoet for å fylle databasen første gang.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Kilde</th>
                  <th>Status</th>
                  <th>Sist kjørt</th>
                  <th>Sist OK</th>
                  <th style={{ textAlign: "left", paddingLeft: 16 }}>Melding</th>
                </tr>
              </thead>
              <tbody>
                {status.map((s) => (
                  <tr key={s.source}>
                    <td style={{ fontWeight: 600 }}>{s.source}</td>
                    <td>
                      <span className="tag" style={{ background: s.ok ? "#16301F" : "#3A1E1E", color: s.ok ? "#7BE3A6" : "#FFB4B4" }}>{s.ok ? "OK" : "Feil"}</span>
                    </td>
                    <td className="m">{osloTime(s.last_run)}</td>
                    <td className="m">{osloTime(s.last_ok)}</td>
                    <td style={{ textAlign: "left", paddingLeft: 16, color: "#A0A7B2" }}>{s.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="h-plan">
        <div className="ph">
          <h2 id="h-plan">Alle planlagte kilder</h2>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Kilde</th>
              <th style={{ textAlign: "left", paddingLeft: 16 }}>Data</th>
              <th style={{ textAlign: "left", paddingLeft: 16 }}>Når</th>
              <th>Fase</th>
            </tr>
          </thead>
          <tbody>
            {PLAN.map((p) => (
              <tr key={p.k}>
                <td style={{ fontWeight: 600 }}>{p.k}</td>
                <td style={{ textAlign: "left", paddingLeft: 16 }}>{p.d}</td>
                <td style={{ textAlign: "left", paddingLeft: 16, color: "#A0A7B2" }}>{p.w}</td>
                <td>
                  <span className="tag" style={{ background: p.f === 1 ? "#16301F" : "#1E2A3D", color: p.f === 1 ? "#7BE3A6" : "#9CC8FF" }}>{p.f === 1 ? "I drift" : p.f === 9 ? "Utsatt" : `Fase ${p.f}`}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
