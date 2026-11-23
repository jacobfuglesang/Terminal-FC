import { THEMES } from "@/lib/themes";
import { COMPANIES as UNIVERSE } from "@/lib/universe";

export type MenuItem = { href: string; label: string; icon: string; phase?: number; sub: string };

export const COMPANIES = UNIVERSE;

export const MARKET: MenuItem[] = [
  { href: "/", label: "Oversikt", sub: "Frakt, trafikk, rederier og varsler på én side", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/morgenrapport", label: "Morgenrapport", sub: "Dagens KI-rapport, kan leses høyt, med arkiv", icon: "M12 4v2M5.6 6.6l1.4 1.4M4 13h2M18 13h2M17 8l1.4-1.4M7 17a5 5 0 0 1 10 0M3 20h18" },
  { href: "/frakt", label: "Fraktrater", sub: "Tank, tørrbulk og container, daglig og ukentlig", icon: "M3 17l5-5 4 3 7-8M14 7h5v5" },
  { href: "/trafikk", label: "Trafikk og kart", sub: "Skip gjennom sundene og posisjoner i nøkkelområder", icon: "M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3zM9 4v13M15 7v13" },
  { href: "/vaer", label: "Vær og sesong", sub: "Stormer, Panamakanalen og typiske sesongmønstre", icon: "M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" },
  { href: "/bunkers", label: "Bunkers og arbitrasje", sub: "Drivstoffpriser, scrubberspread, raffinerings- og gassmarginer", icon: "M6 3h8v18H6zM14 8h3l2 3v8a2 2 0 0 1-4 0v-5h-1M9 7h2" },
  { href: "/ravarer", label: "Råvarer og makro", sub: "Olje, gass, jernmalm, metaller, korn og valuta", icon: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  { href: "/selskaper", label: "Alle rederier", sub: "Sammenlign kurs, avkastning, utbytte og short", icon: "M4 6h16M4 12h16M4 18h16" },
  { href: "/sammenlign", label: "Sammenlign", sub: "Aksjer mot fraktrater, indeksert", icon: "M4 19h16M5 15l4-5 4 3 6-7" },
  { href: "/nyheter", label: "Nyheter", sub: "Shipping, geopolitikk og børsmeldinger", icon: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" },
  { href: "/kalender", label: "Kalender", sub: "Rapporter, utbytte og faste datautgivelser", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
];

// Samfunnssituasjon: det lesejobben finner ut om verden, økonomien og analyse, pluss ukens rapport
export const SOCIETY: MenuItem[] = [
  { href: "/samfunn", label: "Oversikt", sub: "Ukens samfunnsrapport, indikatorer og nyheter om verden", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  ...THEMES.map((t) => ({ href: `/samfunn/${t.id}`, label: t.label, sub: t.sub, icon: t.icon })),
];

export const TOOLS: MenuItem[] = [
  { href: "/portefolje", label: "Portefølje", sub: "Dine posisjoner, gevinst/tap, eksponering og stresstest", icon: "M4 7h16v12H4zM9 7V5h6v2M4 12h16" },
  { href: "/rapporter", label: "Kvartalsrapporter", sub: "Rapportene lest av KI: booking, dagrater, dødpunkt og utsikter", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6M10 8h2" },
  { href: "/bookinger", label: "Bookinger og inntjening", sub: "Hvor mye av neste kvartal som er booket, og anslått overskudd per aksje", icon: "M4 5h16v15H4zM4 10h16M9 5v15M13 14h4M13 17h2" },
  { href: "/meglerrapporter", label: "Meglerrapporter", sub: "Ukentlige markedsrapporter fra meglerhus, lest av KI", icon: "M4 5h16v14H4zM8 9h8M8 13h8M8 17h5" },
  { href: "/kunnskap", label: "Kunnskapsbank", sub: "Det KI-en har lest om shipping og aksjemarkedet, med kilder", icon: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7M8 11h7" },
  { href: "/analytiker", label: "Analytiker", sub: "Spør KI om dataene, rapportene og nyhetene", icon: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" },
  { href: "/varsler", label: "Varsler", sub: "Det som har skjedd som er verdt å se på", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4" },
  { href: "/notater", label: "Notater", sub: "Dine notater, sortert i mapper", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
  { href: "/status", label: "Systemstatus", sub: "Datakilder og siste henting", icon: "M3 12h4l3-7 4 14 3-7h4" },
];

export const COMPANY_ICON = "M3 17h18l-2 4H5zM6 17V9h12v8M9 9V5h6v4";

export function findPage(pathname: string): { label: string; sub: string } {
  const all = [...MARKET, ...SOCIETY, ...TOOLS];
  const soc = SOCIETY.find((m) => m.href === pathname);
  if (soc) return { label: soc.href === "/samfunn" ? "Samfunnssituasjon" : `Samfunnssituasjon · ${soc.label}`, sub: soc.sub };
  const hit = all.find((m) => m.href === pathname);
  if (hit) return hit;
  if (pathname.startsWith("/nyheter/")) return { label: "Nyheter", sub: "Hele saken" };
  if (pathname.startsWith("/melding/")) return { label: "Børsmelding", sub: "Fra Oslo Børs Newsweb" };
  const co = COMPANIES.find((c) => pathname === `/selskap/${c.id}`);
  if (co) return { label: co.name, sub: `${co.segment} · kurs, frakt, utbytte, forventninger og nyheter` };
  return { label: "TERMINAL FC", sub: "" };
}
