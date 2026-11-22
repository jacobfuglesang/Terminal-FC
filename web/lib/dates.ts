// Onsdagen i en ISO-uke (SSB publiserer onsdager)
export function weekDate(year: number, week: number, weekday = 2): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400_000 + (week - 1) * 7 * 86400_000);
  return new Date(monday.getTime() + weekday * 86400_000).toISOString();
}

export const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("nb-NO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

// Siste uke der de fleste anleggene har rapportert lus. Inneværende uke fylles på utover uken
// (rapportene kommer frem til tirsdagen etter), så den regnes som foreløpig.
export function completeWeekIndex(rows: { reported: number }[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const prev = rows.slice(Math.max(0, i - 8), i).map((r) => r.reported);
    const ref = prev.length ? Math.max(...prev) : rows[i].reported;
    if (rows[i].reported >= 0.75 * ref) return i;
  }
  return rows.length - 1;
}
