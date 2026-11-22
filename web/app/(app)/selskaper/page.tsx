import ScreenerTable from "@/components/ScreenerTable";
import { screenRows } from "@/lib/screen";

export const dynamic = "force-dynamic";

export default async function Selskaper() {
  const rows = await screenRows();
  return (
    <section className="panel" aria-labelledby="h-alle">
      <div className="ph">
        <h2 id="h-alle">Alle rederier</h2>
        <span className="src">Trykk på en kolonne for å sortere · Yahoo Finance, Finanstilsynet</span>
      </div>
      <ScreenerTable rows={rows} />
      <p className="note">
        Utbytte 12 m = utbetalt utbytte siste 12 måneder delt på dagens kurs. «Siste ×» = siste utbytte gjort om til et helt år, som viser
        hvor utbyttet er på vei nå, men shippingutbytter svinger mye med ratene. Estimat 30 d = hvor mye analytikernes resultatestimat for i år
        er justert siste måned. Short = offentlige shortposisjoner over 0,5 %. Tallene er hjelp til å sammenligne, ikke anbefalinger.
      </p>
    </section>
  );
}
