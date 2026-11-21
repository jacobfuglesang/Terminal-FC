"""Terminpriser for laks fra Euronext (Salmon Futures, ESF). Oppgjørspris i EUR per tonn."""
import html
import re
from datetime import date

import requests

URL = "https://live.euronext.com/en/ajax/getPricesFutures/commodities-futures/ESF/DPAR"
MON = {m: i + 1 for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def parse(page: str) -> list:
    t = re.sub(r"<script.*?</script>", " ", page, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", html.unescape(t))
    out = []
    # Kolonner etter levering: Bid Ask Last Time +/- DayVol Open High Low Settl. O.I
    for m in re.finditer(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})((?: \S+){11})", t):
        tok = m.group(3).split()
        settle, oi = tok[9], tok[10]
        try:
            s = float(settle.replace(",", ""))
        except ValueError:
            continue
        try:
            o = int(oi.replace(",", ""))
        except ValueError:
            o = None
        out.append((date(int(m.group(2)), MON[m.group(1)], 1), s, o))
    return out


def run(conn) -> int:
    page = requests.get(URL, headers={"User-Agent": "Mozilla/5.0 FUGLESANG/1.0"}, timeout=60).text
    rows = parse(page)
    if not rows:
        raise RuntimeError("Fant ingen terminpriser hos Euronext")
    today = date.today()
    with conn.cursor() as cur:
        for c, s, o in rows:
            cur.execute(
                """INSERT INTO futures (snapshot, contract, settle, open_int) VALUES (%s,%s,%s,%s)
                   ON CONFLICT (snapshot, contract) DO UPDATE SET settle=EXCLUDED.settle, open_int=EXCLUDED.open_int""",
                (today, c, s, o),
            )
    conn.commit()
    print(f"  Termin: {len(rows)} kontrakter, nærmeste {rows[0][0]}: {rows[0][1]:.0f} EUR/t")
    return len(rows)
