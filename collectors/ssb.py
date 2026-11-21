"""Henter ukentlig eksportpris og mengde for oppdrettslaks fra SSB (tabell 03024).

Bruker PxWebApi v2. Variabelnavnene leses fra tabellens metadata, så koden tåler
at SSB endrer navn på kodene. Lisens: CC BY 4.0 (kilde: Statistisk sentralbyrå).
"""
import re

import requests

BASE = "https://data.ssb.no/api/pxwebapi/v2/tables/03024"
HEADERS = {"User-Agent": "FUGLESANG/1.0 (privat analyseverktøy)"}


def _get(url: str, params=None) -> dict:
    r = requests.get(url, params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch(weeks: int = 60) -> dict:
    meta = _get(f"{BASE}/metadata", {"lang": "no", "outputFormat": "json-stat2"})
    dims = meta.get("id") or list(meta.get("dimension", {}).keys())
    params = {"lang": "no", "outputFormat": "json-stat2"}
    for d in dims:
        if d.lower() in ("tid", "time"):
            params[f"valueCodes[{d}]"] = f"top({weeks})"
        else:
            params[f"valueCodes[{d}]"] = "*"
    return _get(f"{BASE}/data", params)


def parse(js: dict) -> dict:
    """Gjør json-stat2 om til {periode: {fresh_price, fresh_tonnes, frozen_price, frozen_tonnes}}."""
    ids, sizes, dim = js["id"], js["size"], js["dimension"]
    values = js["value"]
    if isinstance(values, dict):  # sparse format
        values = [values.get(str(i)) for i in range(_prod(sizes))]

    def cats(d):
        c = dim[d]["category"]
        idx = c["index"]
        order = sorted(idx, key=idx.get) if isinstance(idx, dict) else idx
        return order, c.get("label", {})

    time_dim = next(d for d in ids if d.lower() in ("tid", "time"))
    content_dim = next((d for d in ids if d.lower() == "contentscode"), None)
    other = [d for d in ids if d not in (time_dim, content_dim)]

    def kind_of_content(label: str) -> str:
        l = label.lower()
        return "price" if ("pris" in l or "price" in l or "kr" in l) else "tonnes"

    def kind_of_product(label: str) -> str:
        l = label.lower()
        return "frozen" if ("fros" in l or "fryst" in l or "frozen" in l) else "fresh"

    out: dict = {}
    strides = [_prod(sizes[i + 1:]) for i in range(len(sizes))]
    orders = {d: cats(d) for d in ids}
    for flat, v in enumerate(values):
        if v is None:
            continue
        pos = {d: (flat // strides[i]) % sizes[i] for i, d in enumerate(ids)}
        period = orders[time_dim][0][pos[time_dim]]
        c_code = orders[content_dim][0][pos[content_dim]] if content_dim else ""
        c_label = orders[content_dim][1].get(c_code, c_code) if content_dim else ""
        prod_label = " ".join(orders[d][1].get(orders[d][0][pos[d]], "") for d in other)
        key = f"{kind_of_product(prod_label)}_{kind_of_content(c_label)}"
        out.setdefault(period, {})[key] = float(v)
    return out


def _prod(xs):
    p = 1
    for x in xs:
        p *= x
    return p


def run(conn, weeks: int = 60) -> int:
    data = parse(fetch(weeks))
    rows = 0
    with conn.cursor() as cur:
        for period, vals in sorted(data.items()):
            m = re.match(r"(\d{4})U(\d{1,2})", period)
            if not m:
                continue
            cur.execute(
                """INSERT INTO ssb_salmon (period, year, week, fresh_price, fresh_tonnes, frozen_price, frozen_tonnes, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s, now())
                   ON CONFLICT (period) DO UPDATE SET fresh_price=EXCLUDED.fresh_price, fresh_tonnes=EXCLUDED.fresh_tonnes,
                     frozen_price=EXCLUDED.frozen_price, frozen_tonnes=EXCLUDED.frozen_tonnes, updated_at=now()""",
                (period, int(m.group(1)), int(m.group(2)), vals.get("fresh_price"), vals.get("fresh_tonnes"),
                 vals.get("frozen_price"), vals.get("frozen_tonnes")),
            )
            rows += 1
    conn.commit()
    if data:
        last = max(data)
        print(f"  Siste uke {last}: {data[last]}")
    return rows
