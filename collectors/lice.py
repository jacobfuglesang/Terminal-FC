"""Lus og sykdom fra BarentsWatch Fish Health API (NLOD). Krever gratis API-klient.

Hemmeligheter i GitHub: BW_CLIENT_ID og BW_CLIENT_SECRET.
"""
import os
from datetime import date, timedelta

import requests

TOKEN = "https://id.barentswatch.no/connect/token"
API = "https://www.barentswatch.no/bwapi/v1/geodata/fishhealth/locality/{y}/{w}"


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


def summarize(js: dict, week: int) -> dict:
    locs = js.get("localities") if isinstance(js, dict) else js
    locs = locs or []
    reported = [l for l in locs if l.get("hasReportedLice") and l.get("avgAdultFemaleLice") is not None]
    vals = [float(l["avgAdultFemaleLice"]) for l in reported]
    lim = limit_for(week)
    return {
        "avg": round(sum(vals) / len(vals), 3) if vals else None,
        "reported": len(reported),
        "over": sum(1 for v in vals if v > lim),
        "ila": sum(1 for l in locs if l.get("hasIla")),
        "pd": sum(1 for l in locs if l.get("hasPd")),
        "n": len(locs),
        "keys": sorted(locs[0].keys()) if locs else [],
    }


def run(conn, weeks: int = 3) -> int:
    tok = token()
    rows = 0
    with conn.cursor() as cur:
        for back in range(weeks):
            d = date.today() - timedelta(weeks=back)
            y, w, _ = d.isocalendar()
            r = requests.get(API.format(y=y, w=w), headers={"Authorization": f"Bearer {tok}"}, timeout=60)
            if r.status_code == 404:
                continue
            r.raise_for_status()
            s = summarize(r.json(), w)
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
