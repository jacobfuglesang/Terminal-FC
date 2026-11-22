"""Daglig skipstrafikk gjennom verdens viktigste flaskehalser fra IMF PortWatch (gratis, åpne data).

Tallene bygger på AIS og publiseres med noen dagers forsinkelse.
"""
import requests

URL = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query"
H = {"User-Agent": "FUGLESANG/1.0 (privat terminal)"}

# De som betyr mest for rederiene vi følger
KEEP = {
    "chokepoint6": "Hormuzstredet",
    "chokepoint1": "Suezkanalen",
    "chokepoint4": "Bab el-Mandeb",
    "chokepoint7": "Kapp det gode håp",
    "chokepoint2": "Panamakanalen",
    "chokepoint5": "Malakkastredet",
    "chokepoint8": "Gibraltarstredet",
    "chokepoint3": "Bosporus",
    "chokepoint9": "Doverstredet",
    "chokepoint11": "Taiwanstredet",
}


def run(conn, backfill: bool = False) -> int:
    since = "2024-01-01" if backfill else None
    where = "portid IN (" + ",".join(f"'{p}'" for p in KEEP) + ")"
    if since:
        where += f" AND date >= '{since}'"
    else:
        with conn.cursor() as cur:
            cur.execute("SELECT max(day) FROM chokepoints")
            last = cur.fetchone()[0]
        start = (last.isoformat() if last else "2024-01-01")
        where += f" AND date >= '{start}'" if last else " AND date >= '2024-01-01'"
    offset, rows = 0, 0
    newest = None
    with conn.cursor() as cur:
        while True:
            r = requests.get(URL, params={"where": where, "outFields": "*", "orderByFields": "date ASC", "resultOffset": offset,
                                          "resultRecordCount": 1000, "f": "json"}, headers=H, timeout=90)
            r.raise_for_status()
            feats = [f["attributes"] for f in r.json().get("features", [])]
            if not feats:
                break
            for a in feats:
                cur.execute(
                    """INSERT INTO chokepoints (day, portid, name, n_total, n_tanker, n_container, n_dry_bulk, n_cargo, n_roro,
                         capacity, cap_tanker, cap_container, cap_dry_bulk)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (day, portid) DO UPDATE SET n_total=EXCLUDED.n_total, n_tanker=EXCLUDED.n_tanker,
                         n_container=EXCLUDED.n_container, n_dry_bulk=EXCLUDED.n_dry_bulk, n_cargo=EXCLUDED.n_cargo,
                         n_roro=EXCLUDED.n_roro, capacity=EXCLUDED.capacity, cap_tanker=EXCLUDED.cap_tanker,
                         cap_container=EXCLUDED.cap_container, cap_dry_bulk=EXCLUDED.cap_dry_bulk""",
                    (a["date"][:10], a["portid"], KEEP.get(a["portid"], a.get("portname")), a.get("n_total"), a.get("n_tanker"),
                     a.get("n_container"), a.get("n_dry_bulk"), a.get("n_cargo"), a.get("n_roro"), a.get("capacity"),
                     a.get("capacity_tanker"), a.get("capacity_container"), a.get("capacity_dry_bulk")),
                )
                rows += 1
                newest = max(newest or a["date"], a["date"])
            conn.commit()
            if len(feats) < 1000:
                break
            offset += 1000
    print(f"  PortWatch: {rows} rader, siste dato {newest}")
    return rows
