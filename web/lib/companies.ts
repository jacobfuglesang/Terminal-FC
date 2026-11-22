// Kuraterte selskapsdata. Hentet fra selskapenes egne børsmeldinger og rapporter
// (via Inderes, Quartr, SeafoodSource, Salmon Business m.fl.), kontrollert 22.11.2026.
// Oppdateres ved hver kvartalsrapport. Ingen anbefalinger eller kursmål.

export type Source = { title: string; url: string };
export type Metric = { label: string; value: string; prev?: string };
export type CalEvent = { date: string; symbol: string; title: string; kind: "Rapport" | "Trading update" | "Generalforsamling" | "Årsrapport" | "Annet"; confirmed: boolean; note?: string; source?: Source };

export type CompanyInfo = {
  symbol: string;
  about: string;
  regions: string[];
  currency: string;
  facts: string[];
  guidance: { label: string; y2026: number | null; y2027: number | null; note?: string }[];
  guidanceNote: string;
  quarter: { label: string; published: string; metrics: Metric[]; comment: string };
  sources: Source[];
};

export const COMPANY_INFO: Record<string, CompanyInfo> = {
  "MOWI.OL": {
    symbol: "MOWI.OL",
    about: "Verdens største lakseoppdretter og ifølge selskapet nå verdens største sjømatselskap. Hele verdikjeden: fôr, oppdrett, slakting, videreforedling og salg.",
    regions: ["Norge", "Skottland", "Chile", "Canada", "Irland", "Færøyene", "Island"],
    currency: "EUR",
    facts: [
      "Kjøpte Nova Sea (Nord-Norge), konsolidert fra 4. kvartal 2025.",
      "Mål om 650 000 tonn organisk slaktevolum innen 2029.",
      "Netto rentebærende gjeld ca. 2 886 mill. euro ved utgangen av 3. kvartal 2026.",
    ],
    guidance: [
      { label: "Totalt", y2026: 620000, y2027: 630000, note: "2026 hevet med 20 000 tonn i november" },
      { label: "Norge", y2026: 395000, y2027: 405000 },
      { label: "Skottland", y2026: 74000, y2027: 76000 },
    ],
    guidanceNote: "Slaktevolum i tonn sløyd vekt. 2027 forutsetter normal tilvekst i sjøen.",
    quarter: {
      label: "3. kvartal 2026",
      published: "2026-11-04",
      metrics: [
        { label: "Slaktevolum", value: "185 641 t", prev: "ca. 166 000 t" },
        { label: "Omsetning", value: "1 732 mill. EUR", prev: "1 393 mill. EUR" },
        { label: "Operasjonelt EBIT", value: "274,5 mill. EUR", prev: "111,7 mill. EUR" },
        { label: "Op. EBIT per kg", value: "1,48 EUR", prev: "0,67 EUR" },
      ],
      comment: "Rekordhøyt slaktevolum og lavere kostnader. Selskapet venter at globalt tilbud faller 3 % i 4. kvartal og vokser 0–1 % i 2027.",
    },
    sources: [
      { title: "Quartr: Mowi Q3 2026 (sammendrag av rapport og presentasjon)", url: "https://quartr.com/events/mowi-mowi-q3-2026_33CxdEyK" },
      { title: "SeafoodSource: Mowi raises 2026 harvest guidance after record Q3", url: "https://www.seafoodsource.com/news/-world-s-largest-seafood-company-mowi-raises-2026-harvest-guidance-after-record-q3" },
      { title: "Salmon Business: Mowi Scotland Q3 2026", url: "https://www.salmonbusiness.com/mowi-scotland-early-harvesting-weighs-on-q3-earnings-as-nine-month-profit-rises/" },
      { title: "Mowi: Q3 2026 trading update (børsmelding)", url: "https://www.inderes.dk/en/releases/mowi-asa-osemowi-q3-2026-trading-update" },
    ],
  },
  "SALM.OL": {
    symbol: "SALM.OL",
    about: "Verdens nest største oppdretter av atlantisk laks. Hovedbase på Frøya i Midt-Norge, med drift også i Nord-Norge, til havs (SalMar Ocean), på Island og i Skottland.",
    regions: ["Midt-Norge", "Nord-Norge", "Havbruk til havs", "Island (Icelandic Salmon)", "Skottland (50 % av Scottish Sea Farms)"],
    currency: "NOK",
    facts: [
      "Har avtalt å kjøpe Måsøval. Oppkjøpet venter på godkjenning fra myndighetene og er ikke med i guidingen for 2027.",
      "Eier Scottish Sea Farms 50/50 sammen med Lerøy.",
    ],
    guidance: [
      { label: "Totalt", y2026: 347000, y2027: 348000, note: "2026 kuttet med 3 000 tonn (Island og Skottland)" },
      { label: "Norge og havbruk til havs", y2026: null, y2027: 307000 },
      { label: "Island", y2026: null, y2027: 18000 },
      { label: "Skottland (100 %)", y2026: null, y2027: 45000 },
    ],
    guidanceNote: "Slaktevolum i tonn sløyd vekt. Totalen inkluderer SalMars andel av Scottish Sea Farms.",
    quarter: {
      label: "3. kvartal 2026",
      published: "2026-11-03",
      metrics: [
        { label: "Slaktevolum", value: "105 100 t", prev: "93 200 t" },
        { label: "Omsetning", value: "8 660 mill. NOK" },
        { label: "Operasjonelt EBIT", value: "1 609 mill. NOK", prev: "711 mill. NOK" },
        { label: "Op. EBIT per kg", value: "15,30 NOK", prev: "7,60 NOK" },
      ],
      comment: "Rekordhøyt slaktevolum og god biologi. I 4. kvartal venter selskapet litt lavere kostnad og lavere slaktevolum i Norge enn i samme kvartal i fjor.",
    },
    sources: [
      { title: "SalMar: Record-high harvest volume and significant improvement in results (børsmelding 3.11.2026)", url: "https://www.inderes.dk/en/releases/salmar-record-high-harvest-volume-and-significant-improvement-in-results" },
      { title: "Quartr: SalMar Q3 2026", url: "https://quartr.com/events/salmar-salm-q3-2026_3eIszIh7" },
      { title: "Fish Farming Expert: Record harvest and strong profit improvement for SalMar", url: "https://www.fishfarmingexpert.com/atlantic-salmon-harvest-volume-masoval-acquisition/record-harvest-and-strong-profit-improvement-for-salmar/2205153" },
    ],
  },
  "BAKKA.OL": {
    symbol: "BAKKA.OL",
    about: "Færøysk oppdretter med hele verdikjeden, inkludert egen fôr- og fiskemelproduksjon (Havsbrún). Drift på Færøyene og i Skottland. Rapporterer i danske kroner.",
    regions: ["Færøyene", "Skottland"],
    currency: "DKK",
    facts: [
      "Har ingen anlegg i Norge. Derfor finnes det ikke lusetall for Bakkafrost i BarentsWatch.",
      "Skottland har gått med tap i flere kvartaler, mens Færøyene leverer sterke marginer.",
      "Planlegger å kontraktsfeste 15–25 % av forventet slaktevolum for 2027.",
    ],
    guidance: [
      { label: "Totalt", y2026: 117000, y2027: 125000 },
      { label: "Færøyene", y2026: 97000, y2027: 97000 },
      { label: "Skottland", y2026: 20000, y2027: 28000 },
    ],
    guidanceNote: "Slaktevolum i tonn sløyd vekt.",
    quarter: {
      label: "3. kvartal 2026",
      published: "2026-11-02",
      metrics: [
        { label: "Slaktevolum", value: "27 634 t", prev: "30 678 t" },
        { label: "Omsetning", value: "1 681 mill. DKK", prev: "omtrent uendret" },
        { label: "Operasjonelt EBIT", value: "128 mill. DKK", prev: "22 mill. DKK" },
      ],
      comment: "Sterkt på Færøyene, fortsatt svakt i Skottland (lave volumer, små fisk og ekstraordinær dødelighet). Venter 3 % lavere globalt tilbud i 4. kvartal.",
    },
    sources: [
      { title: "Quartr: Bakkafrost Q3 2026", url: "https://quartr.com/events/bakkafrost-bakka-q3-2026_3srvMEK6" },
      { title: "Salmon Business: Bakkafrost quarterly operating profit rises", url: "https://www.salmonbusiness.com/bakkafrost-quarterly-operating-profit-rises-to-e17m-as-scottish-losses-narrow/" },
      { title: "Fish Farming Expert: Bakkafrost profit improved in Q3", url: "https://www.fishfarmingexpert.com/bakkafrost-faroe-islands-financial-results/bakkafrost-profit-improved-in-q3-as-scotland-losses-lessened/2204501" },
    ],
  },
  "LSG.OL": {
    symbol: "LSG.OL",
    about: "Sjømatkonsern fra Bergen med oppdrett av laks og ørret, hvitfiskfiske og stor salgs- og distribusjonsvirksomhet.",
    regions: ["Nord-Norge (Lerøy Aurora)", "Midt-Norge (Lerøy Midt)", "Vestlandet (Lerøy Sjøtroll)", "Skottland (50 % av Scottish Sea Farms)"],
    currency: "NOK",
    facts: [
      "Har avtalt å kjøpe 47,7 % av Sjøtroll Havbruk og eier da 98,4 % (eide 50,7 % fra før), ifølge iLaks.",
      "Eier Scottish Sea Farms 50/50 sammen med SalMar.",
      "Kostnadsprogram skal dempe effekten av høyere fôrpriser i 2027.",
    ],
    guidance: [
      { label: "Totalt inkl. andel Skottland", y2026: 215000, y2027: 217500 },
      { label: "Norge", y2026: 195000, y2027: 195000 },
    ],
    guidanceNote: "Slaktevolum i tonn sløyd vekt (omtrentlige tall fra selskapet).",
    quarter: {
      label: "3. kvartal 2026",
      published: "2026-11-10",
      metrics: [
        { label: "Operasjonelt EBIT", value: "459 mill. NOK", prev: "15 mill. NOK" },
      ],
      comment: "Kraftig resultatforbedring, god biologi og sterk kontantstrøm. Går inn i 4. kvartal med høy biomasse i sjøen.",
    },
    sources: [
      { title: "Lerøy: Third quarter 2026 results (børsmelding 10.11.2026)", url: "https://www.inderes.dk/en/releases/leroy-seafood-group-asa-third-quarter-2026-results" },
      { title: "iLaks: Lerøy kjøper 98,4 prosent av Sjøtroll Havbruk", url: "https://ilaks.no/leroy-kjoper-984-prosent-av-sjotroll-havbruk/" },
    ],
  },
  "GSF.OL": {
    symbol: "GSF.OL",
    about: "Lakseoppdretter fra Bergen som etter salget av virksomheten i Finnmark og Canada til Cermaq (desember 2025) bare har anlegg i Rogaland.",
    regions: ["Rogaland"],
    currency: "NOK",
    facts: [
      "Delte ut et ekstraordinært utbytte på 35,64 kr per aksje (ca. 4 mrd. kr) i april 2026.",
      "Rapporterer nå bare halvårlig, med utvidede trading updates etter 1. og 3. kvartal.",
      "Algeoppblomstring på ett anlegg i september 2026 ga økt dødelighet og tvunget slakting.",
      "Guidet produksjonskostnad for 2026: 71 kr per kg.",
    ],
    guidance: [
      { label: "Totalt", y2026: 29000, y2027: 30000, note: "2026 kuttet fra 31 000, 2027 kuttet fra 31 000" },
    ],
    guidanceNote: "Slaktevolum i tonn sløyd vekt. Om lag 4 600 tonn ventes slaktet i 4. kvartal 2026.",
    quarter: {
      label: "3. kvartal 2026 (utvidet trading update)",
      published: "2026-11-12",
      metrics: [
        { label: "Slaktevolum", value: "10 498 t", prev: "6 820 t" },
        { label: "Omsetning", value: "1 140 mill. NOK", prev: "754 mill. NOK" },
        { label: "Operasjonelt EBIT", value: "−91 mill. NOK", prev: "−1 mill. NOK" },
      ],
      comment: "Underskudd etter algeepisoden. Selskapet sier selv at oppdrettskostnaden og hovedkontorkostnadene er for høye.",
    },
    sources: [
      { title: "Salmon Business: Grieg Seafood posts operating loss as algae hit production", url: "https://www.salmonbusiness.com/grieg-seafood-posts-e8-6m-operating-loss-as-algae-hit-production/" },
      { title: "Baird Maritime: Grieg Seafood cuts 2026 harvest forecast", url: "https://www.bairdmaritime.com/fishing/aquaculture/grieg-seafood-cuts-harvest-2026" },
      { title: "Grieg Seafood: Change to half-year reporting (børsmelding)", url: "https://live.euronext.com/en/products/equities/company-news/2026-03-31-grieg-seafood-asa-change-quarterly-half-year-reporting" },
    ],
  },
};

const S = {
  mowiCal: { title: "Inderes: Mowi finanskalender", url: "https://www.inderes.dk/en/companies/Mowi" },
  mowiAgm: { title: "MFN: Mowi kalender", url: "https://mfn.se/ob/a/mowi/financial-calendar-96698014" },
  salmCal: { title: "SalMar: Financial calendar (børsmelding 25.08.2026)", url: "https://www.inderes.dk/en/releases/salm-financial-calendar-10" },
  bakkaCal: { title: "Inderes: Bakkafrost finanskalender", url: "https://www.inderes.dk/en/companies/Bakkafrost" },
  lsgCal: { title: "Lerøy: Financial calendar (børsmelding 06.11.2026)", url: "https://www.inderes.dk/en/releases/lsg-financial-calendar-3" },
  gsfCal: { title: "Grieg Seafood: endret rapportering", url: "https://live.euronext.com/en/products/equities/company-news/2026-03-31-grieg-seafood-asa-change-quarterly-half-year-reporting" },
};

export const EVENTS: CalEvent[] = [
  { date: "2027-01-05", symbol: "BAKKA.OL", title: "Trading update 4. kvartal 2026", kind: "Trading update", confirmed: false, note: "Anslått ut fra i fjor (5. januar)" },
  { date: "2027-01-08", symbol: "GSF.OL", title: "Trading update 4. kvartal 2026", kind: "Trading update", confirmed: false, note: "Anslått ut fra i fjor (8. januar)" },
  { date: "2027-01-20", symbol: "MOWI.OL", title: "Trading update 4. kvartal 2026", kind: "Trading update", confirmed: false, note: "Anslått ut fra i fjor (21. januar)" },
  { date: "2027-02-10", symbol: "MOWI.OL", title: "Rapport 4. kvartal 2026", kind: "Rapport", confirmed: true, source: S.mowiCal },
  { date: "2027-02-15", symbol: "BAKKA.OL", title: "Rapport 4. kvartal 2026", kind: "Rapport", confirmed: true, source: S.bakkaCal },
  { date: "2027-02-16", symbol: "SALM.OL", title: "Rapport 4. kvartal 2026", kind: "Rapport", confirmed: true, source: S.salmCal },
  { date: "2027-02-19", symbol: "LSG.OL", title: "Rapport 4. kvartal 2026", kind: "Rapport", confirmed: true, source: S.lsgCal },
  { date: "2027-02-25", symbol: "GSF.OL", title: "Helårsrapport 2026", kind: "Rapport", confirmed: false, note: "Dato fra Yahoo Finance, ikke bekreftet av selskapet", source: S.gsfCal },
  { date: "2027-03-19", symbol: "SALM.OL", title: "Årsrapport 2026", kind: "Årsrapport", confirmed: true, source: S.salmCal },
  { date: "2027-04-30", symbol: "BAKKA.OL", title: "Generalforsamling", kind: "Generalforsamling", confirmed: true, source: S.bakkaCal },
  { date: "2027-04-30", symbol: "LSG.OL", title: "Årsrapport 2026", kind: "Årsrapport", confirmed: true, source: S.lsgCal },
  { date: "2027-05-12", symbol: "MOWI.OL", title: "Rapport 1. kvartal 2027", kind: "Rapport", confirmed: true, source: S.mowiCal },
  { date: "2027-05-25", symbol: "SALM.OL", title: "Rapport 1. kvartal 2027", kind: "Rapport", confirmed: true, source: S.salmCal },
  { date: "2027-06-02", symbol: "MOWI.OL", title: "Generalforsamling", kind: "Generalforsamling", confirmed: true, source: S.mowiAgm },
  { date: "2027-06-17", symbol: "SALM.OL", title: "Generalforsamling", kind: "Generalforsamling", confirmed: true, source: S.salmCal },
  { date: "2027-08-25", symbol: "SALM.OL", title: "Halvårsrapport 2027", kind: "Rapport", confirmed: true, source: S.salmCal },
  { date: "2027-11-09", symbol: "SALM.OL", title: "Rapport 3. kvartal 2027", kind: "Rapport", confirmed: true, source: S.salmCal },
];

// Faste datautgivelser i markedet (regnes ut automatisk)
export function marketEvents(from: Date, days = 120): CalEvent[] {
  const out: CalEvent[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let i = 0; i <= days; i++) {
    const x = new Date(d.getTime() + i * 86400000);
    const iso = x.toISOString().slice(0, 10);
    if (x.getUTCDay() === 3) out.push({ date: iso, symbol: "", title: "SSB: laksepris og eksport (uke)", kind: "Annet", confirmed: true, note: "Kl. 08.00" });
    if (x.getUTCDate() === 20) out.push({ date: iso, symbol: "", title: "Fiskeridirektoratet: biomasse forrige måned", kind: "Annet", confirmed: false, note: "Normalt rundt den 20." });
  }
  return out;
}
