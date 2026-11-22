"""Lus og sykdom fra BarentsWatch Fish Health API (NLOD). Krever gratis API-klient.

Hemmeligheter i GitHub: BW_CLIENT_ID og BW_CLIENT_SECRET.
Klienten lages på barentswatch.no/minside under «BarentsWatch - API».
"""
import os
import re
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


DISEASE = {
    "ila": re.compile(r"\bila\b|lakseanemi", re.I),
    "pd": re.compile(r"\bpd\b|pankreas", re.I),
}


def _has(d: dict, word: str) -> bool:
    """Sant hvis anlegget har ILA eller PD i sykdomslisten."""
    if d.get(f"has{word.upper()}") or d.get(f"has{word}"):
        return True
    dis = d.get("diseases")
    return bool(dis) and bool(DISEASE[word].search(str(dis)))


def _deep(obj, needle: str):
    """Let gjennom nøstede dict/list etter et tall der feltnavnet inneholder needle.
    Foretrekker felt som heter noe med avg/average/mean/value."""
    hits = []

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                kl = k.lower()
                if isinstance(v, (int, float)) and not isinstance(v, bool) and needle in (path + kl):
                    hits.append((kl, float(v)))
                walk(v, path + kl + ".")
        elif isinstance(o, list):
            for x in o:
                walk(x, path)

    walk(obj, "")
    for pref in ("avg", "average", "mean", "value"):
        for k, v in hits:
            if pref in k:
                return v
    return hits[0][1] if hits else None


# Selskapene kobles til anlegg via organisasjonene i akvakulturregisteret.
# Bakkafrost har ingen anlegg i Norge og dekkes ikke av BarentsWatch.
OWNERS = {
    "MOWI.OL": re.compile(r"\bMOWI\b|\bNOVA SEA\b", re.I),
    "SALM.OL": re.compile(r"\bSALMAR\b", re.I),
    "LSG.OL": re.compile(r"\bLER[ØO]Y\b", re.I),
    "GSF.OL": re.compile(r"\bGRIEG SEAFOOD\b", re.I),
}


def owners(loc: dict) -> list[str]:
    orgs = " | ".join((loc.get("aquaCultureRegister") or {}).get("organizations") or [])
    return [sym for sym, rx in OWNERS.items() if rx.search(orgs)]


def _stats(locs: list, week: int) -> dict:
    vals, wsum, wtot = [], 0.0, 0.0
    for l in locs:
        rep = l.get("liceReport")
        if not rep or rep.get("hasReported") is False:
            continue
        v = _deep(rep, "adultfemale")
        if v is None or not 0 <= v < 50:
            continue
        vals.append(v)
        cap = (l.get("aquaCultureRegister") or {}).get("capacity") or 0
        if cap > 0:
            wsum += v * cap
            wtot += cap
    lim = limit_for(week)
    return {
        "avg": round(sum(vals) / len(vals), 3) if vals else None,
        "avg_w": round(wsum / wtot, 3) if wtot else None,
        "reported": len(vals),
        "over": sum(1 for v in vals if v > lim),
        "ila": sum(1 for l in locs if _has(l, "ila")),
        "pd": sum(1 for l in locs if _has(l, "pd")),
        "n": len(locs),
    }


def summarize(js, week: int) -> dict:
    locs = js.get("localities") if isinstance(js, dict) else js
    locs = [l for l in (locs or []) if isinstance(l, dict)]
    # Bare matfiskanlegg for laks/ørret, ikke ventemerder ved slakteri
    salmon = [l for l in locs if l.get("hasSalmonoidLicense", True) and not l.get("isSlaughterHoldingCage")]
    out = _stats(salmon, week)
    out["companies"] = {sym: _stats([l for l in salmon if sym in owners(l)], week) for sym in OWNERS}
    # Til kontroll i loggen: største organisasjoner som ikke er koblet til noe selskap
    from collections import Counter
    c = Counter(o for l in salmon if not owners(l) for o in (l.get("aquaCultureRegister") or {}).get("organizations") or [])
    out["top_other"] = c.most_common(8)
    out["matched_orgs"] = sorted({o for l in salmon if owners(l) for o in (l.get("aquaCultureRegister") or {}).get("organizations") or []})
    return out


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
                print(f"  Koblede organisasjoner: {s['matched_orgs']}")
                print(f"  Største ukoblede: {s['top_other']}")
            if not s["reported"]:
                continue
            cur.execute(
                """INSERT INTO lice_week (year, week, avg_lice, avg_w, reported, over_limit, ila, pd, localities, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                   ON CONFLICT (year, week) DO UPDATE SET avg_lice=EXCLUDED.avg_lice, avg_w=EXCLUDED.avg_w, reported=EXCLUDED.reported,
                     over_limit=EXCLUDED.over_limit, ila=EXCLUDED.ila, pd=EXCLUDED.pd, localities=EXCLUDED.localities, updated_at=now()""",
                (y, w, s["avg"], s["avg_w"], s["reported"], s["over"], s["ila"], s["pd"], s["n"]),
            )
            for sym, c in s["companies"].items():
                cur.execute(
                    """INSERT INTO lice_company (year, week, symbol, localities, reported, avg_lice, avg_w, over_limit, ila, pd, updated_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                       ON CONFLICT (year, week, symbol) DO UPDATE SET localities=EXCLUDED.localities, reported=EXCLUDED.reported,
                         avg_lice=EXCLUDED.avg_lice, avg_w=EXCLUDED.avg_w, over_limit=EXCLUDED.over_limit, ila=EXCLUDED.ila, pd=EXCLUDED.pd, updated_at=now()""",
                    (y, w, sym, c["n"], c["reported"], c["avg"], c["avg_w"], c["over"], c["ila"], c["pd"]),
                )
            rows += 1
            per = ", ".join(f"{k.split('.')[0]} {v['avg']} ({v['n']} anl, ILA {v['ila']}, PD {v['pd']})" for k, v in s["companies"].items())
            print(f"  Uke {w}/{y}: snitt {s['avg']} (vektet {s['avg_w']}), {s['over']} over grensen, ILA {s['ila']}, PD {s['pd']} | {per}")
    conn.commit()
    return rows
