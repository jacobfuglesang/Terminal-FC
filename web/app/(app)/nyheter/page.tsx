import NewsList from "@/components/NewsList";
import { getBlockedCount, getNews } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Nyheter() {
  const [news, blocked] = await Promise.all([getNews(300), getBlockedCount()]);
  return (
    <section className="panel" aria-labelledby="h-nyheter">
      <div className="ph">
        <h2 id="h-nyheter">Nyheter</h2>
        <span className="src">
          iLaks, regjeringen.no og Google News (DN, E24 m.fl.) · {blocked} saker med anbefalinger eller kursmål filtrert bort siste 30 dager
        </span>
      </div>
      <NewsList items={news} />
    </section>
  );
}
