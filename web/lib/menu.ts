import { COMPANIES as UNIVERSE } from "@/lib/universe";

export type MenuItem = { href: string; label: string; icon: string; phase?: number; sub: string };

export const COMPANIES = UNIVERSE;

export const MARKET: MenuItem[] = [
  { href: "/", label: "Oversikt", sub: "Frakt, trafikk, rederier og varsler på én side", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/frakt", label: "Fraktrater", sub: "Tank, tørrbulk og container, daglig og ukentlig", icon: "M3 17l5-5 4 3 7-8M14 7h5v5" },
  { href: "/trafikk", label: "Trafikk og kart", sub: "Skip gjennom sundene og posisjoner i nøkkelområder", icon: "M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13" },
  { href: "/ravarer", label: "Råvarer og makro", sub: "Olje, gass, jernmalm, metaller, korn og valuta", icon: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  { href: "/selskaper", label: "Alle rederier", sub: "Sammenlign kurs, avkastning, utbytte og short", icon: "M4 6h16M4 12h16M4 18h16" },
  { href: "/sammenlign", label: "Sammenlign", sub: "Aksjer mot fraktrater, indeksert", icon: "M4 19h16M5 15l4-5 4 3 6-7" },
  { href: "/nyheter", label: "Nyheter", sub: "Shipping, geopolitikk og børsmeldinger", icon: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" },
  { href: "/kalender", label: "Kalender", sub: "Rapporter, utbytte og faste datautgivelser", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
];

export const TOOLS: MenuItem[] = [
  { href: "/analytiker", label: "Analytiker", sub: "Daglig KI-rapport og spørsmål om dataene", icon: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" },
  { href: "/varsler", label: "Varsler", sub: "Det som har skjedd som er verdt å se på", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" },
  { href: "/notater", label: "Notater", sub: "Dine notater, sortert i mapper", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
  { href: "/status", label: "Systemstatus", sub: "Datakilder og siste henting", icon: "M3 12h4l3-7 4 14 3-7h4" },
];

export const COMPANY_ICON = "M3 17h18l-2 4H5zM6 17V9h12v8M9 9V5h6v4";

export function findPage(pathname: string): { label: string; sub: string } {
  const all = [...MARKET, ...TOOLS];
  const hit = all.find((m) => m.href === pathname);
  if (hit) return hit;
  if (pathname.startsWith("/nyheter/")) return { label: "Nyheter", sub: "Hele saken" };
  if (pathname.startsWith("/melding/")) return { label: "Børsmelding", sub: "Fra Oslo Børs Newsweb" };
  const co = COMPANIES.find((c) => pathname === `/selskap/${c.id}`);
  if (co) return { label: co.name, sub: `${co.segment} · kurs, frakt, utbytte, forventninger og nyheter` };
  return { label: "FUGLESANG", sub: "" };
}
