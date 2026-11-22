"""Børsmeldinger fra Oslo Børs Newsweb for de fem selskapene (offentlig, gratis).

Lagrer full meldingstekst. Rapporter, trading updates og innsideinformasjon legges også
inn som nyheter, slik at de kan leses i terminalen. Meldepliktig handel (innsidehandel)
vises bare under «Interne forhold» på selskapssidene.
"""
import hashlib
import time
from datetime import date, datetime, timedelta, timezone

import requests

BASE = "https://api3.oslo.oslobors.no/v1/newsreader"
H = {"User-Agent": "Mozilla/5.0 (FUGLESANG; privat terminal)", "Accept": "application/json"}
ISSUERS = {"MOWI": "MOWI.OL", "SALM": "SALM.OL", "BAKKA": "BAKKA.OL", "LSG": "LSG.OL", "GSF": "GSF.OL"}


def kind_of(title: str, cats: list[str]) -> str:
    t = title.lower()
    c = " ".join(cats).upper()
    if "MELDEPLIKTIG HANDEL" in c or "MANAGERS" in c:
        return "Innsidehandel"
    if "trading update" in t or "produksjonsresultat" in t or "production results" in t or "operational update" in t:
        return "Trading update"
    if any(x in c for x in ("KVARTALSRAPPORT", "HALVÅRSRAPPORT", "ÅRSRAPPORT")) or "results" in t or "resultat" in t or "quarter" in t or "kvartal" in t:
        return "Rapport"
    if "financial calendar" in t or "finansiell kalender" in t or "invitation" in t or "invitasjon" in t:
        return "Kalender"
    if "dividend" in t or "utbytte" in t:
        return "Utbytte"
    if "INNSIDEINFORMASJON" in c:
        return "Innsideinformasjon"
    return "Annet"


def _get(url: str, params: dict | None = None):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=H, timeout=(8, 25))
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if i == 2:
                raise
            time.sleep(5 * (i + 1))


def run(conn, days: int = 45, max_bodies: int = 60) -> int:
    today = date.today()
    frm = today - timedelta(days=days)
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM announcements")
        have = {r[0] for r in cur.fetchall()}
    new = 0
    seen_slots = set()
    for issuer, sym in ISSUERS.items():
        js = _get(f"{BASE}/list", {"issuer": issuer, "fromDate": frm.isoformat(), "toDate": (today + timedelta(days=1)).isoformat()})
        msgs = (js.get("data") or {}).get("messages") or []
        for m in sorted(msgs, key=lambda x: x.get("publishedTime") or ""):
            mid = int(m.get("messageId") or m.get("id"))
            if (m.get("issuerSign") or "").upper() != issuer:
                continue
            title = (m.get("title") or "").strip()
            cats = [c.get("category_no") or "" for c in m.get("category") or []]
            kind = kind_of(title, cats)
            published = m.get("publishedTime")
            # Norsk og engelsk versjon kommer ofte samtidig; vis bare én i nyhetsstrømmen
            slot = (sym, (published or "")[:16], kind)
            dup = slot in seen_slots
            seen_slots.add(slot)
            if mid in have or new >= max_bodies:
                continue
            body = ""
            try:
                det = _get(f"{BASE}/message", {"messageId": mid})
                body = ((det.get("data") or {}).get("message") or {}).get("body") or ""
            except requests.RequestException:
                pass
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO announcements (id, symbol, title, category, kind, published, body, attachments)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING""",
                    (mid, sym, title, ", ".join(cats), kind, published, body, m.get("numbAttachments") or 0),
                )
                recent = published and datetime.fromisoformat(published.replace("Z", "+00:00")) > datetime.now(timezone.utc) - timedelta(days=7)
                if kind not in ("Innsidehandel",) and not dup and recent:
                    key = f"newsweb-{mid}"
                    nid = hashlib.sha1(key.encode()).hexdigest()[:20]
                    excerpt = " ".join(body.split())[:400]
                    cur.execute(
                        """INSERT INTO news (id, title_key, title, url, source, published, excerpt, body, body_status, final_url, category, companies, feed)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'full',%s,'Børsmelding',%s,'newsweb') ON CONFLICT (id) DO NOTHING""",
                        (nid, key, title, f"https://newsweb.oslobors.no/message/{mid}", "Oslo Børs Newsweb", published,
                         excerpt, body, f"https://newsweb.oslobors.no/message/{mid}", [sym]),
                    )
            new += 1
            time.sleep(0.3)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM announcements WHERE published < now() - interval '400 days'")
    conn.commit()
    print(f"  Børsmeldinger: {new} nye")
    return new
