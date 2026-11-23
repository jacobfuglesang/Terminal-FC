"""Kunnskapsbanken: den lokale KI-modellen leser om shipping, fraktmarkeder, råvarer og aksjemarkedet
og lagrer korte notater på norsk med kilde. Morgenrapporten og analytikeren søker i notatene.

Kilder (bare åpne kilder, lest i rolig tempo):
- Egne data: profil per selskap (fra alle kvartalsrapporter lest av KI), mønstre i kursene (regnet ut, ikke KI),
  siste måneds nyheter og meglerrapporter per segment.
- Wikipedia (CC BY-SA): begreper, skipstyper, sund, råvarer, regulering, historie, aksjemarked og risiko.
- Offentlige rapporter og sider fra EIA, IMO, EU og lignende.

Kvalitet: hvert notat sjekkes mot kildeteksten. Punkter med tall som ikke står i kilden fjernes.
Lagring: notatene er små (noen kB). Det skrives aldri når databasen er over 80 % av grensen (Neon gratis: 1 GB).
"""
from __future__ import annotations

import json
import math
import os
import re
import statistics
import time
from datetime import date, timedelta

import requests

import ai
import db
from reports import found, numbers_in, numbers_pos
from universe import COMPANIES

LIMIT_MB = float(os.environ.get("DB_LIMIT_MB", "1024"))  # Neon Free: 1 GB per prosjekt
CAP = 0.80  # aldri fyll databasen mer enn dette
UA = {"User-Agent": "TerminalFC/1.0 (privat kunnskapsbank; https://github.com/jacobfuglesang/Terminal-FC)"}
WIKI = "https://{lang}.wikipedia.org/w/api.php"
CHUNK = 6500
MAX_CHUNKS = 2
# Groq først (bedre og raskere, når kvoten er satt av), ellers den lokale modellen
PURPOSE = "knowledge"
SEC_UA = {"User-Agent": "TerminalFC private research terminalfc-bot@users.noreply.github.com"}
TOPICS = ["shippingbegrep", "skipstyper", "fraktmarked", "shippingtrading", "råvarer", "geopolitikk", "verdensøkonomi",
          "regulering og miljø", "selskap", "aksjemarked", "analysemetode", "trading og risiko", "makro", "historie", "mønster",
          "hendelser", "syntese"]

# ---------------------------------------------------------------- kilder
# (tittel, prioritet). Lavere tall leses først.
WIKI_TITLES = [
    # Fraktmarkedet og kontrakter
    ("Baltic Dry Index", 2), ("Baltic Exchange", 3), ("Worldscale", 2), ("Charterparty", 2), ("Time charter", 2), ("Voyage charter", 2),
    ("Bareboat charter", 3), ("Demurrage", 3), ("Laytime", 4), ("Forward freight agreement", 2), ("Ship broker", 3), ("Freight rate", 2),
    ("Bunker fuel", 2), ("Heavy fuel oil", 3), ("Marine gas oil", 4), ("Scrubber", 3), ("Slow steaming", 3), ("Ship finance", 3),
    ("Ship breaking", 3), ("Shipbuilding", 3), ("Orderbook (shipping)", 4), ("Deadweight tonnage", 3), ("Gross tonnage", 4),
    ("Flag of convenience", 4), ("Protection and indemnity insurance", 4), ("Maritime transport", 3), ("Freight transport", 4),
    ("Containerization", 3), ("Shanghai Containerized Freight Index", 3), ("Tonne-kilometre", 4),
    # Skipstyper
    ("Oil tanker", 2), ("Very large crude carrier", 2), ("Suezmax", 2), ("Aframax", 2), ("Panamax", 3), ("Capesize", 2),
    ("Handysize", 3), ("Supramax", 3), ("Bulk carrier", 2), ("Container ship", 2), ("Car carrier", 2), ("Roll-on/roll-off", 3),
    ("LNG carrier", 3), ("Gas carrier", 3), ("Chemical tanker", 3), ("Product tanker", 3), ("Combination carrier", 3),
    ("Ultra Large Crude Carrier", 5), ("Newcastlemax", 4), ("Malaccamax", 4), ("Chinamax", 4),
    # Sund og geopolitikk
    ("Strait of Hormuz", 2), ("Suez Canal", 2), ("Panama Canal", 2), ("Bab-el-Mandeb", 2), ("Strait of Malacca", 3), ("Bosphorus", 3),
    ("Danish straits", 4), ("Cape of Good Hope", 4), ("Red Sea crisis", 2), ("Shadow fleet", 2), ("Russian oil price cap", 2),
    ("International sanctions during the Russian invasion of Ukraine", 3), ("Tanker war", 3), ("Houthi movement", 3),
    ("2021 Suez Canal obstruction", 3), ("2023–2024 Panama Canal drought", 3), ("Black Sea Grain Initiative", 4),
    ("Sanctions against Iran", 3), ("Venezuela–United States relations", 5),
    # Råvarer og energi
    ("Brent Crude", 2), ("West Texas Intermediate", 3), ("OPEC", 2), ("OPEC+", 2), ("Price of oil", 2), ("Petroleum reserves", 4),
    ("Strategic Petroleum Reserve (United States)", 3), ("Crack spread", 2), ("Oil refinery", 3), ("Contango", 2), ("Backwardation", 2),
    ("Futures contract", 3), ("Iron ore", 2), ("Coal", 4), ("Steel industry in China", 3), ("Liquefied petroleum gas", 3),
    ("Liquefied natural gas", 3), ("Dutch TTF Natural Gas Futures", 3), ("Henry Hub", 4), ("Soybean", 5), ("Bauxite", 5),
    ("Commodity market", 3), ("Commodity price shocks", 4), ("Commodities supercycle", 3),
    # Regulering og miljø
    ("International Maritime Organization", 3), ("MARPOL 73/78", 3), ("IMO 2020", 2), ("Energy Efficiency Existing Ship Index", 3),
    ("Carbon Intensity Indicator", 3), ("European Union Emissions Trading System", 3), ("FuelEU Maritime", 3), ("Ammonia as fuel", 4),
    ("Methanol fuel", 4), ("Ballast water", 5),
    # Historie og sykler
    ("Shipping crisis", 4), ("1973 oil crisis", 3), ("2008 financial crisis", 3), ("2020 Russia–Saudi Arabia oil price war", 2),
    ("2021–2023 global supply chain crisis", 2), ("Economic cycle", 3), ("Shipping cycle", 3), ("Great Recession", 4),
    # Aksjemarked, verdsetting og trading
    ("Oslo Stock Exchange", 2), ("OBX Index", 3), ("Euronext", 4), ("Dividend", 2), ("Dividend yield", 2), ("Ex-dividend date", 2),
    ("Net asset value", 2), ("Price–earnings ratio", 2), ("Enterprise value", 3), ("EV/Ebitda", 3), ("Price-to-book ratio", 3),
    ("Earnings per share", 3), ("Free cash flow", 3), ("Return on equity", 4), ("Leverage (finance)", 3), ("Market capitalization", 4),
    ("Short (finance)", 2), ("Short squeeze", 3), ("Volatility (finance)", 2), ("Beta (finance)", 2), ("Correlation", 4),
    ("Technical analysis", 3), ("Moving average", 3), ("Relative strength index", 3), ("MACD", 4), ("Support and resistance", 4),
    ("Momentum investing", 3), ("Mean reversion (finance)", 3), ("Swing trading", 2), ("Day trading", 3), ("Position sizing", 2),
    ("Kelly criterion", 3), ("Stop-loss order", 2), ("Risk management", 4), ("Drawdown (economics)", 3), ("Diversification (finance)", 3),
    ("Behavioral finance", 3), ("Efficient-market hypothesis", 3), ("Earnings surprise", 4), ("Post–earnings-announcement drift", 2),
    ("Sell in May", 5), ("Liquidity (finance)", 3), ("Bid–ask spread", 3), ("Market maker", 4), ("Order book", 4),
    ("Cyclical stock", 2), ("Value investing", 4), ("Hedge (finance)", 3), ("Exchange-traded fund", 4),
    # Makro og valuta
    ("Interest rate", 4), ("Federal Reserve", 4), ("Inflation", 4), ("Exchange rate", 4), ("Norwegian krone", 3), ("Norges Bank", 3),
    ("Purchasing managers' index", 3), ("Economy of China", 3), ("Global trade", 4),
    # Selskapene (engelsk Wikipedia)
    ("Frontline plc", 1), ("John Fredriksen", 2), ("Okeanis Eco Tankers", 2), ("Hafnia (company)", 2), ("Odfjell", 2), ("Stolt-Nielsen", 2),
    ("2020 Bulkers", 3), ("Himalaya Shipping", 3), ("Jinhui Shipping", 3), ("Klaveness Combination Carriers", 3), ("MPC Container Ships", 3),
    ("Wallenius Wilhelmsen", 2), ("Höegh Autoliners", 2), ("BW LPG", 2), ("CMB.Tech", 2), ("Euronav", 2), ("Golden Ocean Group", 2),
    ("Wilh. Wilhelmsen", 2), ("Seatankers", 4), ("SFL Corporation", 4),
]

# Ekstra Wikipedia-kategorier som utvides når hovedlisten er lest
WIKI_CATEGORIES = ["Category:Shipping", "Category:Tankers", "Category:Bulk carriers", "Category:Ship types", "Category:Maritime transport",
                   "Category:Petroleum economics", "Category:Technical analysis", "Category:Financial ratios", "Category:Stock market",
                   "Category:Commodity markets", "Category:Shipping companies of Norway", "Category:Maritime incidents in 2024",
                   "Category:Maritime incidents in 2025", "Category:Oil tankers"]

# Offentlige sider (EIA, IMO, EU osv.). Feiler en, hoppes den over.
WEB_PAGES = [
    ("https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints", "EIA: World Oil Transit Chokepoints", 2),
    ("https://www.eia.gov/outlooks/steo/report/global_oil.php", "EIA STEO: Global oil markets", 2),
    ("https://www.eia.gov/outlooks/steo/", "EIA Short-Term Energy Outlook", 3),
    ("https://www.eia.gov/todayinenergy/", "EIA Today in Energy", 4),
    ("https://www.imo.org/en/MediaCentre/HotTopics/Pages/Cutting-GHG-emissions.aspx", "IMO: Cutting GHG emissions", 3),
    ("https://climate.ec.europa.eu/eu-action/transport/reducing-emissions-shipping-sector_en", "EU: Reducing emissions from shipping", 3),
    ("https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport", "UNCTAD Review of Maritime Transport", 2),
    ("https://portwatch.imf.org/pages/about", "IMF PortWatch: om dataene", 4),
    ("https://www.pancanal.com/en/maritime-services/", "Panama Canal: maritime services", 4),
]

# ---- Utvidet lesing (prioritet 0–2 leses først): verden og makro, shippingtrading og hvordan proffe analytikere jobber.
# Offentlige rapporter fra IMF, IEA, WTO, Verdensbanken og UNCTAD (åpne for alle). PDF-er leses jevnt fordelt gjennom dokumentet.
WORLD_DOCS = [
    ("https://www.imf.org/-/media/files/publications/weo/2026/october/english/execsum.pdf", "IMF World Economic Outlook okt. 2026: sammendrag", 0, 3),
    ("https://www.imf.org/-/media/files/publications/weo/2026/october/english/ch1.pdf", "IMF World Economic Outlook okt. 2026: kapittel 1", 0, 8),
    ("https://iea.org/reports/oil-market-report-november-2026", "IEA Oil Market Report november 2026", 0, 3),
    ("https://www.wto.org/english/news_e/news26_e/stat_08oct26_510_e.htm", "WTO handelsprognose oktober 2026", 0, 3),
    ("https://www.wto.org/english/res_e/publications_e/global-trade-outlook-and-statistics_execsum_e.htm", "WTO Global Trade Outlook: sammendrag", 0, 3),
    ("https://www.worldbank.org/en/news/press-release/2026/10/28/commodity-markets-outlook-october-2026-press-release", "Verdensbanken Commodity Markets Outlook okt. 2026", 0, 3),
    ("https://www.worldbank.org/en/research/commodity-markets", "Verdensbanken: råvaremarkedene", 1, 2),
    ("https://unctad.org/system/files/official-document/rmt2025overview_en.pdf", "UNCTAD Review of Maritime Transport 2025: oversikt", 0, 6),
    ("https://unctad.org/system/files/official-document/rmt2025ch1_en.pdf", "UNCTAD RMT 2025 kap. 1: verdens sjøhandel", 1, 6),
    ("https://unctad.org/system/files/official-document/rmt2025ch2_en.pdf", "UNCTAD RMT 2025 kap. 2: verdensflåten og fraktmarkedene", 1, 6),
    ("https://www.cia.gov/resources/csi/static/Pyschology-of-Intelligence-Analysis.pdf", "Heuer: Psychology of Intelligence Analysis (CIA, offentlig)", 1, 10),
]

# Wikipedia-søk: finner de mest relevante artiklene om det som skjer nå (2026) og om trading og analyse
WIKI_SEARCHES = [
    # Verden nå
    ("2026 Iran war", 0), ("Strait of Hormuz 2026 shipping", 0), ("2026 oil price shock", 0), ("Middle East war 2026 shipping attacks", 0),
    ("Red Sea shipping crisis Houthi", 0), ("Russia sanctions shadow fleet tankers", 0), ("2026 tariffs trade war United States China", 0),
    ("Economy of China 2026", 0), ("Venezuela oil sanctions", 1), ("Black Sea shipping grain 2026", 1), ("El Niño 2026", 1),
    ("OPEC+ production cuts 2026", 0), ("Global economy 2026 recession risk", 0), ("Taiwan Strait shipping risk", 1),
    ("Arctic shipping Northern Sea Route", 2), ("Energy crisis 2026 Europe LNG", 1), ("India Russia oil imports", 1),
    ("Geopolitics of oil", 1), ("Deglobalization", 1), ("Friendshoring nearshoring supply chains", 2),
    # Shippingtrading
    ("freight derivatives trading", 0), ("tanker freight rates market", 0), ("dry bulk shipping market", 0), ("shipping cycle boom bust", 0),
    ("tonne-mile demand shipping", 0), ("ship valuation second hand", 1), ("time charter equivalent", 1), ("Baltic Exchange indices", 1),
    ("commodity trading house", 1), ("oil trader physical", 1), ("floating storage contango tankers", 0),
    # Analyse og metode
    ("structured analytic techniques intelligence", 0), ("superforecasting Tetlock", 0), ("equity research analyst", 0),
]

# Søkene som handler om situasjonen nå: artiklene de finner leses på nytt hver lørdag
NOW_QUERIES = {q for q, _ in WIKI_SEARCHES[:20]}

WIKI_ANALYSIS = [
    ("Financial analyst", 0), ("Securities research", 0), ("Fundamental analysis", 0), ("Valuation (finance)", 1), ("Discounted cash flow", 1),
    ("Sum-of-the-parts analysis", 1), ("Valuation using multiples", 1), ("Sensitivity analysis", 1), ("Scenario analysis", 0),
    ("Scenario planning", 1), ("Earnings call", 1), ("Earnings guidance", 1), ("Expected value", 1), ("Base rate fallacy", 0),
    ("Confirmation bias", 0), ("Overconfidence effect", 0), ("Anchoring effect", 1), ("Hindsight bias", 1), ("Survivorship bias", 1),
    ("Superforecaster", 0), ("Good Judgment Project", 1), ("Brier score", 1), ("Pre-mortem", 0), ("Red team", 1),
    ("Analysis of competing hypotheses", 0), ("Intelligence analysis", 1), ("Global macro", 0), ("Event-driven investing", 1),
    ("Pairs trade", 1), ("Statistical arbitrage", 2), ("Trend following", 1), ("Value at risk", 1), ("Sharpe ratio", 1),
    ("Sortino ratio", 2), ("Backtesting", 1), ("Overfitting", 1), ("Data dredging", 2), ("Market sentiment", 1),
    ("Commitments of Traders", 1), ("Open interest", 2), ("Implied volatility", 1), ("Put–call ratio", 2), ("Black swan theory", 1),
    ("Tail risk", 1), ("Reflexivity (social theory)", 1), ("Margin of safety (financial)", 1), ("Catalyst (finance)", 2),
    ("Geopolitical risk", 0), ("Supply and demand", 2), ("Price elasticity of demand", 2), ("Commodity trading advisor", 2),
]

# Industridelen i årsrapportene (20-F/10-K) til USA-noterte rederier. Den er skrevet av maritime konsulenter
# (Drewry, Clarksons o.l.) og forklarer markedet grundig. Offentlig hos SEC EDGAR.
SEC_TICKERS = [("FRO", 0), ("STNG", 0), ("SBLK", 0), ("DHT", 1), ("INSW", 1), ("TNK", 1), ("GNK", 1), ("HAFN", 1), ("BWLP", 1),
               ("LPG", 1), ("DAC", 1), ("ZIM", 2), ("HSHP", 1), ("CMBT", 1), ("TRMD", 2), ("NAT", 2)]

# Forskning (arXiv): sammendrag av artikler, ett notat per søk
ARXIV_QUERIES = [("freight rate forecasting", 1), ("tanker market", 1), ("dry bulk shipping", 1), ("shipping stock returns", 1),
                 ("oil price shocks stock returns", 1), ("geopolitical risk commodity prices", 1), ("commodity futures momentum", 2),
                 ("time series momentum", 2), ("earnings announcement drift", 2), ("maritime trade network disruption", 2)]

# Til slutt skriver KI-en sammenfatninger som binder notatene sammen (bygger bare på notatene)
SYNTHESES = [
    ("Slik jobber proffe analytikere: metode for terminalen", "analytiker metode hypoteser skjevhet scenario sannsynlighet verdsetting prognose"),
    ("Verdensøkonomien og geopolitikken: hva driver fraktratene nå", "krig Iran Hormuz olje handel vekst sanksjoner tollsatser frakt etterspørsel"),
    ("Sjekkliste: analyse av et tankrederi", "tank VLCC Suezmax LR2 rater booking dødpunkt utbytte flåte ordrebok"),
    ("Sjekkliste: analyse av et tørrbulkrederi", "tørrbulk Capesize Newcastlemax jernmalm kull Kina BDI flåte"),
    ("Shippingtrading: hvordan kursene reagerer på rater, rapporter og nyheter", "aksje kurs reagerer rapport rater futures momentum korrelasjon"),
    ("Risikostyring når du holder aksjer fra 1 dag til 1 måned", "risiko posisjon stopp volatilitet fall størrelse diversifisering"),
    ("Sykluser i shipping: tegn på topp og bunn", "syklus ordrebok nybygg opphugging rater verdier tilbud etterspørsel"),
]

SEG_WORDS = {
    "Tank": r"tanker|vlcc|suezmax|aframax|lr2|crude|råolje|product tanker|mr tanker|opec|oil",
    "Tørrbulk": r"bulk|capesize|panamax|kamsarmax|supramax|iron ore|jernmalm|coal|kull|grain|bdi|baltic dry",
    "Container og bil": r"container|teu|pctc|car carrier|bilskip|ro-?ro|scfi|wci|drewry",
    "Gass": r"lpg|vlgc|lng|gas carrier|propane",
    "Geopolitikk": r"hormuz|red sea|rødehavet|houthi|suez|panama|sanction|sanksjon|shadow fleet|skyggeflåte|tariff|toll|iran|russia|russland",
}


# ---------------------------------------------------------------- lagring
def db_bytes(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_database_size(current_database())")
        return int(cur.fetchone()[0])


def kb_bytes(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT coalesce(pg_total_relation_size('knowledge'), 0) + coalesce(pg_total_relation_size('kb_sources'), 0)")
        return int(cur.fetchone()[0])


def room(conn) -> bool:
    return db_bytes(conn) < CAP * LIMIT_MB * 1024 * 1024 - 5 * 1024 * 1024


def prune(conn) -> int:
    """Er databasen over 80 %: slett de eldste vanlige notatene (ikke selskapsprofiler og mønstre) til den er under 78 %."""
    limit = CAP * LIMIT_MB * 1024 * 1024
    if db_bytes(conn) < limit:
        return 0
    deleted = 0
    with conn.cursor() as cur:
        for _ in range(40):
            cur.execute("""DELETE FROM knowledge WHERE id IN (SELECT id FROM knowledge WHERE kind NOT IN ('selskap', 'mønster', 'syntese')
                           ORDER BY created_at LIMIT 25)""")
            n = cur.rowcount
            conn.commit()
            deleted += n
            if not n or db_bytes(conn) < 0.78 * LIMIT_MB * 1024 * 1024:
                break
    print(f"  Databasen var over {CAP:.0%} av grensen: slettet {deleted} eldre notater")
    return deleted


def save_note(note: dict) -> None:
    with db.connect() as c, c.cursor() as cur:
        cur.execute("DELETE FROM knowledge WHERE url = %s", (note["url"],))
        cur.execute("""INSERT INTO knowledge (url, kind, topic, title, body, facts, symbols, source_title, model, checked, unverified)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (note["url"], note["kind"], note.get("topic"), note["title"][:200], note["body"][:6000],
                     json.dumps(note.get("facts") or {}, ensure_ascii=False), note.get("symbols") or [], note.get("source_title"),
                     note.get("model"), note.get("checked", 0), note.get("unverified", 0)))
        cur.execute("UPDATE kb_sources SET status = 'done', done_at = now(), error = NULL, chars = %s WHERE url = %s",
                    (note.get("chars"), note["url"]))
        c.commit()


def mark(url: str, status: str, error: str | None = None) -> None:
    with db.connect() as c, c.cursor() as cur:
        cur.execute("UPDATE kb_sources SET status = %s, error = %s, tries = tries + 1, done_at = now() WHERE url = %s",
                    (status, (error or "")[:300] or None, url))
        c.commit()


def seed(conn) -> int:
    rows = []
    for c in COMPANIES:
        rows.append((f"intern:selskap:{c['symbol']}", "selskap", f"Selskapsprofil: {c['name']}", "selskap", 1))
        rows.append((f"intern:mønster:{c['symbol']}", "mønster", f"Kursmønstre: {c['name']}", "mønster", 1))
    rows.append(("intern:mønster:marked", "mønster", "Kursmønstre: hele sektoren", "mønster", 1))
    for seg in SEG_WORDS:
        rows.append((f"intern:hendelser:{seg}", "hendelser", f"Siste 30 dager: {seg}", "hendelser", 2))
    for title, prio in WIKI_TITLES:
        rows.append((f"wiki:en:{title}", "begrep", title, None, prio))
    for url, title, prio in WEB_PAGES:
        rows.append((url, "rapport", title, None, prio))
    for url, title, prio, _ in WORLD_DOCS:
        rows.append((url, "rapport", title, "verdensøkonomi", prio))
    for q, prio in WIKI_SEARCHES:
        rows.append((f"wikisearch:en:{q}", "søk", q, None, prio))
    for t, prio in WIKI_ANALYSIS:
        rows.append((f"wiki:en:{t}", "begrep", t, "analysemetode", prio))
    for t, prio in SEC_TICKERS:
        rows.append((f"sec:{t}", "rapport", f"Årsrapport (SEC) {t}: markedet", "shippingtrading", prio))
    for q, prio in ARXIV_QUERIES:
        rows.append((f"arxiv:{q}", "forskning", f"Forskning: {q}", None, prio))
    with conn.cursor() as cur:
        cur.executemany("""INSERT INTO kb_sources (url, kind, title, topic, priority) VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (url) DO UPDATE SET priority = least(kb_sources.priority, EXCLUDED.priority)""", rows)
        # Egne data endrer seg: selskapsprofiler leses på nytt hver måned, mønstre og hendelser hver uke
        cur.execute("""UPDATE kb_sources SET status = 'pending', tries = 0 WHERE status IN ('done', 'error')
                       AND ((url LIKE 'intern:selskap:%%' AND done_at < now() - interval '30 days')
                         OR ((url LIKE 'intern:mønster:%%' OR url LIKE 'intern:hendelser:%%') AND done_at < now() - interval '6 days'))""")
        # Offentlige sider som oppdateres (EIA, UNCTAD) leses på nytt hver måned
        cur.execute("""UPDATE kb_sources SET status = 'pending', tries = 0 WHERE status = 'done' AND kind = 'rapport'
                       AND done_at < now() - interval '30 days'""")
        if ai.knowledge_day():
            # Lørdag (Groq satt av): les situasjonen nå på nytt, og skriv om notater den lokale modellen laget
            world = [u for u, *_ in WORLD_DOCS] + [u for u, *_ in WEB_PAGES]
            cur.execute("""UPDATE kb_sources SET status = 'pending', tries = 0, priority = 0 WHERE status IN ('done', 'error', 'skip')
                           AND done_at < now() - interval '5 days'
                           AND (url = ANY(%s) OR url = ANY(%s) OR topic = 'nå' OR url LIKE 'intern:hendelser:%%')""",
                        (world, [f"wikisearch:en:{q}" for q in NOW_QUERIES]))
            print(f"  Lørdagsoppfrisking: {cur.rowcount} kilder om situasjonen nå leses på nytt")
            cur.execute("""UPDATE kb_sources s SET status = 'pending', tries = 0, priority = greatest(s.priority, 3)
                           FROM knowledge k WHERE k.url = s.url AND k.model LIKE 'lokal/%%' AND s.status = 'done'
                           AND s.url NOT LIKE 'intern:mønster:%%'""")
            print(f"  {cur.rowcount} notater fra den lokale modellen skrives på nytt med Groq når det er kvote igjen")
        cur.execute("SELECT count(*) FROM kb_sources WHERE status = 'pending'")
        n = cur.fetchone()[0]
    conn.commit()
    return n


def expand_categories(conn) -> int:
    """Legger til artikler fra Wikipedia-kategoriene når hovedlisten er lest."""
    added = 0
    with conn.cursor() as cur:
        for cat in WIKI_CATEGORIES:
            try:
                r = requests.get(WIKI.format(lang="en"), headers=UA, timeout=30, params={
                    "action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "page", "cmlimit": 200, "format": "json"})
                members = r.json().get("query", {}).get("categorymembers", [])
            except Exception as e:  # noqa: BLE001
                print(f"  ! {cat}: {e}")
                continue
            for m in members:
                t = m.get("title", "")
                if not t or t.startswith(("List of", "Lists of", "Index of", "Outline of")) or "(disambiguation)" in t:
                    continue
                cur.execute("""INSERT INTO kb_sources (url, kind, title, priority) VALUES (%s, 'begrep', %s, 7)
                               ON CONFLICT (url) DO NOTHING""", (f"wiki:en:{t}", t))
                added += cur.rowcount
            time.sleep(1)
    conn.commit()
    return added


# ---------------------------------------------------------------- henting
def wiki_text(title: str, lang: str = "en") -> tuple[str, str]:
    r = requests.get(WIKI.format(lang=lang), headers=UA, timeout=40, params={
        "action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1, "titles": title, "format": "json"})
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    page = next(iter(pages.values()), {})
    text = page.get("extract") or ""
    # Kutt referanser og lenkelister nederst
    text = re.split(r"\n==\s*(See also|References|External links|Notes|Further reading|Bibliography|Se også|Referanser|Eksterne lenker)\s*==", text)[0]
    return text.strip(), f"https://{lang}.wikipedia.org/wiki/{(page.get('title') or title).replace(' ', '_')}"


def web_text(url: str) -> str:
    import trafilatura

    r = requests.get(url, headers={**UA, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8"}, timeout=90)
    r.raise_for_status()
    if r.content[:4] == b"%PDF" or url.lower().endswith(".pdf"):
        return pdf_text(r.content)
    return (trafilatura.extract(r.text, include_tables=True) or "").strip()


def pdf_text(data: bytes, max_pages: int = 220, max_chars: int = 400_000) -> str:
    import io

    from pypdf import PdfReader

    if len(data) > 40_000_000:
        raise ValueError("PDF-en er for stor")
    reader = PdfReader(io.BytesIO(data))
    out, n = [], 0
    for page in reader.pages[:max_pages]:
        t = page.extract_text() or ""
        t = re.sub(r"[ \t]+", " ", t)
        out.append(t)
        n += len(t)
        if n > max_chars:
            break
    # Linjer blir til avsnitt, så tekstbitene får naturlige skiller
    return re.sub(r"\n{3,}", "\n\n", "\n\n".join(out)).strip()


def wiki_search(query: str, n: int = 3) -> list[str]:
    r = requests.get(WIKI.format(lang="en"), headers=UA, timeout=30, params={
        "action": "query", "list": "search", "srsearch": query, "srlimit": n, "srnamespace": 0, "format": "json"})
    r.raise_for_status()
    return [h["title"] for h in r.json().get("query", {}).get("search", []) if "(disambiguation)" not in h["title"]]


_sec_tickers: dict[str, int] = {}


def sec_industry(ticker: str) -> tuple[str, str, str]:
    """Industridelen av siste årsrapport (20-F eller 10-K). Returnerer (tekst, lenke, rapporttype og dato)."""
    if not _sec_tickers:
        r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=SEC_UA, timeout=30)
        r.raise_for_status()
        _sec_tickers.update({v["ticker"].upper(): int(v["cik_str"]) for v in r.json().values()})
    cik = _sec_tickers.get(ticker.upper())
    if not cik:
        raise ValueError(f"404 fant ikke {ticker} hos SEC")
    time.sleep(0.5)
    sub_ = requests.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json", headers=SEC_UA, timeout=30).json()
    rec = sub_.get("filings", {}).get("recent", {})
    for form, acc, doc, day in zip(rec.get("form", []), rec.get("accessionNumber", []), rec.get("primaryDocument", []), rec.get("filingDate", [])):
        if form in ("20-F", "10-K"):
            break
    else:
        raise ValueError(f"404 ingen årsrapport for {ticker}")
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}"
    time.sleep(0.5)
    r = requests.get(url, headers=SEC_UA, timeout=120)
    r.raise_for_status()
    from lxml import html as lh

    tree = lh.fromstring(r.content)
    for bad in tree.xpath("//script|//style"):
        bad.drop_tree()
    text = re.sub(r"[ \t\xa0]+", " ", tree.text_content())
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    # Finn industrikapittelet: overskriften forekommer også i innholdsfortegnelsen, så velg den med mest markedstekst etter seg
    heads = [m.start() for m in re.finditer(
        r"(?i)(the international [a-z /-]{0,40}(?:industry|market)s?|industry overview|the [a-z /-]{0,30}shipping (?:industry|market)|"
        r"the (?:crude )?tanker (?:industry|market)|the dry ?bulk (?:shipping )?(?:industry|market)|the (?:lpg|container) shipping)", text)]
    def score(i: int) -> int:
        w = text[i:i + 8000].lower()
        return sum(w.count(k) for k in ("demand", "supply", "fleet", "rates", "tonne", "charter", "orderbook", "deliveries"))
    if not heads:
        raise ValueError("fant ikke industridelen i årsrapporten")
    start = max(heads, key=score)
    return text[start:start + 70_000], url, f"{form} {day}"


def arxiv_text(query: str, n: int = 12) -> tuple[str, str]:
    import feedparser

    url = "https://export.arxiv.org/api/query"
    r = requests.get(url, headers=UA, timeout=40, params={"search_query": f'all:"{query}"', "max_results": n, "sortBy": "relevance"})
    r.raise_for_status()
    feed = feedparser.parse(r.content)
    parts = [f"Artikkel: {e.title} ({e.get('published', '')[:4]})\n{re.sub(r'\s+', ' ', e.summary)}" for e in feed.entries]
    return "\n\n".join(parts), f"https://arxiv.org/a?query={requests.utils.quote(query)}"


# ---------------------------------------------------------------- KI-notater
CHUNK_PROMPT = """Du leser del {i} av {n} av «{title}». Skriv 5–12 korte stikkpunkter på norsk bokmål med det viktigste for en
privatinvestor som handler shippingaksjer på Oslo Børs (holder fra 1 dag til 1 måned): begreper og hva de betyr, årsakssammenhenger,
og tall med enhet og årstall. Bruk BARE det som står i teksten. Ikke finn på tall eller fakta. Ingen kjøps- eller salgsråd.{numhint}

TEKST:
{text}"""

NOTE_PROMPT = """Lag et kunnskapsnotat på norsk bokmål om «{title}» for en privat shippingterminal. Leseren handler shippingaksjer
på Oslo Børs og holder dem fra 1 dag til 1 måned. Bruk BARE det som står i materialet under. Ikke finn på tall, navn eller årstall.
Ingen kjøps- eller salgsråd og ingen kursmål.{numhint}

Svar KUN med JSON:
{{"title": "kort norsk tittel",
 "topic": "én av: {topics}",
 "summary": "2–3 enkle setninger om hva dette er og hvorfor det betyr noe",
 "points": ["6–12 korte fakta eller sammenhenger, med tall og årstall der materialet har dem"],
 "trading": ["0–4 punkter om hvordan dette typisk påvirker fraktrater eller shippingaksjer på kort sikt, bare der materialet gir grunnlag"],
 "tags": ["skipstyper, selskaper, råvarer eller steder notatet handler om"]}}

MATERIALE:
{text}"""


LOCAL_NUMHINT = ("\nVIKTIG: Skriv sammenhenger og forklaringer med ord. Ta bare med et tall hvis det er helt sentralt, og kopier det "
                 "da tegn for tegn fra teksten. Heller ingen tall enn et usikkert tall.")


def local_next() -> bool:
    """Kommer neste KI-kall til å gå til den lokale modellen? (Da bes den om å unngå tall.)"""
    if not ai.knowledge_day() or not ai.key("groq"):
        return True
    models = ai._pick("groq", "knowledge")
    return not models or all(("groq", m) in ai._exhausted for m in models)


def chunks_of(text: str, max_chunks: int = MAX_CHUNKS) -> list[str]:
    """Deler teksten i biter. Er den lengre enn max_chunks biter, velges biter jevnt fordelt gjennom hele teksten."""
    paras, out, cur = re.split(r"\n{2,}", text), [], ""
    for p in paras:
        while len(p) > CHUNK * 2:  # PDF-er uten avsnitt
            out.append(cur + p[:CHUNK]) if cur else out.append(p[:CHUNK])
            cur, p = "", p[CHUNK:]
        if len(cur) + len(p) > CHUNK and cur:
            out.append(cur)
            cur = ""
        cur += p + "\n\n"
    if cur.strip():
        out.append(cur)
    out = [c[:CHUNK + 1500] for c in out]
    if len(out) <= max_chunks:
        return out
    step = len(out) / max_chunks
    return [out[int(i * step)] for i in range(max_chunks)]


def parse_json(raw: str) -> dict:
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.S)
    return json.loads(m.group(0) if m else raw)


def checked_points(points: list, pool: set[float]) -> tuple[list[str], int, int]:
    """Beholder punkter der alle tall finnes i kilden. Årstall og små hele tall (1–12) regnes som ufarlige.
    Tall kan skrives på flere måter (562 600, 562,600, 1,2 mill.), så alle tolkninger prøves."""
    keep, checked, dropped = [], 0, 0
    for p in points or []:
        if not isinstance(p, str) or not p.strip():
            continue
        ok = True
        for _, cands in numbers_pos(p):
            if all((1 <= x <= 12 and x == int(x)) or (1800 <= x <= 2035 and x == int(x)) for x in cands):
                continue
            checked += 1
            if not any(found(x, pool) or found(x * 1000, pool) or found(x * 1e6, pool) or found(x * 1e9, pool) for x in cands):
                ok = False
        if ok:
            keep.append(p.strip())
        else:
            dropped += 1
    return keep, checked, dropped


def write_note(title: str, text: str, kind: str, url: str, source_title: str, topic: str | None = None,
               symbols: list[str] | None = None, max_chunks: int = MAX_CHUNKS) -> dict:
    parts = chunks_of(text, max_chunks)
    if not parts:
        raise ValueError("ingen tekst")
    model = ""
    if len(parts) == 1:
        material = parts[0]
    else:
        notes = []
        for i, ch in enumerate(parts):
            hint = LOCAL_NUMHINT if local_next() else ""
            out, model = ai.chat(CHUNK_PROMPT.format(i=i + 1, n=len(parts), title=title, text=ch, numhint=hint), PURPOSE, 700,
                                 temperature=0.1)
            notes.append(out)
        per = max(800, 14000 // len(notes))  # holder sluttsteget under Groqs grense per forespørsel
        material = "\n\n".join(n[:per] for n in notes)
    hint = LOCAL_NUMHINT if local_next() else ""
    raw, model = ai.chat(NOTE_PROMPT.format(title=title, text=material, topics=", ".join(TOPICS), numhint=hint), PURPOSE, 1600,
                         json_mode=True, temperature=0.1)
    data = parse_json(raw)
    pool = numbers_in(text)
    points, checked, dropped = checked_points(data.get("points") or [], pool)
    trading, c2, d2 = checked_points(data.get("trading") or [], pool)
    summary_ok, c3, d3 = checked_points([data.get("summary") or ""], pool)
    if not points and not summary_ok:
        raise ValueError("notatet hadde ingen punkter som kunne bekreftes i kilden")
    body = (summary_ok[0] if summary_ok else "") + "\n\n" + "\n".join(f"- {p}" for p in points)
    if trading:
        body += "\n\nBetydning for shippingaksjer:\n" + "\n".join(f"- {p}" for p in trading)
    tags = [t for t in (data.get("tags") or []) if isinstance(t, str)][:12]
    syms = set(symbols or [])
    low = (title + " " + body).lower()
    for c in COMPANIES:
        if c["name"].lower().split(" ")[0] in low:
            syms.add(c["symbol"])
    t = data.get("topic") if data.get("topic") in TOPICS else (topic or "shippingbegrep")
    return {"url": url, "kind": kind, "topic": t, "title": str(data.get("title") or title), "body": body.strip(),
            "facts": {"points": points, "trading": trading, "tags": tags}, "symbols": sorted(syms), "source_title": source_title,
            "model": model, "checked": checked + c2 + c3, "unverified": dropped + d2 + d3, "chars": len(text)}


# ---------------------------------------------------------------- egne data
def company_material(conn, sym: str) -> str:
    c = next(x for x in COMPANIES if x["symbol"] == sym)
    lines = [f"Selskap: {c['name']} ({sym}), segment {c['segment']}."]
    with conn.cursor() as cur:
        cur.execute("""SELECT period, published::date, data FROM reports WHERE symbol = %s AND data IS NOT NULL
                       AND status IN ('ok', 'pending') ORDER BY published""", (sym,))
        for period, pub, d in cur.fetchall():
            if not d or d.get("is_report") is False:
                continue
            ln = [f"\nRapport {period} ({pub}): {d.get('headline', '')}"]
            ln += [f"- {s}" for s in (d.get("summary") or [])[:6]]
            for k, lab in (("tce", "Oppnådd rate"), ("bookings", "Booket"), ("breakeven", "Dødpunkt")):
                for b in (d.get(k) or [])[:5]:
                    if b.get("rate"):
                        share = f" {b.get('share_pct')} % av dagene" if b.get("share_pct") else ""
                        ln.append(f"- {lab} {b.get('segment')} {b.get('period') or ''}:{share} {b.get('rate')} {b.get('unit') or ''}")
            for v in (d.get("vessels") or [])[:6]:
                if v.get("count"):
                    ln.append(f"- Skip {v.get('segment')}: {v.get('count')}")
            dv = d.get("dividend") or {}
            if dv.get("per_share") is not None:
                ln.append(f"- Utbytte per aksje {dv.get('per_share')} {dv.get('unit') or ''}. {dv.get('note') or ''}")
            if d.get("fleet"):
                ln.append(f"- Flåte: {d['fleet']}")
            if d.get("outlook"):
                ln.append(f"- Utsikter: {d['outlook']}")
            lines += ln
        cur.execute("SELECT data FROM fundamentals WHERE symbol = %s", (sym,))
        f = cur.fetchone()
        if f and f[0]:
            info = f[0].get("info") or {}
            divs = [d for d in (f[0].get("dividends") or []) if d.get("value")][-8:]
            if info.get("sharesOutstanding"):
                lines.append(f"\nAntall aksjer: {info['sharesOutstanding']:,.0f}. Regnskapsvaluta: {info.get('financialCurrency') or 'ukjent'}.")
            if divs:
                lines.append("Utbytter (dato: beløp per aksje): " + ", ".join(f"{d['date']}: {d['value']}" for d in divs))
    return "\n".join(lines)


def weekly(series: list[tuple[date, float]]) -> dict[str, float]:
    """Siste sluttkurs per ISO-uke."""
    out = {}
    for d, v in series:
        y, w, _ = d.isocalendar()
        out[f"{y}-{w:02d}"] = v
    return out


def returns(w: dict[str, float]) -> dict[str, float]:
    ks = sorted(w)
    return {ks[i]: w[ks[i]] / w[ks[i - 1]] - 1 for i in range(1, len(ks)) if w[ks[i - 1]] > 0}


def corr(a: list[float], b: list[float]) -> float | None:
    if len(a) < 20:
        return None
    try:
        return statistics.correlation(a, b)
    except statistics.StatisticsError:
        return None


def price_series(conn, sym: str, days: int = 760) -> list[tuple[date, float]]:
    with conn.cursor() as cur:
        cur.execute("SELECT day, close FROM price_daily WHERE symbol = %s AND day > now() - make_interval(days => %s) ORDER BY day",
                    (sym, days))
        return [(d, float(v)) for d, v in cur.fetchall() if v]


def pattern_note(conn, sym: str) -> dict | None:
    """Mønstre regnet ut fra kursdataene. Ingen KI, så alle tall er eksakte for perioden."""
    c = next(x for x in COMPANIES if x["symbol"] == sym)
    s = price_series(conn, sym)
    if len(s) < 120:
        return None
    closes = [v for _, v in s]
    daily = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes)) if closes[i - 1] > 0]
    vol = statistics.pstdev(daily) * math.sqrt(252)
    peak, mdd = closes[0], 0.0
    for v in closes:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    big_up = sum(1 for r in daily if r > 0.05)
    big_dn = sum(1 for r in daily if r < -0.05)
    pts = [f"Periode {s[0][0]} til {s[-1][0]} ({len(s)} handelsdager).",
           f"Årlig svingning (volatilitet): {vol * 100:.0f} %. Typisk dagsbevegelse: {statistics.pstdev(daily) * 100:.1f} %.",
           f"Største fall fra topp i perioden: {mdd * 100:.0f} %.",
           f"Dager med over +5 %: {big_up}. Dager med under −5 %: {big_dn}."]
    sw = returns(weekly(s))
    for fac, lab in (("BWET", "tankfrakt (BWET)"), ("BDRY", "tørrbulkfrakt (BDRY)"), ("BZ=F", "Brent"), ("OSEBX.OL", "Oslo Børs (OSEBX)")):
        fw = returns(weekly(price_series(conn, fac)))
        ks = sorted(set(sw) & set(fw))
        r0 = corr([sw[k] for k in ks], [fw[k] for k in ks])
        # Ledende sammenheng: faktorens uke mot aksjens neste uke
        nxt = [(fw[ks[i]], sw[ks[i + 1]]) for i in range(len(ks) - 1)]
        r1 = corr([a for a, _ in nxt], [b for _, b in nxt])
        if r0 is not None:
            beta = r0 * statistics.pstdev([sw[k] for k in ks]) / statistics.pstdev([fw[k] for k in ks]) if statistics.pstdev([fw[k] for k in ks]) else 0
            pts.append(f"Ukesammenheng med {lab}: korrelasjon {r0:.2f}, beta {beta:.2f} (aksjen beveget seg i snitt {beta:.2f} % når {lab} beveget seg 1 %)"
                       + (f". Faktorens uke mot aksjens neste uke: korrelasjon {r1:.2f}" if r1 is not None else "") + ".")
    # Reaksjon på kvartalsrapporter: kursendring fra dagen før til dagen etter rapportdatoen
    with conn.cursor() as cur:
        cur.execute("""SELECT DISTINCT published::date FROM announcements WHERE symbol = %s AND kind = 'Rapport'
                       AND published > now() - interval '760 days'""", (sym,))
        rdays = sorted(r[0] for r in cur.fetchall())
    idx = {d: i for i, (d, _) in enumerate(s)}
    moves = []
    for d in rdays:
        i = next((idx[d + timedelta(days=k)] for k in range(0, 4) if d + timedelta(days=k) in idx), None)
        if i and i + 1 < len(s) and i >= 1:
            moves.append(s[i + 1][1] / s[i - 1][1] - 1)
    if len(moves) >= 2:
        pts.append(f"Rundt {len(moves)} rapportdatoer: snittendring {statistics.mean(moves) * 100:+.1f} %, snitt absolutt bevegelse "
                   f"{statistics.mean(abs(m) for m in moves) * 100:.1f} % (dagen før til dagen etter).")
    # Utbyttedager: fall på eks-dagen mot utbyttet
    with conn.cursor() as cur:
        cur.execute("SELECT data->'dividends' FROM fundamentals WHERE symbol = %s", (sym,))
        r = cur.fetchone()
    divs = [d for d in ((r[0] if r else None) or []) if d.get("value")]
    drops = []
    for d in divs:
        try:
            dd = date.fromisoformat(str(d["date"])[:10])
        except ValueError:
            continue
        if dd in idx and idx[dd] >= 1:
            i = idx[dd]
            drops.append((s[i][1] / s[i - 1][1] - 1, d["value"] / s[i - 1][1]))
    if len(drops) >= 2:
        pts.append(f"På {len(drops)} eks-utbyttedager falt kursen i snitt {statistics.mean(a for a, _ in drops) * 100:+.1f} %, mot et utbytte på "
                   f"i snitt {statistics.mean(b for _, b in drops) * 100:.1f} % av kursen (utbyttet kan være i annen valuta enn kursen).")
    # Måned for måned (svakt grunnlag med under tre år data)
    by_m: dict[int, list[float]] = {}
    mon = {}
    for d, v in s:
        mon[(d.year, d.month)] = v
    ks = sorted(mon)
    for i in range(1, len(ks)):
        by_m.setdefault(ks[i][1], []).append(mon[ks[i]] / mon[ks[i - 1]] - 1)
    names = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"]
    if len(by_m) >= 10:
        best = max(by_m.items(), key=lambda kv: statistics.mean(kv[1]))
        worst = min(by_m.items(), key=lambda kv: statistics.mean(kv[1]))
        pts.append(f"Beste måned i perioden: {names[best[0] - 1]} ({statistics.mean(best[1]) * 100:+.1f} % i snitt, {len(best[1])} år). "
                   f"Svakeste: {names[worst[0] - 1]} ({statistics.mean(worst[1]) * 100:+.1f} %). Bare {len(best[1])} år med data, så dette er et svakt mønster.")
    body = (f"Utregnet fra kursene til {c['name']} (sluttkurs i NOK, ikke justert for utbytte). Viser hvordan aksjen har oppført seg, "
            f"ikke hva den vil gjøre.\n\n" + "\n".join(f"- {p}" for p in pts))
    return {"url": f"intern:mønster:{sym}", "kind": "mønster", "topic": "mønster", "title": f"Kursmønstre: {c['name']}", "body": body,
            "facts": {"points": pts}, "symbols": [sym], "source_title": "Egne kursdata (Yahoo Finance)", "model": "utregnet",
            "checked": 0, "unverified": 0, "chars": len(s)}


def market_pattern(conn) -> dict | None:
    rows = []
    fw = {f: returns(weekly(price_series(conn, f))) for f in ("BWET", "BDRY", "OSEBX.OL")}
    for c in COMPANIES:
        sw = returns(weekly(price_series(conn, c["symbol"])))
        vals = []
        for f in ("BWET", "BDRY", "OSEBX.OL"):
            ks = sorted(set(sw) & set(fw[f]))
            vals.append(corr([sw[k] for k in ks], [fw[f][k] for k in ks]))
        rows.append((c["name"], c["segment"], *vals))
    rows = [r for r in rows if r[2] is not None]
    if len(rows) < 5:
        return None
    pts = ["Korrelasjon på ukeavkastning siste to år (1 = beveger seg helt likt, 0 = ingen sammenheng)."]
    for lab, i in (("tankfrakt (BWET)", 2), ("tørrbulkfrakt (BDRY)", 3), ("Oslo Børs (OSEBX)", 4)):
        top = sorted((r for r in rows if r[i] is not None), key=lambda r: -r[i])[:4]
        pts.append(f"Følger {lab} mest: " + ", ".join(f"{r[0]} {r[i]:.2f}" for r in top) + ".")
    pts += [f"{r[0]} ({r[1]}): BWET {r[2]:.2f}, BDRY {r[3]:.2f}, OSEBX {r[4]:.2f}" for r in rows if r[3] is not None and r[4] is not None]
    body = "Utregnet fra egne kursdata. Hvilke aksjer som følger fraktratene og børsen tettest.\n\n" + "\n".join(f"- {p}" for p in pts)
    return {"url": "intern:mønster:marked", "kind": "mønster", "topic": "mønster", "title": "Kursmønstre: hvem følger fraktratene",
            "body": body, "facts": {"points": pts}, "symbols": [], "source_title": "Egne kursdata (Yahoo Finance)", "model": "utregnet",
            "checked": 0, "unverified": 0, "chars": 0}


def events_material(conn, seg: str) -> str:
    pat = SEG_WORDS[seg]
    out = []
    with conn.cursor() as cur:
        cur.execute("""SELECT published::date, title, source, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 300)) FROM news
                       WHERE published > now() - interval '30 days' AND body_status IS DISTINCT FROM 'blocked'
                       AND (title ~* %s OR coalesce(summary, '') ~* %s) ORDER BY published DESC LIMIT 60""", (pat, pat))
        out += [f"- {d} {t} ({s}): {(x or '').strip()}" for d, t, s, x in cur.fetchall()]
        try:
            cur.execute("""SELECT published::date, broker, data FROM broker_reports WHERE status = 'ok' AND published > now() - interval '30 days'
                           ORDER BY published DESC LIMIT 30""")
            for d, b, data in cur.fetchall():
                segs = [s for s in (data or {}).get("segments") or [] if re.search(pat, json.dumps(s, ensure_ascii=False), re.I)]
                if segs:
                    out.append(f"- {d} megler {b}: " + "; ".join(f"{s.get('segment')} {s.get('direction')}: {s.get('comment') or ''}" for s in segs[:4]))
        except Exception:  # noqa: BLE001
            conn.rollback()
    return "\n".join(out)


SYN_PROMPT = """Du skriver et sammenfattende notat på norsk bokmål til en privat shippingterminal: «{title}».
Leseren handler shippingaksjer på Oslo Børs og holder dem fra 1 dag til 1 måned. Bygg BARE på notatene under (de er lest fra kilder
tidligere). Ikke finn på tall. Ingen kjøps- eller salgsråd og ingen kursmål. Gjør det praktisk: hva man ser etter, i hvilken rekkefølge,
og hvilke feil man skal unngå.

Svar KUN med JSON:
{{"title": "{title}", "topic": "syntese", "summary": "2–3 setninger",
 "points": ["8–14 konkrete punkter (fremgangsmåte, sammenhenger, sjekkpunkter)"],
 "trading": ["2–5 punkter om hva dette betyr for kortsiktig handel i shippingaksjer"], "tags": []}}

NOTATER:
{text}"""


def synthesize() -> int:
    done = 0
    for title, q in SYNTHESES:
        with db.connect() as c:
            notes = search(c, q, limit=10)
        notes = [n for n in notes if not n[2].startswith("intern:syntese:")]
        if len(notes) < 4:
            continue
        material = "\n\n".join(f"### {t}\n{b[:1400]}" for t, b, _ in notes)[:14000]
        try:
            raw, model = ai.chat(SYN_PROMPT.format(title=title, text=material), PURPOSE, 1800, json_mode=True, temperature=0.2,
                                 local_ok=False)
            data = parse_json(raw)
        except Exception as e:  # noqa: BLE001
            print(f"  ! sammenfatning {title}: {str(e)[:120]}")
            continue
        pool = numbers_in(material)
        points, c1, d1 = checked_points(data.get("points") or [], pool)
        trading, c2, d2 = checked_points(data.get("trading") or [], pool)
        if not points:
            continue
        body = (data.get("summary") or "") + "\n\n" + "\n".join(f"- {p}" for p in points)
        if trading:
            body += "\n\nBetydning for shippingaksjer:\n" + "\n".join(f"- {p}" for p in trading)
        body += "\n\nBygger på: " + "; ".join(t for t, _, _ in notes)
        url = "intern:syntese:" + re.sub(r"[^a-zæøå0-9]+", "-", title.lower()).strip("-")
        with db.connect() as c, c.cursor() as cur:
            cur.execute("INSERT INTO kb_sources (url, kind, title, priority) VALUES (%s, 'syntese', %s, 9) ON CONFLICT (url) DO NOTHING",
                        (url, title))
            c.commit()
        save_note({"url": url, "kind": "syntese", "topic": "syntese", "title": title, "body": body.strip(),
                   "facts": {"points": points, "trading": trading, "based_on": [u for _, _, u in notes]}, "symbols": [],
                   "source_title": "Sammenfatning av notater i kunnskapsbanken", "model": model, "checked": c1 + c2,
                   "unverified": d1 + d2, "chars": len(material)})
        done += 1
        print(f"  ✓ Sammenfatning: {title} ({len(points)} punkter, {d1 + d2} fjernet)")
    return done


# ---------------------------------------------------------------- jobben
def process(url: str, kind: str, title: str) -> dict | None:
    # Databasen brukes bare i korte tilkoblinger: KI-en kan bruke minutter, og Neon lukker tilkoblinger som står ubrukt.
    if url.startswith("intern:mønster:"):
        sym = url.split(":", 2)[2]
        with db.connect() as conn:
            return market_pattern(conn) if sym == "marked" else pattern_note(conn, sym)
    if url.startswith("intern:selskap:"):
        sym = url.split(":", 2)[2]
        c = next(x for x in COMPANIES if x["symbol"] == sym)
        with db.connect() as conn:
            text = company_material(conn, sym)
        wiki = next((t for t, _ in WIKI_TITLES if t.lower().startswith(c["name"].lower().split(" ")[0].lower())), None)
        if wiki:
            try:
                wt, _ = wiki_text(wiki)
                text += "\n\nFra Wikipedia:\n" + wt[:5000]
            except Exception:  # noqa: BLE001
                pass
        if len(text) < 300:
            return None
        n = write_note(f"{c['name']}: selskapsprofil", text, "selskap", url, "Kvartalsrapporter lest av KI, Yahoo og Wikipedia", "selskap", [sym])
        n["title"] = f"Selskapsprofil: {c['name']}"
        return n
    if url.startswith("intern:hendelser:"):
        seg = url.split(":", 2)[2]
        with db.connect() as conn:
            text = events_material(conn, seg)
        if len(text) < 300:
            return None
        n = write_note(f"Hva har skjedd siste 30 dager: {seg}", text, "hendelser", url, "Nyheter og meglerrapporter i terminalen", "hendelser")
        n["title"] = f"Siste 30 dager: {seg} ({date.today():%d.%m.%Y})"
        return n
    if url.startswith("wikisearch:"):
        _, lang, q = url.split(":", 2)
        titles = wiki_search(q)
        now = q in NOW_QUERIES
        with db.connect() as c, c.cursor() as cur:
            cur.execute("SELECT priority FROM kb_sources WHERE url = %s", (url,))
            prio = (cur.fetchone() or [2])[0]
            for t in titles:
                cur.execute("""INSERT INTO kb_sources (url, kind, title, topic, priority) VALUES (%s, 'begrep', %s, %s, %s)
                               ON CONFLICT (url) DO UPDATE SET priority = least(kb_sources.priority, EXCLUDED.priority),
                                 topic = coalesce(EXCLUDED.topic, kb_sources.topic)""",
                            (f"wiki:{lang}:{t}", t, "nå" if now else None, prio))
            cur.execute("UPDATE kb_sources SET status = 'done', done_at = now(), error = %s WHERE url = %s",
                        (("fant: " + "; ".join(titles))[:300], url))
            c.commit()
        print(f"  · søk «{q}»: {', '.join(titles) or 'ingen treff'}")
        return "expanded"
    if url.startswith("sec:"):
        t = url.split(":", 1)[1]
        text, link, what = sec_industry(t)
        n = write_note(f"Markedet ifølge årsrapporten til {t} ({what})", text, "rapport", url, f"SEC EDGAR {t} {what}",
                       "shippingtrading", max_chunks=8)
        n["facts"]["link"] = link
        return n
    if url.startswith("arxiv:"):
        q = url.split(":", 1)[1]
        text, link = arxiv_text(q)
        if len(text) < 500:
            return None
        n = write_note(f"Forskning om {q}", text, "forskning", url, f"arXiv: {q}", "shippingtrading", max_chunks=2)
        n["facts"]["link"] = link
        return n
    if url.startswith("wiki:"):
        _, lang, t = url.split(":", 2)
        text, link = wiki_text(t, lang)
        if len(text) < 500:
            return None
        n = write_note(t, text, kind, url, f"Wikipedia: {t}")
        n["facts"]["link"] = link
        return n
    text = web_text(url)
    if len(text) < 500:
        return None
    mc = next((m for u, _, _, m in WORLD_DOCS if u == url), MAX_CHUNKS)
    n = write_note(title, text, kind, url, title, max_chunks=mc)
    n["facts"]["link"] = url
    return n


def run(conn, minutes: float = 30) -> int:
    """Leser kilder i køen til tiden er brukt opp. Den lokale modellen brukes, så skykvotene ikke røres."""
    t0 = time.time()
    budget = minutes * 60
    pending = seed(conn)
    prune(conn)
    size = db_bytes(conn)
    conn.commit()
    conn.close()  # lesingen tar timer; videre brukes korte tilkoblinger (run.py tåler at denne er lukket)
    if not ai.local_ready(wait_s=600):
        raise ai.MissingKey("Den lokale modellen startet ikke (Ollama). Kunnskapsbanken venter til neste kjøring.")
    print(f"  Kunnskapsbank: {pending} kilder i kø. Database {size / 1e6:.0f} MB av {LIMIT_MB:.0f} MB "
          f"(tak {CAP:.0%} = {CAP * LIMIT_MB:.0f} MB). Leser i {minutes:.0f} minutter med {ai.LOCAL_MODEL}.")
    done = failed = skipped = expanded = 0
    # Sammenfatninger og ukens samfunnsrapport skrives bare med Groq (lørdager): når den beste modellen er tom for kvote,
    # eller mot slutten av tiden. Den lokale modellen skriver dem ikke, fordi de er viktige og tallrike.
    synth_at = budget - min(1500, budget * 0.15)
    synthesized = not ai.knowledge_day()
    while time.time() - t0 < budget - 120:
        best_empty = ("groq", "openai/gpt-oss-120b") in ai._exhausted
        if not synthesized and done >= 5 and (best_empty or time.time() - t0 > synth_at):
            synthesized = True
            print(f"  Skriver sammenfatninger ({len(SYNTHESES)} temaer) og ukens samfunnsrapport …")
            try:
                done += synthesize()
                import society

                done += society.run()
            except Exception as e:  # noqa: BLE001
                print(f"  ! Sammenfatninger/samfunnsrapport: {str(e)[:200]}")
            continue
        with db.connect() as c:
            if not room(c):
                print(f"  Stopper: databasen er nær {CAP:.0%} av grensen ({db_bytes(c) / 1e6:.0f} MB).")
                break
            with c.cursor() as cur:
                # Den lokale modellen leser bare nye kilder (og egne data). Notater som finnes, skrives bare om med Groq.
                cur.execute("""SELECT url, kind, title FROM kb_sources s WHERE status = 'pending' AND tries < 2
                               AND (%s = false OR url LIKE 'intern:%%' OR NOT EXISTS (SELECT 1 FROM knowledge k WHERE k.url = s.url))
                               ORDER BY priority, added LIMIT 1""", (local_next(),))
                row = cur.fetchone()
            if not row and expanded < 1:
                expanded += 1
                print(f"  Hovedlisten er lest. La til {expand_categories(c)} artikler fra Wikipedia-kategorier.")
                continue
        if not row:
            print("  Ingen flere kilder i køen.")
            break
        url, kind, title = row
        t1 = time.time()
        try:
            note = process(url, kind, title)
            if note == "expanded":
                continue
            if note is None:
                mark(url, "skip", "for lite tekst")
                skipped += 1
                continue
            save_note(note)
            done += 1
            print(f"  ✓ {note['title'][:70]} [{note['topic']}] {len(note['body'])} tegn, "
                  f"{note['unverified']} punkter fjernet, {time.time() - t1:.0f} s")
            first = next((ln[2:] for ln in note["body"].splitlines() if ln.startswith("- ")), "")
            if first:
                print(f"      f.eks.: {first[:160]}")
        except ai.RateLimited as e:
            print(f"  ! {e}")
            break
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ! {title}: {str(e)[:160]}")
            mark(url, "error" if "404" in str(e) else "pending", str(e))
        if url.startswith(("wiki:", "http")):
            time.sleep(1)
    with db.connect() as c:
        print(f"  Ferdig: {done} notater lagret, {skipped} hoppet over, {failed} feil på {(time.time() - t0) / 60:.0f} min. "
              f"Kunnskapsbanken bruker {kb_bytes(c) / 1e6:.1f} MB, databasen {db_bytes(c) / 1e6:.0f} MB.")
    return done


# ---------------------------------------------------------------- søk (brukes av morgenrapporten)
def search(conn, text: str, limit: int = 5, kinds: tuple[str, ...] | None = None) -> list[tuple[str, str, str]]:
    words = list(dict.fromkeys(w.lower() for w in re.findall(r"[A-Za-zÆØÅæøå][A-Za-zÆØÅæøå0-9-]{2,}", text)))[:40]
    if not words:
        return []
    q = " | ".join(re.sub(r"[^a-zæøå0-9]", "", w) for w in words if re.sub(r"[^a-zæøå0-9]", "", w))
    try:
        with conn.cursor() as cur:
            cur.execute(f"""SELECT title, body, url FROM knowledge, to_tsquery('norwegian', %s) q
                            WHERE tsv @@ q {"AND kind = ANY(%s)" if kinds else ""}
                            ORDER BY ts_rank_cd(tsv, q) DESC LIMIT %s""", (q, list(kinds), limit) if kinds else (q, limit))
            return cur.fetchall()
    except Exception:  # noqa: BLE001 - tabellen finnes ikke ennå
        conn.rollback()
        return []


def get(conn, url: str) -> list[tuple[str, str, str]]:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT title, body, url FROM knowledge WHERE url = %s ORDER BY created_at DESC LIMIT 1", (url,))
            return cur.fetchall()
    except Exception:  # noqa: BLE001
        conn.rollback()
        return []
