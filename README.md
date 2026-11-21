# FUGLESANG

Privat terminal for de fem største lakseaksjene på Oslo Børs: Mowi, SalMar, Bakkafrost, Lerøy og Grieg Seafood.

Analyseverktøy, ikke investeringsråd.

## Slik henger det sammen

```
GitHub Actions (collectors/)  →  Neon Postgres  →  Vercel (web/)  →  fuglesang.vercel.app
```

- `collectors/`: Python-skript som henter data. De kjøres av `.github/workflows/collect.yml`.
- `web/`: Next.js-nettsiden med innlogging, som Vercel publiserer.

## Fase 1 (nå)

- Innlogging med kode, sjekket på serveren. Tre feil forsøk gir fem minutters sperre.
- Kurser for de fem aksjene og EUR/NOK fra Yahoo Finance, hvert 15. minutt i børstiden.
- Laksepris og eksportmengde fra SSB (tabell 03024), hver onsdag.
- Systemstatus som viser når hver kilde sist ble hentet.

## Hemmeligheter

| Navn | Hvor | Innhold |
| --- | --- | --- |
| `DATABASE_URL` | Vercel og GitHub Secrets | Tilkoblingsadressen til Neon |
| `LOGIN_PIN` | Vercel | Koden for å logge inn |
| `SESSION_SECRET` | Vercel | En lang, tilfeldig tekst (minst 24 tegn) |

Ingen hemmeligheter skal ligge i koden.

## Kjøre hentingen manuelt

GitHub → Actions → **Hent data** → **Run workflow**. Første gang: velg `all` og huk av for **backfill**.

## Kilder og lisenser

- SSB: CC BY 4.0, kilde: Statistisk sentralbyrå.
- Yahoo Finance: kun personlig bruk.
