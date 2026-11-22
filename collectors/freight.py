"""Fraktrater og fundamentale serier fra gratis, offentlige kilder.

- Drewry World Container Index (ukentlig, torsdag): drewry.co.uk
- SCFI, Shanghai Containerized Freight Index (ukentlig, fredag): en.sse.net.cn
- Baltic Dry Index (daglig): tall fra Baltic Exchange slik de gjengis i Hellenic Shipping News sine
  daglige BDI-saker. Selve indeksen er Baltic Exchange sitt produkt; vi lagrer bare tallet til privat bruk.
- USAs oljelagre (ukentlig, onsdag): EIA Weekly Petroleum Status Report, tabell 1 (offentlig).

Daglige fraktfutures (BWET for tank, BDRY for tørrbulk) hentes som kurser i prices.py.
"""
import csv
import io
import re
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime

import requests

H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def put(cur, series: str, day: date, value: float, unit: str, source: str, note: str | None = None):
    cur.execute(
        """INSERT INTO freight (series, day, value, unit, source, note, updated_at) VALUES (%s,%s,%s,%s,%s,%s, now())
           ON CONFLICT (series, day) DO UPDATE SET value=EXCLUDED.value, unit=EXCLUDED.unit, source=EXCLUDED.source,
             note=EXCLUDED.note, updated_at=now()""",
        (series, day, value, unit, source, note),
    )


def drewry(cur) -> str:
    r = requests.get("https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry", headers=H, timeout=30)
    r.raise_for_status()
    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))
    m = re.search(r"World Container Index[^.$]{0,140}?\$([\d,]+) per 40ft", txt)
    d = re.search(r"assessment for [A-Za-z]+, (\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})", txt)
    if not m or not d:
        raise RuntimeError("fant ikke WCI-tallet på siden")
    day = date(int(d.group(3)), MONTHS[d.group(2).lower()], int(d.group(1)))
    v = float(m.group(1).replace(",", ""))
    why = re.search(r"per 40ft container this week(?: due to| mainly due to| as)?([^.]{0,160})\.", txt)
    put(cur, "WCI", day, v, "USD/40ft", "Drewry", (why.group(1).strip() if why else None))
    return f"WCI {v:,.0f} ({day})"


def scfi(cur) -> str:
    r = requests.get("https://en.sse.net.cn/currentIndex", params={"indexName": "scfi"},
                     headers={**H, "Referer": "https://en.sse.net.cn/indices/scfinew.jsp", "X-Requested-With": "XMLHttpRequest"}, timeout=30)
    js = r.json()["data"]
    out = []
    for key, d in (("currentContent", js["currentDate"]), ("lastContent", js["lastDate"])):
        for line in js["lineDataList"]:
            if line.get("dataItemTypeName") == "SCFI_T" and line.get(key) is not None:
                put(cur, "SCFI", date.fromisoformat(d), float(line[key]), "indeks", "Shanghai Shipping Exchange")
                out.append(f"{d}: {line[key]:,.0f}")
    return "SCFI " + ", ".join(out)


BDI_RX = [
    re.compile(r"(?:to|at)\s+([\d,]{3,6})\s+points", re.I),
    re.compile(r"Baltic Dry Index[^.]{0,60}?\b([\d,]{3,6})\b", re.I),
]


def bdi(cur, pages: int = 1) -> str:
    """Henter BDI fra nyhetssakene. pages > 1 brukes ved første kjøring for å bygge historikk."""
    import feedparser

    found = {}
    for p in range(1, pages + 1):
        url = "https://www.hellenicshippingnews.com/?s=%22Baltic+Dry+Index%22&feed=rss2" + (f"&paged={p}" if p > 1 else "")
        try:
            f = feedparser.parse(requests.get(url, headers=H, timeout=30).content)
        except requests.RequestException:
            break
        if not f.entries:
            break
        for e in f.entries:
            title = e.get("title", "")
            if "baltic dry index" not in title.lower() and "dry index" not in title.lower():
                continue
            text = f"{title}. {re.sub(r'<[^>]+>', ' ', e.get('summary', ''))}"
            val = None
            for rx in BDI_RX:
                m = rx.search(text)
                if m:
                    n = float(m.group(1).replace(",", ""))
                    if 200 <= n <= 15000:  # BDI har aldri vært utenfor dette
                        val = n
                        break
            if val is None:
                continue
            try:
                dt = parsedate_to_datetime(e["published"]).astimezone(timezone.utc)
            except (KeyError, TypeError, ValueError):
                continue
            # Sakene publiseres om kvelden europeisk tid, samme dag som indeksen settes i London
            day = dt.date()
            if dt.hour < 6:
                day = date.fromordinal(day.toordinal() - 1)
            found.setdefault(day, val)
    for day, v in found.items():
        put(cur, "BDI", day, v, "indeks", "Baltic Exchange via Hellenic Shipping News")
    last = max(found) if found else None
    return f"BDI {len(found)} dager" + (f", siste {found[last]:,.0f} ({last})" if last else "")


def eia(cur) -> str:
    r = requests.get("https://ir.eia.gov/wpsr/table1.csv", headers=H, timeout=30)
    r.raise_for_status()
    rows = list(csv.reader(io.StringIO(r.text)))
    head = rows[0]
    week = datetime.strptime(head[1], "%m/%d/%y").date()
    prev = datetime.strptime(head[2], "%m/%d/%y").date()
    year_ago = datetime.strptime(head[5], "%m/%d/%y").date()
    want = {
        "Commercial (Excluding SPR)": "US_CRUDE",
        "Total Motor Gasoline": "US_GASOLINE",
        "Distillate Fuel Oil": "US_DISTILLATE",
    }
    out = []
    for row in rows[1:]:
        name = row[0].strip()
        key = want.get(name)
        if not key or key in {o[0] for o in out}:
            continue
        for d, v in ((week, row[1]), (prev, row[2]), (year_ago, row[5])):
            try:
                put(cur, key, d, float(v), "mill. fat", "EIA")
            except ValueError:
                pass
        out.append((key, row[1]))
    return "EIA " + ", ".join(f"{k} {v}" for k, v in out) + f" (uke til {week})"


def run(conn, backfill: bool = False) -> int:
    n = 0
    for name, fn in (("Drewry", drewry), ("SCFI", scfi), ("BDI", lambda c: bdi(c, pages=15 if backfill else 1)), ("EIA", eia)):
        try:
            with conn.cursor() as cur:
                msg = fn(cur)
            conn.commit()
            print(f"  {msg}")
            n += 1
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            print(f"  ! {name}: {type(e).__name__}: {str(e)[:160]}")
    if n == 0:
        raise RuntimeError("ingen fraktkilder svarte")
    return n
