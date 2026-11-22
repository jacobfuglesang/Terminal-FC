# FUGLESANG

Privat, selvoppdaterende terminal for shippingaksjer på Oslo Børs: tank, tørrbulk, container, bilskip, gass og maritime tjenester.

Analyseverktøy, ikke investeringsråd. Koden er åpen for innsyn, men alle rettigheter er forbeholdt (ingen lisens er gitt).

## Slik henger det sammen

```
cron-job.org → GitHub Actions (collectors/) → Neon Postgres → Vercel (web/, bak innlogging)
```

- `collectors/`: Python-skript som henter kurser, børsmeldinger, nyheter, short, nøkkeltall, fraktrater,
  trafikk i sund (IMF PortWatch), skipsposisjoner (AIS), varsler og en daglig KI-rapport.
- `web/`: Next.js-nettsiden. Alle sider krever innlogging.

## Sikkerhet

- Ingen nøkler, koder eller databaseadresser ligger i koden. Alt ligger i GitHub Secrets og Vercel.
- Innlogging: tre feil forsøk gir sperre på 5 minutter, deretter 10, 20, 40 … opp til 24 timer.
  Forsøkene telles atomisk i databasen, så samtidige forespørsler kan ikke omgå sperren.
- `.env`-filer er utelatt fra Git.

## Kilder

Yahoo Finance, Oslo Børs Newsweb, Finanstilsynet, Drewry WCI, Shanghai Shipping Exchange (SCFI),
Baltic Dry Index via nyhetssaker, EIA, IMF PortWatch, aisstream.io, RSS fra shippingmedier og Groq for sammendrag.
