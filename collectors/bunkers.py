"""Bunkerpriser (drivstoff for skip) i store havner, i USD per tonn.

Kilde: bunkertabellen hos Hellenic Shipping News (levert av BunkerEx/Nereus), som nettstedet selv
tilbyr andre å legge inn på sine sider. Den har IFO380 (HSFO, for skip med scrubber), VLSFO (lavsvovel)
og MGO (marin gassolje) for Piraeus, Istanbul, Fujairah, Singapore, Rotterdam, Houston og Santos.
Vi henter siden én gang per kjøring (de ber om minst 30 sekunder mellom forespørsler).
"""
import re
from datetime import date, datetime

import requests

URL = "https://www.hellenicshippingnews.com/bunker-price-table"
UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)"}
GRADES = ["HSFO", "IFO180", "VLSFO", "MGO"]  # kolonnerekkefølgen i tabellen (IFO380 = HSFO)
NAMES = {"PIRAEUS": "Piraeus", "ISTANBUL": "Istanbul", "FUJAIRAH": "Fujairah", "SINGAPORE": "Singapore",
         "ROTTERDAM": "Rotterdam", "HOUSTON": "Houston", "SANTOS": "Santos"}


def _num(s: str):
    s = s.replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def fetch() -> tuple[date, list[tuple[str, str, float, float | None]]]:
    r = requests.get(URL, headers=UA, timeout=30)
    r.raise_for_status()
    html = r.text
    m = re.search(r"BUNKER PRICES\s*\(([A-Za-z]+ \d{1,2}, \d{4})\)", re.sub(r"<[^>]+>", " ", html))
    day = datetime.strptime(m.group(1), "%B %d, %Y").date() if m else date.today()
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if not cells or cells[0].upper() not in NAMES:
            continue
        port = NAMES[cells[0].upper()]
        vals = cells[1:]
        for i, grade in enumerate(GRADES):
            if 2 * i >= len(vals):
                break
            price = _num(vals[2 * i])
            change = _num(re.sub(r"[^\d.\-]", "", vals[2 * i + 1])) if 2 * i + 1 < len(vals) else None
            if price:
                rows.append((port, grade, price, change))
    return day, rows


def run(conn, backfill: bool = False) -> int:
    day, rows = fetch()
    if not rows:
        raise RuntimeError("Fant ingen bunkerpriser i tabellen (siden kan ha endret format)")
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO bunkers (day, port, grade, price, change, source) VALUES (%s,%s,%s,%s,%s,'BunkerEx via Hellenic Shipping News')
               ON CONFLICT (day, port, grade) DO UPDATE SET price = EXCLUDED.price, change = EXCLUDED.change""",
            [(day, p, g, v, c) for p, g, v, c in rows if g != "IFO180"],
        )
    conn.commit()
    ports = sorted({p for p, *_ in rows})
    print(f"  Bunkers {day}: {len(rows)} priser for {len(ports)} havner ({', '.join(ports)})")
    return len(rows)
