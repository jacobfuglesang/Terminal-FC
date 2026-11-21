"""Fôrråvareindeks fra IMF-priser via FRED (gratis CSV, ingen nøkkel).

Fiskeolje finnes ikke i IMF-serien, så indeksen bruker fire råvarer.
Indeks: januar 2026 = 100. Omregnet til kroner med USD/NOK (snitt per måned fra Yahoo).
"""
import csv
import io
from datetime import date

import time

import requests

SERIES = {  # FRED-id: (navn, vekt)
    "PFISHUSDM": ("Fiskemel", 0.35),
    "PSMEAUSDM": ("Soyamel", 0.30),
    "PROILUSDM": ("Rapsolje", 0.20),
    "PWHEAMTUSDM": ("Hvete", 0.15),
}
BASE = date(2026, 1, 1)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) FUGLESANG/1.0", "Accept": "text/csv,*/*"}


class SourceDown(Exception):
    """FRED svarer ikke nå. Månedsdata, så vi prøver igjen ved neste daglige kjøring."""


def _get(url: str) -> str:
    last = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=(8, 20))
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:  # noqa: PERF203
            last = e
            time.sleep(10 * (attempt + 1))
    raise SourceDown(f"FRED svarer ikke akkurat nå ({type(last).__name__}). Prøver igjen ved neste daglige henting.")


def run(conn) -> int:
    data: dict = {}
    for s in SERIES:  # én serie om gangen: raskere og mer robust enn ett stort kall
        text = _get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}&cosd=2015-01-01")
        for r in csv.DictReader(io.StringIO(text)):
            v = r.get(s)
            if v not in (None, "", "."):
                data.setdefault(s, {})[date.fromisoformat(r["observation_date"])] = float(v)
    rows = 0
    with conn.cursor() as cur:
        for s, vals in data.items():
            for d, v in vals.items():
                cur.execute(
                    "INSERT INTO feed_raw (series, month, usd) VALUES (%s,%s,%s) ON CONFLICT (series, month) DO UPDATE SET usd=EXCLUDED.usd",
                    (s, d, v),
                )
                rows += 1
        # USD/NOK per måned
        cur.execute("SELECT date_trunc('month', day)::date, avg(close) FROM price_daily WHERE symbol='NOK=X' GROUP BY 1")
        usdnok = {r[0]: float(r[1]) for r in cur.fetchall()}
        months = sorted(set.intersection(*(set(v) for v in data.values()))) if data else []
        if BASE not in months:
            raise RuntimeError("Mangler basemåned januar 2026 i FRED-dataene")
        nok_base = usdnok.get(BASE)
        for m in months:
            iu = sum(w * data[s][m] / data[s][BASE] for s, (_, w) in SERIES.items()) * 100
            fx = usdnok.get(m)
            inok = iu * fx / nok_base if (fx and nok_base) else None
            cur.execute(
                "INSERT INTO feed_index (month, index_usd, index_nok) VALUES (%s,%s,%s) ON CONFLICT (month) DO UPDATE SET index_usd=EXCLUDED.index_usd, index_nok=EXCLUDED.index_nok",
                (m, round(iu, 2), round(inok, 2) if inok else None),
            )
    conn.commit()
    if months:
        print(f"  Fôrindeks siste måned {months[-1]}: {iu:.1f} (USD)")
    return rows
