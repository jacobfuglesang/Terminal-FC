"""Nyheter for shipping: RSS → filter → kategori og rederi → hel artikkel → KI-sammendrag.

Kilder testet fra GitHub: Splash247, Hellenic Shipping News, gCaptain, The Maritime Executive,
FreightWaves (maritim), Offshore Energy og Google Nyheter (TradeWinds, Lloyd's List, DN, E24 m.fl.).
Analytikeranbefalinger og kursmål stoppes alltid.
"""
import hashlib
import html
import os
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests

MAX_AGE_DAYS = 7  # nyheter eldre enn en uke slettes automatisk

UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat nyhetsleser)"}
G_NO = "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q="
G_EN = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="

# (navn, url, krever-relevans-filter)
HSN = "https://www.hellenicshippingnews.com"
FEEDS = [
    ("Splash247", "https://splash247.com/feed/", True),
    ("Hellenic Shipping News", HSN + "/feed/", True),
    ("Hellenic Shipping News", HSN + "/category/shipping-news/dry-bulk-market/feed/", False),
    ("Hellenic Shipping News", HSN + "/?s=tanker+report&feed=rss2", False),
    ("Hellenic Shipping News", HSN + "/?s=container+market&feed=rss2", True),
    ("gCaptain", "https://gcaptain.com/feed/", True),
    ("The Maritime Executive", "https://maritime-executive.com/articles.rss", True),
    ("FreightWaves", "https://www.freightwaves.com/news/category/news/maritime/feed", True),
    ("Google News", G_EN + "site:tradewindsnews.com+when:2d", True),
    ("Google News", G_EN + "site:lloydslist.com+when:2d", True),
    ("Google News", G_EN + "Frontline+OR+Hafnia+OR+%22Okeanis%22+OR+%22Wallenius+Wilhelmsen%22+OR+%22Hoegh+Autoliners%22+OR+%22BW+LPG%22+OR+%22CMB.TECH%22+when:3d", "company"),
    ("Google Nyheter", G_NO + "shipping+OR+rederi+OR+tankskip+OR+t%C3%B8rrbulk+OR+fraktrater+when:3d", True),
    ("Google Nyheter", G_NO + "site:dn.no+shipping+OR+rederi+when:7d", False),
    ("Google Nyheter", G_NO + "site:e24.no+shipping+OR+rederi+OR+tankskip+when:7d", False),
]

from universe import COMPANIES as _UNI  # noqa: E402

COMPANIES = {c["symbol"]: [c["news"]] for c in _UNI}
CONTEXT = {c["symbol"]: c["ctx"] for c in _UNI if c.get("ctx")}

# Stoppes alltid: anbefalinger og kursmål
BLOCK = re.compile(
    r"kursm[åa]l|kj[øo]psanbefal|salgsanbefal|anbefal\w* (?:kj[øo]p|salg|hold)|oppgrader\w*|nedgrader\w*|"
    r"\bfra (?:hold|kj[øo]p|selg|salg) til\b|price target|target price|\bupgrade[sd]?\b|\bdowngrade[sd]?\b|"
    r"buy rating|sell rating|overweight|underweight|outperform|underperform",
    re.I,
)

# Relevans: brede maritime strømmer har mye om offshore, marine og havner som ikke påvirker rederiene
RELEVANT = re.compile(
    r"\b(?:tankers?|vlccs?|suezmax\w*|aframax\w*|lr[12]s?|mr tankers?|dry bulk|bulkers?|bulk carriers?|capesize\w*|panamax\w*|"
    r"supramax\w*|ultramax\w*|kamsarmax\w*|newcastlemax\w*|containers?|container ?ships?|teu|feu|"
    r"freight|charter\w*|time ?charter|spot rates?|lng carriers?|lpg|vlgcs?|car carriers?|pctcs?|ro-?ro|shipping|shipowners?|"
    r"vessels?|ships?|fleet|newbuild\w*|orderbook|scrapping|demolition|hormuz|suez|red sea|houthis?|bab el|panama canal|"
    r"cape of good hope|shadow fleet|dark fleet|imo|eu ets|baltic dry|bdi|scfi|drewry|iron ore|seaborne|crude|opec|"
    r"rederi\w*|skipet|skipene|skipsfart|frakt\w*|tankskip\w*|bulkskip\w*|containerskip\w*|bilskip\w*|lasteskip\w*|verft\w*|"
    r"skyggeflåte\w*|sanksjon\w*)\b",
    re.I,
)

CATEGORIES = [
    ("Geopolitikk", r"hormuz|red sea|houthi|bab el|iran|israel|russia|ukrain|sanction|shadow fleet|dark fleet|war\b|attack|strike on|"
                    r"navy|missile|drone|mine\b|tariff|trump|china.*(?:port|fee)|ustr|sanksjon|krig|angrep|skyggeflåte|toll"),
    ("Tank", r"tanker|vlcc|suezmax|aframax|\blr[12]\b|\bmr\b|crude|product tanker|chemical tanker|tankskip|td3c|opec"),
    ("Tørrbulk", r"bulk|capesize|panamax|supramax|ultramax|kamsarmax|newcastlemax|baltic dry|\bbdi\b|iron ore|coal|grain|soybean|bulkskip"),
    ("Container", r"container|\bteu\b|\bfeu\b|liner|scfi|drewry|maersk|cma cgm|hapag|\bmsc\b|\bzim\b|blank sailing|containerskip"),
    ("Gass og bil", r"\blng\b|\blpg\b|vlgc|gas carrier|car carrier|pctc|ro-?ro|vehicle|bilskip"),
    ("Regulering og miljø", r"\bimo\b|eu ets|emission|decarbon|ammonia|methanol|fueleu|carbon|cii\b|green|utslipp|klima"),
    ("Selskap", r"quarter|results|earnings|dividend|buyback|acquisition|merger|ceo|kvartal|resultat|utbytte|oppkjøp|fusjon|toppsjef|"
                r"fleet|newbuild|sells|sale of|delivery|order"),
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


def _published(e) -> datetime | None:
    for k in ("published", "updated"):
        if e.get(k):
            try:
                d = parsedate_to_datetime(e[k])
                return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                pass
    for k in ("published_parsed", "updated_parsed"):
        if e.get(k):
            return datetime(*e[k][:6], tzinfo=timezone.utc)
    return None


def categorize(text: str) -> str:
    for name, pat in CATEGORIES:
        if re.search(pat, text, re.I):
            return name
    return "Marked og frakt"


def companies(text: str) -> list[str]:
    out = []
    for sym, pats in COMPANIES.items():
        if not any(re.search(p, text, re.I) for p in pats):
            continue
        if sym in CONTEXT and not re.search(CONTEXT[sym], text, re.I):
            continue
        out.append(sym)
    return out


def keep(text: str, rule) -> bool:
    """rule: True = må handle om shipping, False = kilden er ren shipping, "company" = må nevne et av rederiene."""
    if rule == "company":
        return bool(companies(text))
    return not rule or bool(RELEVANT.search(text))


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
            if not keep(text, needs_relevance):
                continue
            if BLOCK.search(text):
                blocked += 1
                continue
            key = _key(title)
            if key in seen:
                continue
            seen.add(key)
            pub = _published(e)
            if pub is None:
                continue  # uten dato kan saken ikke sorteres riktig
            link = e.get("link", "")
            items.append({
                "id": hashlib.sha1(key.encode()).hexdigest()[:20],
                "title_key": key,
                "title": title[:400],
                "url": link,
                "source": (src or feed_name)[:80],
                "published": pub,
                "excerpt": excerpt[:600],
                "category": categorize(text),
                "companies": companies(text),
                "feed": feed_name,
            })
    return items, blocked


# ---------- Hele artikkelen ----------
FETCH_UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.6",
}
# Nettsteder som stenger for automatisk henting (bruk utdraget fra strømmen)
NO_FETCH = re.compile(r"regjeringen\.no|theatlantic\.com", re.I)
# Kjente betalingsmurer: vi får bare ingressen
PAYWALL = re.compile(r"(^|\.)(dn\.no|altaposten\.no|vol\.no|ba\.no|bt\.no|aftenposten\.no|adressa\.no|intrafish\.no|fiskeribladet\.no|ft\.com|bloomberg\.com)$", re.I)


def resolve(url: str) -> str | None:
    """Finner lenken bak Google Nyheter. None betyr at Google ikke svarte (prøv igjen senere)."""
    if "news.google.com" not in url:
        return url
    try:
        from googlenewsdecoder import gnewsdecoder
        d = gnewsdecoder(url, interval=2)
        if d.get("status") or d.get("success"):
            return d.get("decoded_url") or None
        print(f"  ! Google Nyheter: {str(d.get('message'))[:120]}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! Klarte ikke å finne lenken bak Google Nyheter: {e}")
    return None


def fetch_article(url: str) -> dict:
    """Returnerer {final_url, body, status, image}. status: full, partial eller none."""
    import trafilatura
    from urllib.parse import urlparse

    final = resolve(url)
    if final is None:
        return {"final_url": url, "body": None, "status": "retry", "image": None}
    host = urlparse(final).hostname or ""
    if "news.google.com" in host or NO_FETCH.search(host):
        return {"final_url": final, "body": None, "status": "none", "image": None}
    try:
        r = requests.get(final, headers=FETCH_UA, timeout=(8, 20))
    except requests.RequestException:
        return {"final_url": final, "body": None, "status": "none", "image": None}
    if r.status_code != 200:
        return {"final_url": final, "body": None, "status": "none", "image": None}
    if "charset" not in (r.headers.get("content-type") or "").lower():
        r.encoding = "utf-8"
    page = r.text
    body = trafilatura.extract(page, favor_recall=True, include_comments=False, include_tables=False) or ""
    if "Enable JavaScript and cookies" in body or "confirming your site connection" in body:
        body = ""
    meta = trafilatura.extract_metadata(page)
    image = meta.image if meta and meta.image and meta.image.startswith("https://") else None
    body = body.strip()
    if not body:
        status = "none"
    elif PAYWALL.search(host) or len(body) < 900:
        status = "partial"
    else:
        status = "full"
    return {"final_url": r.url or final, "body": body[:40000] or None, "status": status, "image": image}


GROQ = "https://api.groq.com/openai/v1"
PREFERRED = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
_models: list[str] | None = None


def groq_models(key: str) -> list[str]:
    """Velger modeller som faktisk finnes på kontoen (Groq bytter modeller med jevne mellomrom)."""
    global _models
    if _models is None:
        try:
            r = requests.get(f"{GROQ}/models", headers={"Authorization": f"Bearer {key}"}, timeout=20)
            have = {m["id"] for m in r.json().get("data", [])}
        except Exception as e:  # noqa: BLE001
            print(f"  ! Fikk ikke modellisten fra Groq: {e}")
            have = set()
        wish = [os.environ.get("GROQ_MODEL", "")] + PREFERRED
        _models = [m for m in dict.fromkeys(wish) if m and m in have] or PREFERRED[:2]
        print(f"  Groq-modeller: {', '.join(_models[:3])}")
    return _models


def _clean_ai(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip().strip('"').strip()
    return re.sub(r"\s+", " ", text)


def ai_summary(item: dict) -> str | None:
    import ai

    if not ai.available():
        return None
    text = (item.get("body") or item.get("excerpt") or "").strip()
    prompt = (
        "Oppsummer nyhetssaken under på norsk bokmål i én eller to korte setninger (maks 40 ord). "
        "Få med det viktigste: hva som skjedde, hvem det gjelder og eventuelle sentrale tall. "
        "Bruk bare informasjon som står i teksten, ikke finn på noe. "
        "Ikke nevn analytikeres anbefalinger, kursmål eller kjøps- og salgsråd. "
        "Svar bare med sammendraget, uten innledning.\n\n"
        f"Tittel: {item['title']}\nKilde: {item.get('source') or ''}\nTekst: {text[:2500] or '(bare tittel)'}"
    )
    try:
        # Den lokale modellen er treg: maks 8 sammendrag fra den per kjøring, så markedskjøringene ikke drar ut
        out, _ = ai.chat(prompt, "small", 900, local_ok=ai.used.get("lokal", 0) < 8)
    except Exception as e:  # noqa: BLE001
        print(f"  ! KI-sammendrag: {e}")
        return None
    out = BLOCK.sub("", _clean_ai(out)).strip()
    return out[:400] or None


def enrich(conn, max_fetch: int = 15, max_ai: int = 12) -> tuple[int, int, int]:
    """Henter hele artikkelen og lager sammendrag for saker som mangler det."""
    import time

    import ai

    if ai.key("mistral") or ai.key("gemini"):
        max_fetch, max_ai = 30, 30  # mer kapasitet: flere hele artikler og sammendrag per kjøring

    fetched = blocked = summarized = 0
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, url, title FROM news WHERE body IS NULL AND fetch_tries < 2 AND feed <> 'newsweb'
               AND published > now() - interval '14 days' ORDER BY published DESC LIMIT %s""",
            (max_fetch,),
        )
        todo = cur.fetchall()
    google_ok = True
    for nid, url, title in todo:
        if "news.google.com" in url and not google_ok:
            continue
        a = fetch_article(url)
        if a["status"] == "retry":
            google_ok = False  # Google begrenser oss; resten tas ved neste kjøring
            continue
        lead = (a["body"] or "")[:500]
        with conn.cursor() as cur:
            if BLOCK.search(lead):
                # Skjules (ikke slettes), ellers ville saken komme tilbake ved neste henting
                cur.execute("UPDATE news SET body_status = 'blocked', fetch_tries = fetch_tries + 1 WHERE id = %s", (nid,))
                blocked += 1
            else:
                cur.execute(
                    """UPDATE news SET body = %s, body_status = %s, final_url = %s, image = %s, fetch_tries = fetch_tries + 1,
                       source = CASE WHEN source IN ('Google Nyheter','Google News') THEN split_part(split_part(%s, '://', 2), '/', 1) ELSE source END
                       WHERE id = %s""",
                    (a["body"], a["status"], a["final_url"], a["image"], a["final_url"], nid),
                )
                fetched += 1 if a["body"] else 0
        conn.commit()
    if ai.available():
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, title, source, body, excerpt FROM news WHERE summary IS NULL
                   AND published > now() - interval '14 days' AND body_status IS DISTINCT FROM 'blocked' AND (body IS NOT NULL OR fetch_tries >= 1 OR feed = 'newsweb' OR excerpt <> '')
                   ORDER BY published DESC LIMIT %s""",
                (max_ai,),
            )
            rows = cur.fetchall()
        for nid, title, source, body, excerpt in rows:
            s = ai_summary({"title": title, "source": source, "body": body, "excerpt": excerpt})
            if s:
                with conn.cursor() as cur:
                    cur.execute("UPDATE news SET summary = %s WHERE id = %s", (s, nid))
                conn.commit()
                summarized += 1
                if summarized <= 3:
                    print(f"  Eksempel på sammendrag: «{title[:70]}» → {s}")
            # Holder oss innenfor Groqs gratisgrense per minutt (KI-laget venter selv for Mistral og Gemini)
            time.sleep(1 if (ai.key("mistral") or ai.key("gemini")) else 6)
    return fetched, blocked, summarized


def purge(conn) -> int:
    """Sjekker Google-sakene på nytt med dagens filter, så feiltreff (f.eks. «frontline» om krig) forsvinner."""
    rules = {}
    for name, url, rule in FEEDS:
        if name.startswith("Google"):
            rules.setdefault(name, set()).add(rule)
    gone = 0
    with conn.cursor() as cur:
        cur.execute("SELECT id, title, coalesce(excerpt,''), feed FROM news WHERE feed IN ('Google News', 'Google Nyheter')")
        for nid, title, excerpt, feed in cur.fetchall():
            text = f"{title} {excerpt}"
            if not any(keep(text, r) for r in rules.get(feed, {True})):
                cur.execute("DELETE FROM news WHERE id = %s", (nid,))
                gone += 1
            else:
                cur.execute("UPDATE news SET companies = %s WHERE id = %s", (companies(text), nid))
    conn.commit()
    return gone


def run(conn) -> int:
    items, blocked = collect()
    new = 0
    with conn.cursor() as cur:
        cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
        for it in items:
            if it["published"] < cutoff or it["published"] > datetime.now(timezone.utc) + timedelta(hours=2):
                continue  # for gammel (slettes etter en uke) eller ugyldig dato
            cur.execute("SELECT 1 FROM news WHERE id = %s", (it["id"],))
            if cur.fetchone():
                continue
            cur.execute(
                """INSERT INTO news (id, title_key, title, url, source, published, excerpt, category, companies, feed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                (it["id"], it["title_key"], it["title"], it["url"], it["source"], it["published"], it["excerpt"],
                 it["category"], it["companies"], it["feed"]),
            )
            new += 1
        cur.execute("DELETE FROM news WHERE published < now() - interval '7 days'")
    conn.commit()
    purged = purge(conn)
    fetched, blocked2, summarized = enrich(conn)
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO news_blocked (day, n) VALUES (CURRENT_DATE, %s)
               ON CONFLICT (day) DO UPDATE SET n = GREATEST(news_blocked.n, EXCLUDED.n) + %s""",
            (blocked, blocked2),
        )
    conn.commit()
    import ai

    ki = f"KI-sammendrag ({', '.join(ai.available())})" if ai.available() else "KI-sammendrag (venter på KI-nøkkel)"
    print(f"  Nyheter: {len(items)} relevante, {new} nye, {fetched} hele artikler hentet, {summarized} {ki}, {blocked + blocked2} anbefalinger stoppet, {purged} irrelevante fjernet")
    return new
