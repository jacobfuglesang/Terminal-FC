import TimeChart from "@/components/TimeChart";
import { getPanama, getStorms } from "@/lib/db";
import { fmt, osloTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const ALERT: Record<string, [string, string]> = { red: ["Rødt", "#FF6B6B"], orange: ["Oransje", "#FFA94D"], green: ["Grønt", "#3DDC97"] };

// Typiske sesongmønstre i shipping (generelle tendenser, ikke prognoser)
const SEASONS: { months: number[]; title: string; text: string; seg: string }[] = [
  { months: [12, 1, 2], title: "Vinter på den nordlige halvkule", seg: "Tank, gass", text: "Høyere etterspørsel etter olje, diesel, LPG og LNG til oppvarming. Tankmarkedet er ofte sterkest i fjerde kvartal og tidlig vinter." },
  { months: [1, 2], title: "Kinesisk nyttår", seg: "Tørrbulk, container", text: "Fabrikker og havner i Kina går saktere i et par uker. Tørrbulk og container er ofte svake i januar–februar." },
  { months: [12, 1, 2, 3], title: "Regntid i Brasil", seg: "Tørrbulk (Capesize)", text: "Regn reduserer jernmalmeksporten fra Brasil i første kvartal, som ofte gir svake Capesize-rater." },
  { months: [11, 12, 1, 2, 3, 4], title: "Syklonsesong i Australia", seg: "Tørrbulk", text: "Sykloner kan stenge Port Hedland og Dampier (jernmalm) og kullhavner i Queensland i flere dager." },
  { months: [1, 2, 3, 4, 5], title: "Tørketid i Panama", seg: "Gass, container, tørrbulk", text: "Vannstanden i Gatun-sjøen synker, som kan gi lavere maks dypgang og færre passeringer i Panamakanalen." },
  { months: [3, 4, 5, 6], title: "Soyaeksport fra Sør-Amerika", seg: "Tørrbulk (Panamax/Supramax)", text: "Brasil og Argentina eksporterer mye soya, ofte med lange seilaser til Kina." },
  { months: [3, 4, 5, 9, 10], title: "Vedlikehold på raffinerier", seg: "Produkttank", text: "Våren og høsten stenger mange raffinerier for vedlikehold, som kan dempe produktfrakten en periode." },
  { months: [6, 7, 8, 9, 10, 11], title: "Orkansesong i Atlanterhavet", seg: "Tank, gass", text: "Toppen er august–oktober. Stormer i Mexicogolfen kan stenge havner og raffinerier i USA og forsinke eksport av olje, LPG og LNG." },
  { months: [6, 7, 8, 9, 10, 11], title: "Tyfonsesong i Stillehavet", seg: "Container, tørrbulk", text: "Toppen er juli–oktober. Tyfoner kan stenge havner i Kina, Taiwan, Korea og Japan og gi kø etterpå." },
  { months: [8, 9, 10], title: "Høysesong for container", seg: "Container, bil", text: "Varer til jul og høytider sendes fra Asia. Containerratene er ofte høyest på sensommeren og høsten." },
  { months: [9, 10, 11, 12], title: "Korneksport fra USA", seg: "Tørrbulk (Panamax)", text: "Høsten er toppsesong for mais og soya fra Mexicogolfen og nordvest i USA." },
  { months: [12, 1, 2, 3], title: "Is i Østersjøen og Bohai", seg: "Tank, tørrbulk", text: "Isklassede skip trengs ved russiske havner i Finskebukta og i Nord-Kina. Kan gi forsinkelser og høyere rater for slike skip." },
];

export default async function Vaer() {
  const [storms, panama] = await Promise.all([getStorms(), getPanama(800)]);
  const now = Date.now();
  const active = storms.filter((s) => new Date(s.to).getTime() > now - 2 * 864e5);
  const recent = storms.filter((s) => !active.includes(s));
  const pan = panama.at(-1);
  const month = new Date().getUTCMonth() + 1;
  const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

  const stormRow = (s: (typeof storms)[number]) => {
    const [label, color] = ALERT[s.alert] ?? [s.alert || "–", "#A0A7B2"];
    return (
      <tr key={s.id}>
        <td>{s.name}</td>
        <td style={{ color }}>{label}</td>
        <td>{s.country || "Til havs"}</td>
        <td className="m">{fmt(s.lat, 1)}, {fmt(s.lon, 1)}</td>
        <td>{s.near ? `${s.near} (${fmt(s.nearKm, 0)} km)` : <span className="src">Langt fra hovedruter</span>}</td>
        <td className="m">{osloTime(s.from)} – {osloTime(s.to)}</td>
        <td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "#FF8A5B" }}>GDACS</a> : ""}</td>
      </tr>
    );
  };

  return (
    <>
      <section className="panel" aria-labelledby="h-storm">
        <div className="ph"><h2 id="h-storm">Tropiske stormer</h2><span className="src">GDACS (FN og EU) · orkaner, tyfoner og sykloner i alle hav</span></div>
        {active.length === 0 ? <div className="empty">Ingen aktive tropiske stormer akkurat nå.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr><th>Storm</th><th>Varsel</th><th>Område</th><th>Posisjon</th><th>Nærmeste viktige havn/sund</th><th>Periode</th><th /></tr></thead>
              <tbody>{active.map(stormRow)}</tbody>
            </table>
          </div>
        )}
        {recent.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary className="src" style={{ cursor: "pointer" }}>Stormer siste 30 dager ({recent.length})</summary>
            <div style={{ overflowX: "auto" }}><table className="tbl" style={{ minWidth: 760 }}><tbody>{recent.map(stormRow)}</tbody></table></div>
          </details>
        )}
        <p className="note">Varselnivået gjelder fare for mennesker på land, ikke direkte for skipsfarten. Stormer innen rundt 700 km fra viktige havner og sund
          kan stenge havner og gi kø i dagene etter. Du får varsel i terminalen ved oransje eller rødt nivå nær slike steder.</p>
      </section>

      <section className="panel" aria-labelledby="h-pan">
        <div className="ph"><h2 id="h-pan">Panamakanalen</h2><span className="src">Panamakanalmyndigheten (ACP) · {pan?.day ?? "venter på første henting"}</span></div>
        {!pan ? <div className="empty">Hentes ved neste kjøring.</div> : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div className="kpi"><div className="l">Vannstand Gatun-sjøen</div><div className="v m">{fmt(pan.gatun, 1)} fot</div></div>
              <div className="kpi"><div className="l">Maks dypgang Neopanamax</div><div className="v m">{fmt(pan.neo, 1)} fot</div></div>
              <div className="kpi"><div className="l">Maks dypgang Panamax</div><div className="v m">{fmt(pan.panamax, 1)} fot</div></div>
              <div className="kpi"><div className="l">Ferskvannstillegg</div><div className="v m">{pan.surcharge === null ? "–" : `${fmt(pan.surcharge, 2)} %`}</div></div>
            </div>
            {panama.length > 1 && <TimeChart daily={panama.map((p) => ({ t: `${p.day}T12:00:00Z`, v: p.gatun }))} periods={["1M", "3M", "6M", "1Å"]} initial="3M" decimals={1} color="#5BA8FF" />}
          </>
        )}
        <p className="note">Rundt 85 fot eller mer i Gatun-sjøen gir normalt full dypgang (50 fot for Neopanamax). Lav vannstand betyr mindre last per skip og
          færre passeringer, som gir lengre køer og omveier. Det merkes særlig for LPG fra USA til Asia (BW LPG), container og korn. Historikken bygges opp fra første henting.</p>
      </section>

      <section className="panel" aria-labelledby="h-sesong">
        <div className="ph"><h2 id="h-sesong">Sesongkalender</h2><span className="src">Typiske mønstre, ikke prognoser. Nå: {MONTHS[month - 1]}</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead><tr><th>Sesong</th><th>Segment</th>{MONTHS.map((m, i) => <th key={m} style={{ textAlign: "center", color: i + 1 === month ? "#FF8A5B" : undefined }}>{m}</th>)}</tr></thead>
            <tbody>
              {SEASONS.map((s) => {
                const on = s.months.includes(month);
                return (
                  <tr key={s.title} style={on ? { background: "rgba(255,138,91,0.07)" } : undefined}>
                    <td><b>{s.title}</b><div className="src" style={{ maxWidth: 360 }}>{s.text}</div></td>
                    <td className="src">{s.seg}</td>
                    {MONTHS.map((_, i) => (
                      <td key={i} style={{ textAlign: "center" }}>
                        {s.months.includes(i + 1) ? <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: i + 1 === month ? "#FF8A5B" : "#3A3F48" }} /> : null}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
