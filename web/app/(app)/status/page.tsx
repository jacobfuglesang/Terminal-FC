import { getStatus } from "@/lib/db";
import { osloTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PLAN = [
  { k: "Yahoo Finance", d: "Kurser for 5 aksjer, EUR/NOK og USD/NOK", w: "Hvert 15. min i børstiden", f: 1 },
  { k: "SSB", d: "Laksepris og eksportmengde (tabell 03024)", w: "Onsdag 08:30 + daglig sjekk", f: 1 },
  { k: "Fish Pool / Sitagri", d: "SISALMON-indeks (krever abonnement, terminkurven brukes i stedet)", w: "Tirsdag", f: 9 },
  { k: "Euronext", d: "Terminkurve for laks", w: "Daglig", f: 1 },
  { k: "Fiskeridirektoratet", d: "Biomasse", w: "Månedlig", f: 1 },
  { k: "BarentsWatch", d: "Lus og sykdom (krever gratis nøkkel)", w: "Daglig sjekk", f: 1 },
  { k: "Finanstilsynet", d: "Shortposisjoner", w: "Daglig", f: 1 },
  { k: "IMF via FRED", d: "Fôrråvareindeks", w: "Månedlig", f: 1 },
  { k: "RSS + KI", d: "Nyheter fra iLaks, regjeringen.no og Google News. KI-sammendrag hvis Groq-nøkkel er lagt inn", w: "Hvert 15. min i børstiden, ellers hver time", f: 1 },
  { k: "Selskapenes IR-sider", d: "Rapporter, kalender, konsensus", w: "Ved rapporter", f: 4 },
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
