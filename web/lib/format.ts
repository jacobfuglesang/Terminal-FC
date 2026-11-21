const nb = (d: number) => new Intl.NumberFormat("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? "–" : nb(d).format(v));

export const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : `${v >= 0 ? "▲" : "▼"} ${nb(2).format(Math.abs(v))} %`;

export const up = (v: number | null | undefined) => (v ?? 0) >= 0;

export function osloTime(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "–";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    ...(withDate ? { day: "2-digit", month: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function compact(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  if (v >= 1e6) return `${nb(2).format(v / 1e6)} mill`;
  if (v >= 1e3) return `${nb(0).format(v / 1e3)} k`;
  return nb(0).format(v);
}
