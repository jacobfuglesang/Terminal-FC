export type MenuItem = { href: string; label: string; icon: string; phase?: number; sub: string };

export const COMPANIES = [
  { id: "mowi", name: "Mowi", symbol: "MOWI.OL", ticker: "MOWI" },
  { id: "salmar", name: "SalMar", symbol: "SALM.OL", ticker: "SALM" },
  { id: "bakkafrost", name: "Bakkafrost", symbol: "BAKKA.OL", ticker: "BAKKA" },
  { id: "leroy", name: "Lerøy", symbol: "LSG.OL", ticker: "LSG" },
  { id: "grieg", name: "Grieg Seafood", symbol: "GSF.OL", ticker: "GSF" },
];

export const MARKET: MenuItem[] = [
  { href: "/", label: "Oversikt", sub: "Dagens viktigste tall på én side", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/sammenlign", label: "Sammenlign", sub: "Kurser mot laksepris og fôr, indeksert", icon: "M4 19h16M5 15l4-5 4 3 6-7" },
  { href: "/laks", label: "Laks og fôr", sub: "Laksepris, eksport, fôrråvarer og terminkurve", icon: "M3 12c3-5 9-6 13-3l4-3v12l-4-3c-4 3-10 2-13-3z" },
  { href: "/biologi", label: "Biologi", sub: "Biomasse, lus, sykdom og trafikklys", icon: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  { href: "/marked", label: "Marked", sub: "Valuta, shortposisjoner og globalt tilbud", icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" },
  { href: "/nyheter", label: "Nyheter", sub: "Politikk, toll, marked, selskap og biologi", icon: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" },
  { href: "/kalender", label: "Kalender", phase: 4, sub: "Datautgivelser, trading updates og rapporter", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
];

export const TOOLS: MenuItem[] = [
  { href: "/notater", label: "Notater", phase: 4, sub: "Dine notater, sortert i mapper", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
  { href: "/status", label: "Systemstatus", sub: "Datakilder og siste henting", icon: "M3 12h4l3-7 4 14 3-7h4" },
];

export const COMPANY_ICON = "M4 20V10l8-6 8 6v10zM9 20v-6h6v6";

export function findPage(pathname: string): { label: string; sub: string } {
  const all = [...MARKET, ...TOOLS];
  const hit = all.find((m) => m.href === pathname);
  if (hit) return hit;
  const co = COMPANIES.find((c) => pathname === `/selskap/${c.id}`);
  if (co) return { label: co.name, sub: "Markedsposisjon, rapporter, planer, forventninger og nyheter" };
  return { label: "FUGLESANG", sub: "" };
}
