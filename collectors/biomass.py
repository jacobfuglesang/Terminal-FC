"""Biomasse av laks per produksjonsområde fra Fiskeridirektoratet (NLOD)."""
import io
import re
from datetime import date

import openpyxl
import requests

URL = "https://register.fiskeridir.no/biomassestatistikk/BIOSTAT-LAKS-OMR/biostat-behfisk01-omr.xlsx"
MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"]
PO_RE = re.compile(r"^Område\s+(\d+)\s*:\s*(.+)$")


def parse_sheet(year: int, rows) -> list:
    """Finner seksjonen med LAKS per produksjonsområde og returnerer (måned, po, navn, antall, tonn)."""
    out = []
    in_laks = False
    for row in rows:
        first = str(row[0] or "").strip()
        if first.lower().startswith("innrapportert") and "LAKS" in first:
            in_laks = True
            continue
        if in_laks and first.lower().startswith("innrapportert") and "LAKS" not in first:
            break
        m = PO_RE.match(first)
        if in_laks and m:
            po, name = int(m.group(1)), m.group(2).strip()
            for i in range(12):
                cnt = row[1 + 2 * i] if len(row) > 1 + 2 * i else None
                ton = row[2 + 2 * i] if len(row) > 2 + 2 * i else None
                if ton in (None, "") or float(ton or 0) == 0 and float(cnt or 0) == 0:
                    continue
                out.append((date(year, i + 1, 1), po, name, float(cnt or 0), float(ton)))
    return out


def run(conn) -> int:
    content = requests.get(URL, headers={"User-Agent": "FUGLESANG/1.0"}, timeout=90).content
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    rows = 0
    with conn.cursor() as cur:
        for ws in wb.worksheets:
            if not ws.title.strip().isdigit() or int(ws.title) < 2018:
                continue
            for rec in parse_sheet(int(ws.title), ws.iter_rows(values_only=True)):
                cur.execute(
                    """INSERT INTO biomass (month, po, name, count_k, tonnes) VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (month, po) DO UPDATE SET name=EXCLUDED.name, count_k=EXCLUDED.count_k, tonnes=EXCLUDED.tonnes""",
                    rec,
                )
                rows += 1
    conn.commit()
    print(f"  Biomasse: {rows} rader")
    if rows == 0:
        raise RuntimeError("Fant ingen biomasserader. Formatet på regnearket kan ha endret seg.")
    return rows
