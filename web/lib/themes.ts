// Temaene under «Samfunnssituasjon» i menyen
export type Theme = { id: string; label: string; sub: string; topics: string[]; kinds?: string[]; news: string; indicators?: string; synth?: string[]; icon: string };

export const SYN = (title: string) => "intern:syntese:" + title.toLowerCase().replace(/[^a-zæøå0-9]+/g, "-").replace(/^-|-$/g, "");

export const THEMES: Theme[] = [
  { id: "geopolitikk", label: "Geopolitikk og konflikter", sub: "Kriger, sanksjoner, sund og hva det betyr for skipsfarten",
    topics: ["geopolitikk", "hendelser"], news: "war|krig|iran|israel|hormuz|red sea|rødehavet|houthi|suez|sanction|sanksjon|shadow fleet|skyggeflåte|russia|russland|ukraine|taiwan|venezuela|attack|angrep|navy|marine",
    synth: [SYN("Verdensøkonomien og geopolitikken: hva driver fraktratene nå")], icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" },
  { id: "okonomi", label: "Verdensøkonomi og handel", sub: "Vekst, renter, inflasjon, toll og handelsstrømmer", topics: ["verdensøkonomi", "makro", "aksjemarked"],
    news: "gdp|bnp|inflation|inflasjon|interest rate|rente|fed\\b|ecb|norges bank|recession|resesjon|tariff|toll|trade|handel|china|kina|imf|wto|world bank|economy|økonomi",
    indicators: "økonomi", icon: "M4 19h16M5 15l4-5 4 3 6-7" },
  { id: "energi", label: "Energi og råvarer", sub: "Olje, gass, jernmalm, kull og korn: det skipene frakter", topics: ["råvarer"],
    news: "opec|oil|olje|crude|brent|lng|gas|gass|iron ore|jernmalm|coal|kull|grain|korn|wheat|hvete|soy|copper|kobber|refiner",
    indicators: "energi", icon: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" },
  { id: "shippingtrading", label: "Shippingtrading", sub: "Fraktmarkedet, sykluser, futures og hvordan aksjene beveger seg",
    topics: ["shippingtrading", "fraktmarked", "skipstyper", "shippingbegrep"], kinds: ["forskning"],
    news: "freight|frakt|charter|vlcc|suezmax|capesize|ffa|futures|newbuild|nybygg|orderbook|scrapping|opphugging|tonne",
    indicators: "shipping", synth: [SYN("Shippingtrading: hvordan kursene reagerer på rater, rapporter og nyheter"), SYN("Sykluser i shipping: tegn på topp og bunn"),
      SYN("Sjekkliste: analyse av et tankrederi"), SYN("Sjekkliste: analyse av et tørrbulkrederi")], icon: "M3 17h18l-2 4H5zM6 17V9h12v8M9 9V5h6v4" },
  { id: "metode", label: "Analyse og metode", sub: "Hvordan proffe analytikere jobber, tankefeil og risikostyring", topics: ["analysemetode", "trading og risiko"],
    news: "analyst|analytiker|forecast|prognose", synth: [SYN("Slik jobber proffe analytikere: metode for terminalen"),
      SYN("Risikostyring når du holder aksjer fra 1 dag til 1 måned")], icon: "M9 3h6v4H9zM5 7h14v14H5zM9 12h6M9 16h4" },
];
