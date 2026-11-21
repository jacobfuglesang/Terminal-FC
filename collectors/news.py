"""Nyheter for laksesektoren: RSS → filter → kategori og selskap → (valgfritt) KI-sammendrag.

Kilder som er testet fra GitHub: iLaks, regjeringen.no og Google Nyheter-søk
(som også fanger DN, E24, Salmon Business, Fish Farming Expert m.fl.).
Analytikeranbefalinger og kursmål stoppes alltid.

KI-sammendrag lages bare hvis hemmeligheten GROQ_API_KEY finnes. Ellers brukes utdraget fra kilden.
"""
import hashlib
import html
import os
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests

UA = {"User-Agent": "Mozilla/5.0 (FUGLESANG; privat nyhetsleser)"}
G_NO = "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q="
G_EN = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="

# (navn, url, krever-relevans-filter)
FEEDS = [
    ("iLaks", "https://ilaks.no/feed/", False),
    ("Regjeringen", "https://www.regjeringen.no/no/rss/Rss/2581966/", True),
    ("Google Nyheter", G_NO + "lakseoppdrett+OR+havbruk+OR+lakseaksjer+OR+laksepris+when:3d", False),
    ("Google Nyheter", G_NO + "Mowi+OR+SalMar+OR+Bakkafrost+OR+Ler%C3%B8y+OR+%22Grieg+Seafood%22+when:3d", False),
    ("Google Nyheter", G_NO + "site:dn.no+laks+OR+oppdrett+OR+havbruk+when:7d", False),
    ("Google Nyheter", G_NO + "site:e24.no+laks+OR+oppdrett+OR+havbruk+when:7d", False),
    ("Google News", G_EN + "%22salmon+farming%22+OR+%22salmon+prices%22+OR+Mowi+OR+Bakkafrost+when:3d", False),
]

COMPANIES = {
    "MOWI.OL": [r"\bmowi\b", r"\bmarine harvest\b"],
    "SALM.OL": [r"\bsalmar\b"],
    "BAKKA.OL": [r"\bbakkafrost\b"],
    "LSG.OL": [r"\bler[øo]y\b"],
    "GSF.OL": [r"\bgrieg seafood\b", r"\bgrieg\b"],
}

# Stoppes alltid: anbefalinger og kursmål
BLOCK = re.compile(
    r"kursm[åa]l|kj[øo]psanbefal|salgsanbefal|anbefal\w* (?:kj[øo]p|salg|hold)|oppgrader\w*|nedgrader\w*|"
    r"\bfra (?:hold|kj[øo]p|selg|salg) til\b|price target|target price|\bupgrade[sd]?\b|\bdowngrade[sd]?\b|"
    r"buy rating|sell rating|overweight|underweight|outperform|underperform",
    re.I,
)

# Relevans (brukes for brede strømmer som regjeringen.no)
RELEVANT = re.compile(
    r"laks|havbruk|oppdrett|akvakultur|sj[øo]mat|fiskeri|fiskeoppdrett|lakselus|grunnrente|trafikklys|"
    r"fiskehelse|mattilsynet|fiskeridirektorat|salmon|aquaculture|seafood",
    re.I,
)

CATEGORIES = [
    ("Politikk", r"regjering|departement|storting|minister|statsr[åa]d|h[øo]ring|melding|regulering|grunnrente|skatt|"
                 r"trafikklys|auksjon|lov\b|forskrift|politikk|parti|budsjett|government|parliament|tax"),
    ("Toll og handel", r"\btoll\b|tariff|sanksjon|handelsavtale|markedsadgang|\beksport\w*|import\w*|\bkina\b|\busa\b|\beu\b|trump|trade|export"),
    ("Biologi", r"\blus|lakselus|sykdom|\bila\b|\bpd\b|d[øo]delighet|r[øo]mming|alge|maneter|vaksine|smitte|fiskehelse|villaks|"
                r"lice|disease|mortality|escape"),
    ("Selskap", r"kvartal|resultat|rapport|b[øo]rsmelding|utbytte|oppkj[øo]p|kj[øo]per|fusjon|emisjon|konkurs|toppsjef|konsernsjef|"
                r"ansetter|quarter|earnings|acquisition|ceo"),
    ("Marked", r"pris|spotpris|ettersp[øo]rsel|tilbud|volum|slakt|marked|price|demand|supply"),
]


def _clean(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _split_source(title: str, source: str | None) -> tuple[str, str | None]:
    """Google Nyheter legger « - Kilde» bakerst i tittelen."""
    if source and title.endswith(f" - {source}"):
        return title[: -len(source) - 3].strip(), source
    m = re.match(r"^(.*) - ([^-]{2,40})$", title)
    if m and not source:
        return m.group(1).strip(), m.group(2).strip()
    return title, source


def _key(title: str) -> str:
    t = re.sub(r"\(\+\)|[^\wæøå ]", " ", title.lower())
    return re.sub(r"\s+", " ", t).strip()[:90]


def _published(e) -> datetime:
    for k in ("published", "updated"):
        if e.get(k):
            try:
                d = parsedate_to_datetime(e[k])
                return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                pass
    return datetime.now(timezone.utc)


def categorize(text: str) -> str:
    for name, pat in CATEGORIES:
        if re.search(pat, text, re.I):
            return name
    return "Marked"


def companies(text: str) -> list[str]:
    return [sym for sym, pats in COMPANIES.items() if any(re.search(p, text, re.I) for p in pats)]


def collect() -> tuple[list[dict], int]:
    items, blocked, seen = [], 0, set()
    for feed_name, url, needs_relevance in FEEDS:
        try:
            r = requests.get(url, headers=UA, timeout=(10, 25))
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"  ! {feed_name}: {e}")
            continue
        parsed = feedparser.parse(r.content)
        for e in parsed.entries:
            src = e.get("source", {}).get("title") if isinstance(e.get("source"), dict) else None
            title, src = _split_source(_clean(e.get("title", "")), src)
            excerpt = _clean(e.get("summary", ""))
            if excerpt.lower().startswith(title.lower()[:40]) or "news.google.com" in url:
                excerpt = ""  # Google gir bare tittelen på nytt
            text = f"{title} {excerpt}"
            if not title:
                continue
            if needs_relevance and not RELEVANT.search(text):
                continue
            if BLOCK.search(text):
                blocked += 1
                continue
            key = _key(title)
            if key in seen:
                continue
            seen.add(key)
            link = e.get("link", "")
            items.append({
                "id": hashlib.sha1(key.encode()).hexdigest()[:20],
                "title_key": key,
                "title": title[:400],
                "url": link,
                "source": (src or feed_name)[:80],
                "published": _published(e),
                "excerpt": excerpt[:600],
                "category": categorize(text),
                "companies": companies(text),
                "feed": feed_name,
            })
    return items, blocked


def ai_summary(item: dict) -> str | None:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    model = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
    prompt = (
        "Skriv et nøytralt sammendrag på norsk bokmål, maks to korte setninger, av nyhetssaken under. "
        "Bruk bare informasjonen som står der, ikke finn på tall eller fakta, og gi ingen kjøps- eller salgsråd. "
        "Hvis det er for lite informasjon, forklar kort hva saken handler om ut fra tittelen.\n\n"
        f"Tittel: {item['title']}\nKilde: {item['source']}\nUtdrag: {item['excerpt'] or '(ingen)'}"
    )
    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.2, "max_tokens": 160},
            timeout=30,
        )
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"].strip()
        return text[:500] or None
    except Exception as e:  # noqa: BLE001
        print(f"  ! KI-sammendrag feilet: {e}")
        return None


def run(conn, max_ai: int = 40) -> int:
    items, blocked = collect()
    new = 0
    ai_done = 0
    with conn.cursor() as cur:
        for it in items:
            cur.execute("SELECT 1 FROM news WHERE id = %s", (it["id"],))
            if cur.fetchone():
                continue
            summary = None
            if ai_done < max_ai:
                summary = ai_summary(it)
                ai_done += 1 if summary else 0
            cur.execute(
                """INSERT INTO news (id, title_key, title, url, source, published, excerpt, summary, category, companies, feed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (it["id"], it["title_key"], it["title"], it["url"], it["source"], it["published"], it["excerpt"],
                 summary, it["category"], it["companies"], it["feed"]),
            )
            new += 1
        cur.execute("DELETE FROM news WHERE published < now() - interval '90 days'")
        cur.execute(
            """INSERT INTO news_blocked (day, n) VALUES (CURRENT_DATE, %s)
               ON CONFLICT (day) DO UPDATE SET n = GREATEST(news_blocked.n, EXCLUDED.n)""",
            (blocked,),
        )
    conn.commit()
    print(f"  Nyheter: {len(items)} relevante, {new} nye, {ai_done} med KI-sammendrag, {blocked} anbefalinger stoppet")
    return new
