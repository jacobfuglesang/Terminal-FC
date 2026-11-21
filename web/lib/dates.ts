// Onsdagen i en ISO-uke (SSB publiserer onsdager)
export function weekDate(year: number, week: number, weekday = 2): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400_000 + (week - 1) * 7 * 86400_000);
  return new Date(monday.getTime() + weekday * 86400_000).toISOString();
}

export const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("nb-NO", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
