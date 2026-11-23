"""Ukentlige meglerrapporter (shipbrokers) lest av KI.

Hellenic Shipping News publiserer mange meglerhusenes ukentlige markedsrapporter (Intermodal, Banchero Costa,
Lion Shipbrokers, Affinity, Allied, Xclusiv m.fl.). Vi henter titlene fra RSS, leser teksten og lar KI lage et
kort norsk sammendrag per segment. Selve rapportteksten lagres ikke; vi viser sammendraget og lenker til kilden.
Nettstedet ber om minst 30 sekunder mellom forespørsler, så vi leser få rapporter per kjøring.
"""
import json
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import requests

import ai
import db

UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)"}
FEEDS = [
    "https://www.hellenicshippingnews.com/?s=%22weekly+market+report%22&feed=rss2",
    "https://www.hellenicshippingnews.com/category/report-analysis/feed/",
]
WEEKLY = re.compile(r"weekly|week\s*\d|wk\s*\d|market report|market insight|market update|tanker report|dry bulk report", re.I)
SKIP = re.compile(r"index week|assessment index|newbuilding prices only|podcast|webinar|interview", re.I)
CRAWL_DELAY = 31
MissingKey = ai.MissingKey

PROMPT = """Du leser en ukentlig markedsrapport fra et meglerhus i shipping. Lag et nøkternt sammendrag på norsk bokmål
for en privatinvestor som holder shippingaksjer fra en dag til en måned.

REGLER:
- Bruk bare det som står i teksten. Skriv tall nøyaktig som i teksten, med enhet. Ikke regn ut noe selv.
- Ingen kjøps- eller salgsråd. Ikke gjengi kursmål eller anbefalinger om aksjer.
- Alle tekstfelt på norsk bokmål (skipstyper og rutekoder som VLCC, TD3C, C5 kan stå som i teksten).

Svar KUN med gyldig JSON:
{{
 "broker": "navnet på meglerhuset",
 "week": "uke og år hvis oppgitt, ellers null",
 "headline": "én setning om det viktigste denne uken",
 "sentiment": "positiv | nøytral | negativ | blandet (for fraktmarkedet samlet)",
 "summary": ["3–5 korte punkter"],
 "segments": [{{"segment": "f.eks. VLCC, Suezmax, Aframax, MR, Capesize, Panamax, Supramax, Container, LPG, LNG",
               "direction": "opp | ned | flat | blandet",
               "comment": "én setning",
               "rates": [{{"label": "rute eller indeks, f.eks. TD3C MEG-Kina", "value": 85.5, "unit": "WS | USD/dag | USD/tonn | poeng"}}]}}],
 "sale_purchase": "én setning om kjøp og salg av brukte skip og priser, eller null",
 "newbuilding": "én setning om nybygg, eller null",
 "demolition": "én setning om opphugging/skraping, eller null"
}}

TITTEL: {title}
TEKST:
{text}"""


def discover(conn) -> int:
    seen, added = set(), 0
    with conn.cursor() as cur:
        for url in FEEDS:
            try:
                r = requests.get(url, headers=UA, timeout=30)
                items = re.findall(r"<item>.*?<title>(.*?)</title>.*?<link>(.*?)</link>.*?<pubDate>(.*?)</pubDate>", r.text, re.S)
            except Exception as e:  # noqa: BLE001
                print(f"  ! RSS {url[:60]}: {e}")
                continue
            for title, link, pub in items:
                title = re.sub(r"<!\[CDATA\[|\]\]>", "", title).replace("&#8211;", "–").replace("&#038;", "&").replace("&#8217;", "’").strip()
                link = link.strip()
                if link in seen or not WEEKLY.search(title) or SKIP.search(title):
                    continue
                seen.add(link)
                try:
                    published = parsedate_to_datetime(pub.strip())
                except Exception:  # noqa: BLE001
                    published = datetime.now(timezone.utc)
                if (datetime.now(timezone.utc) - published).days > 21:
                    continue
                broker = re.split(r"\s[–-]\s|weekly|Weekly|WEEKLY|market report|Market Report|,", title)[0].strip()[:60]
                cur.execute("""INSERT INTO broker_reports (url, title, broker, published) VALUES (%s,%s,%s,%s)
                               ON CONFLICT (url) DO NOTHING RETURNING url""", (link, title[:300], broker, published))
                added += 1 if cur.fetchone() else 0
            time.sleep(CRAWL_DELAY)  # nettstedet ber om 30 sekunder mellom forespørsler
    conn.commit()
    return added


def article_text(url: str) -> str:
    """Teksten i saken. Mange meglere legger rapporten som PDF; da leser vi PDF-en i stedet."""
    import trafilatura

    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    text = (trafilatura.extract(r.text, include_tables=True) or "").strip()
    if len(text) >= 400:
        return text
    pdfs = [u for u in re.findall(r'href="(https?://[^"]+\.pdf)"', r.text, re.I) if "hellenicshippingnews.com/wp-content" in u]
    if not pdfs:
        return text
    import io

    from pypdf import PdfReader

    time.sleep(CRAWL_DELAY)  # samme nettsted: vent før neste forespørsel
    p = requests.get(pdfs[0], headers=UA, timeout=60)
    if p.content[:4] != b"%PDF" or len(p.content) > 25_000_000:
        return text
    pages = [(pg.extract_text() or "") for pg in PdfReader(io.BytesIO(p.content)).pages[:12]]
    return (text + "\n\n" + "\n".join(pages)).strip()


def run(conn, backfill: bool = False, max_reports: int = 3, quick: bool = False) -> int:
    ai.require()
    # I raske kjøringer ser vi etter nye rapporter bare én gang i timen (det tar et minutt pga. pausene nettstedet ber om)
    added = discover(conn) if not quick or datetime.now(timezone.utc).minute < 15 else 0
    big = ai.has("big")
    limit = 6 if big else max_reports
    with conn.cursor() as cur:
        cur.execute("""SELECT url, title FROM broker_reports WHERE status = 'pending' AND tries < 3
                       ORDER BY published DESC LIMIT %s""", (limit,))
        todo = cur.fetchall()
        cur.execute("SELECT count(*) FROM broker_reports WHERE status = 'pending' AND tries < 3")
        queue = cur.fetchone()[0]
    conn.commit()
    print(f"  Meglerrapporter: {added} nye, {queue} i kø, leser {len(todo)} nå")

    def write(sql, params):
        with db.connect() as c2, c2.cursor() as cur:
            cur.execute(sql, params)
            c2.commit()

    done = 0
    for url, title in todo:
        write("UPDATE broker_reports SET tries = tries + 1 WHERE url = %s", (url,))
        try:
            text = article_text(url)
            time.sleep(CRAWL_DELAY)  # pause før neste forespørsel til samme nettsted
            if len(text) < 400:
                raise RuntimeError("Fant nesten ingen tekst (kan være bare en PDF-lenke eller et bilde)")
            text = text[:60000] if big else text[:12000]
            raw, model = ai.chat(PROMPT.format(title=title, text=text), "big" if big and len(text) > 12000 else "quality",
                                 1800, json_mode=True, temperature=0.1)
            m = re.search(r"\{.*\}", raw, re.S)
            data = json.loads(m.group(0)) if m else None
            if not data:
                raise RuntimeError("Svaret var ikke JSON")
            data["chars"] = len(text)
            write("UPDATE broker_reports SET status='ok', data=%s, model=%s, error=NULL WHERE url=%s",
                  (json.dumps(data, ensure_ascii=False), model, url))
            done += 1
            print(f"  ✓ {data.get('broker') or title[:40]}: {(data.get('headline') or '')[:110]}")
        except ai.RateLimited as e:
            write("UPDATE broker_reports SET tries = greatest(tries - 1, 0) WHERE url = %s", (url,))
            print(f"  ! {e}. Fortsetter neste kjøring.")
            break
        except Exception as e:  # noqa: BLE001
            write("UPDATE broker_reports SET error=%s, status = CASE WHEN tries >= 3 THEN 'error' ELSE 'pending' END WHERE url=%s",
                  (str(e)[:300], url))
            print(f"  ! {title[:60]}: {e}")
    with db.connect() as c2, c2.cursor() as cur:
        cur.execute("DELETE FROM broker_reports WHERE published < now() - interval '120 days'")
        c2.commit()
    return done
