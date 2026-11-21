"""Lus og sykdom fra BarentsWatch Fish Health API (NLOD). Krever gratis API-klient.

Hemmeligheter i GitHub: BW_CLIENT_ID og BW_CLIENT_SECRET.
"""
import os
from datetime import date, timedelta

import requests

TOKEN = "https://id.barentswatch.no/connect/token"
API_V2 = "https://www.barentswatch.no/bwapi/v2/geodata/fishhealth/locality/{y}/{w}"  # POST (gjeldende)
API_V1 = "https://www.barentswatch.no/bwapi/v1/geodata/fishhealth/locality/{y}/{w}"  # GET (utgående, reserve)


class MissingKey(Exception):
    pass


def token() -> str:
    cid, sec = os.environ.get("BW_CLIENT_ID"), os.environ.get("BW_CLIENT_SECRET")
    if not cid or not sec:
        raise MissingKey("Venter på BarentsWatch-nøkkel (BW_CLIENT_ID / BW_CLIENT_SECRET)")
    r = requests.post(TOKEN, data={"client_id": cid, "client_secret": sec, "scope": "api", "grant_type": "client_credentials"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def limit_for(week: int) -> float:
    # Lusegrensen er 0,2 i vårperioden (uke 16–21), ellers 0,5
    return 0.2 if 16 <= week <= 21 else 0.5


def _find(d: dict, *needles):
    """Finn første felt der navnet inneholder alle ordene (tåler at API-et endrer feltnavn)."""
    for k, v in d.items():
        kl = k.lower()
        if all(n in kl for n in needles):
            return v
    return None


def _has(d: dict, word: str) -> bool:
    """Sant hvis anlegget har en aktiv sykdom som inneholder ordet (ila / pd)."""
    for k, v in d.items():
        kl = k.lower()
        if kl in (f"has{word}", f"is{word}") and v:
            return True
        if isinstance(v, list) and "disease" in kl:
            for item in v:
                txt = str(item).lower()
                if word in txt.replace("-", ""):
                    return True
    return False


def summarize(js, week: int) -> dict:
    locs = js.get("localities") if isinstance(js, dict) else js
    locs = [l for l in (locs or []) if isinstance(l, dict)]
    vals = []
    for l in locs:
        v = _find(l, "adultfemale")
        if isinstance(v, dict):  # v2 kan pakke tallene inn
            v = _find(v, "avg") if _find(v, "avg") is not None else _find(v, "value")
        if isinstance(v, (int, float)):
            vals.append(float(v))
    lim = limit_for(week)
    return {
        "avg": round(sum(vals) / len(vals), 3) if vals else None,
        "reported": len(vals),
        "over": sum(1 for v in vals if v > lim),
        "ila": sum(1 for l in locs if _has(l, "ila")),
        "pd": sum(1 for l in locs if _has(l, "pd")),
        "n": len(locs),
        "keys": sorted(locs[0].keys()) if locs else [],
    }


def fetch_week(tok: str, y: int, w: int):
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(API_V2.format(y=y, w=w), json={}, headers=h, timeout=60)
    if r.status_code in (404, 405):
        r = requests.get(API_V1.format(y=y, w=w), headers=h, timeout=60)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def run(conn, weeks: int = 3) -> int:
    tok = token()
    rows = 0
    with conn.cursor() as cur:
        for back in range(weeks):
            d = date.today() - timedelta(weeks=back)
            y, w, _ = d.isocalendar()
            js = fetch_week(tok, y, w)
            if js is None:
                continue
            s = summarize(js, w)
            if back == 0:
                print(f"  Felt i svaret: {s['keys']}")
            if not s["reported"]:
                continue
            cur.execute(
                """INSERT INTO lice_week (year, week, avg_lice, reported, over_limit, ila, pd, localities, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
                   ON CONFLICT (year, week) DO UPDATE SET avg_lice=EXCLUDED.avg_lice, reported=EXCLUDED.reported,
                     over_limit=EXCLUDED.over_limit, ila=EXCLUDED.ila, pd=EXCLUDED.pd, localities=EXCLUDED.localities, updated_at=now()""",
                (y, w, s["avg"], s["reported"], s["over"], s["ila"], s["pd"], s["n"]),
            )
            rows += 1
            print(f"  Uke {w}/{y}: snitt {s['avg']} lus, {s['over']} over grensen, ILA {s['ila']}, PD {s['pd']}")
    conn.commit()
    return rows
