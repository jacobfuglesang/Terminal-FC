// Rederiene og markedsseriene terminalen følger. Holdes i takt med collectors/universe.py.

export type Company = { id: string; name: string; symbol: string; ticker: string; segment: string; about: string };

export const COMPANIES: Company[] = [
  { id: "frontline", name: "Frontline", symbol: "FRO.OL", ticker: "FRO", segment: "Råoljetank",
    about: "Et av verdens største tankrederier, med VLCC, Suezmax og LR2/Aframax. Kontrollert av John Fredriksen. Mye av flåten går i spotmarkedet, så inntjeningen følger tankratene tett." },
  { id: "okeanis", name: "Okeanis Eco Tankers", symbol: "OET.OL", ticker: "OET", segment: "Råoljetank",
    about: "Gresk-kontrollert rederi med moderne VLCC- og Suezmax-skip, i hovedsak i spotmarkedet. Kjent for å betale ut mye av overskuddet." },
  { id: "hafnia", name: "Hafnia", symbol: "HAFNI.OL", ticker: "HAFNI", segment: "Produkttank",
    about: "Et av verdens største produkttankrederier (LR2, LR1, MR og Handy), del av BW-gruppen. Frakter raffinerte produkter som diesel, bensin og jetdrivstoff." },
  { id: "odfjell", name: "Odfjell", symbol: "ODF.OL", ticker: "ODF", segment: "Kjemikalietank",
    about: "Bergensk rederi med kjemikalietankskip og tankterminaler. Mye går på kontrakter, så inntjeningen svinger mindre enn for råoljetank." },
  { id: "stolt-nielsen", name: "Stolt-Nielsen", symbol: "SNI.OL", ticker: "SNI", segment: "Kjemikalietank",
    about: "Kjemikalietankskip, tankterminaler og tankcontainere, pluss oppdrett av piggvar og sjøtunge. Bredere og mindre syklisk enn rene tankrederier." },
  { id: "2020-bulkers", name: "2020 Bulkers", symbol: "2020.OL", ticker: "2020", segment: "Tørrbulk",
    about: "Lite rederi med Newcastlemax-skip, de største bulkskipene (rundt 200 000 tonn), som frakter jernmalm og kull. Betaler utbytte hver måned." },
  { id: "himalaya", name: "Himalaya Shipping", symbol: "HSHP.OL", ticker: "HSHP", segment: "Tørrbulk",
    about: "Moderne Newcastlemax-skip som kan gå på LNG. Skipene leies ut med rater knyttet til Capesize-indeksen, og selskapet betaler utbytte hver måned." },
  { id: "jinhui", name: "Jinhui Shipping", symbol: "JIN.OL", ticker: "JIN", segment: "Tørrbulk",
    about: "Hongkong-basert rederi med mindre bulkskip. Lite omsatt på Oslo Børs, så kursen kan hoppe på små handler." },
  { id: "klaveness", name: "Klaveness Combination Carriers", symbol: "KCC.OL", ticker: "KCC", segment: "Kombinasjon",
    about: "Kombinasjonsskip (CABU og CLEANBU) som veksler mellom tørrlast og våtlast som kaustisk soda og oljeprodukter. Mindre tomseiling gir jevnere inntjening." },
  { id: "mpc-container", name: "MPC Container Ships", symbol: "MPCC.OL", ticker: "MPCC", segment: "Container",
    about: "Eier mindre containerskip som leies ut på tidscerteparti til linjerederier. Inntjeningen styres mer av certepartimarkedet enn av spotratene." },
  { id: "wallenius", name: "Wallenius Wilhelmsen", symbol: "WAWI.OL", ticker: "WAWI", segment: "Bilskip",
    about: "Et av verdens største bilskiprederier (PCTC/Ro-Ro), med logistikk på land. Mye går på kontrakter med bilprodusenter." },
  { id: "hoegh", name: "Höegh Autoliners", symbol: "HAUTO.OL", ticker: "HAUTO", segment: "Bilskip",
    about: "Bilskiprederi (PCTC) med nye Aurora-skip forberedt for ammoniakk og metanol. Mye går på kontrakter." },
  { id: "bw-lpg", name: "BW LPG", symbol: "BWLPG.OL", ticker: "BWLPG", segment: "Gass (LPG)",
    about: "Verdens største eier av VLGC-skip for flytende petroleumsgass (LPG). Mye frakt fra USA og Midtøsten til Asia." },
  { id: "cmb-tech", name: "CMB.TECH", symbol: "CMBTO.OL", ticker: "CMBTO", segment: "Diversifisert",
    about: "Belgisk rederi (Saverys-familien) med tank (tidligere Euronav), tørrbulk (fusjonert med Golden Ocean), container og kjemikalie, og satsing på hydrogen og ammoniakk." },
  { id: "wilhelmsen", name: "Wilh. Wilhelmsen", symbol: "WWI.OL", ticker: "WWI", segment: "Maritime tjenester",
    about: "Maritime tjenester (skipsservice og agentur) og en stor eierpost i Wallenius Wilhelmsen." },
];

export const SEGMENTS = ["Råoljetank", "Produkttank", "Kjemikalietank", "Tørrbulk", "Kombinasjon", "Container", "Bilskip", "Gass (LPG)", "Diversifisert", "Maritime tjenester"];

// Hvilken gratis daglig/ukentlig fraktserie som best speiler segmentet. null = ingen gratis serie.
export const SEGMENT_PROXY: Record<string, { id: string; name: string; kind: "price" | "freight" } | null> = {
  "Råoljetank": { id: "BWET", name: "Tankfrakt (BWET)", kind: "price" },
  "Produkttank": null,
  "Kjemikalietank": null,
  "Tørrbulk": { id: "BDRY", name: "Tørrbulkfrakt (BDRY)", kind: "price" },
  "Kombinasjon": { id: "BDRY", name: "Tørrbulkfrakt (BDRY)", kind: "price" },
  "Container": { id: "SCFI", name: "SCFI containerrater", kind: "freight" },
  "Bilskip": null,
  "Gass (LPG)": null,
  "Diversifisert": { id: "BWET", name: "Tankfrakt (BWET)", kind: "price" },
  "Maritime tjenester": { id: "WAWI.OL", name: "Wallenius Wilhelmsen", kind: "price" },
};

export const SEGMENT_NOTE: Record<string, string> = {
  "Råoljetank": "Styres av VLCC- og Suezmax-ratene. Følg BWET (fraktfutures), trafikken gjennom Hormuz, Brent og USAs oljelagre.",
  "Produkttank": "Styres av ratene for LR- og MR-skip. Det finnes ingen gratis daglig indeks; følg Suez, Bab el-Mandeb, Kapp det gode håp og lagrene av bensin og diesel i USA.",
  "Kjemikalietank": "Mye kontrakter og lite gratis ratedata. Følg rapportene og kjemikalienyheter.",
  "Tørrbulk": "Styres av Capesize-ratene, som igjen styres av jernmalm, kull og korn. Følg BDRY, Baltic Dry Index og jernmalmprisen.",
  "Kombinasjon": "Blanding av tørrbulk og produkttank. Følg både BDRY og tankmarkedet.",
  "Container": "Styres av certepartimarkedet for containerskip, som henger etter spotratene (SCFI, Drewry WCI) og trafikken gjennom Suez og Panama.",
  "Bilskip": "Bilskipratene er ikke gratis tilgjengelige. Følg bilsalg og eksport fra Kina, Suez-trafikken og rapportene.",
  "Gass (LPG)": "VLGC-ratene er ikke gratis tilgjengelige. Følg Panamakanalen (USA–Asia), Hormuz og LPG-nyheter.",
  "Diversifisert": "Blanding av tank, tørrbulk og container. Følg BWET, BDRY og SCFI.",
  "Maritime tjenester": "Henger mest sammen med Wallenius Wilhelmsen og aktiviteten i verdensflåten.",
};

export const MARKET_NAME: Record<string, string> = {
  BWET: "Tankfrakt (BWET)",
  BDRY: "Tørrbulkfrakt (BDRY)",
  "BZ=F": "Brent",
  "TTF=F": "Gass TTF",
  "NG=F": "Gass Henry Hub",
  "TIO=F": "Jernmalm 62 %",
  "HG=F": "Kobber",
  "ZS=F": "Soyabønner",
  "NOK=X": "USD/NOK",
  "EURNOK=X": "EUR/NOK",
  "OSEBX.OL": "Oslo Børs (OSEBX)",
};

export const FREIGHT_NAME: Record<string, { name: string; unit: string; source: string }> = {
  BDI: { name: "Baltic Dry Index", unit: "indeks", source: "Baltic Exchange via Hellenic Shipping News" },
  WCI: { name: "Drewry World Container Index", unit: "USD per 40-fots container", source: "Drewry" },
  SCFI: { name: "SCFI (Shanghai containerrater)", unit: "indeks", source: "Shanghai Shipping Exchange" },
  US_CRUDE: { name: "USAs kommersielle oljelagre", unit: "millioner fat", source: "EIA" },
  US_GASOLINE: { name: "USAs bensinlagre", unit: "millioner fat", source: "EIA" },
  US_DISTILLATE: { name: "USAs lagre av diesel og fyringsolje", unit: "millioner fat", source: "EIA" },
};
