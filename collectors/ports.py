"""Havneaktivitet fra IMF PortWatch: daglige anløp per skipstype og anslått import og eksport i tonn.

Tallene bygger på AIS og kommer med omtrent en ukes forsinkelse. Brukes til «kø og trengsel» og varestrømmer:
færre anløp i en eksporthavn kan bety kø eller stans; flere anløp i en importhavn kan bety høy etterspørsel.
"""
import time

import requests

BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services"
DATA = f"{BASE}/Daily_Ports_Data/FeatureServer/0/query"
DB = f"{BASE}/PortWatch_ports_database/FeatureServer/0/query"
H = {"User-Agent": "TerminalFC/1.0 (privat terminal)"}

# Havner som betyr mye for tank, tørrbulk og container (navn som søkes i PortWatch, land)
KEY_PORTS = [
    ("Ras Tanura", "Saudi Arabia"), ("Fujairah", "United Arab Emirates"), ("Basrah", "Iraq"), ("Singapore", "Singapore"),
    ("Rotterdam", "Netherlands"), ("Houston", "United States"), ("Corpus Christi", "United States"), ("Qingdao", "China"),
    ("Ningbo", "China"), ("Shanghai", "China"), ("Port Hedland", "Australia"), ("Dampier", "Australia"), ("Newcastle", "Australia"),
    ("Tubarao", "Brazil"), ("Santos", "Brazil"), ("Richards Bay", "South Africa"), ("Los Angeles", "United States"),
    ("Primorsk", "Russia"), ("Novorossiysk", "Russia"), ("Jamnagar", "India"),
]


def lookup() -> dict[str, tuple[str, str]]:
    """Finner PortWatch-ID for havnene (den største treffet per navn og land)."""
    out = {}
    for name, country in KEY_PORTS:
        try:
            r = requests.get(DB, params={"where": f"portname LIKE '%{name}%' AND country = '{country}'",
                                         "outFields": "portid,portname,vessel_count_total", "orderByFields": "vessel_count_total DESC",
                                         "resultRecordCount": 1, "returnGeometry": "false", "f": "json"}, headers=H, timeout=40)
            f = r.json().get("features", [])
            if f:
                a = f[0]["attributes"]
                out[a["portid"]] = (a["portname"], country)
        except Exception as e:  # noqa: BLE001
            print(f"  ! Fant ikke {name}: {e}")
    return out


def run(conn, backfill: bool = False) -> int:
    ports = lookup()
    if not ports:
        raise RuntimeError("Fant ingen havner i PortWatch")
    with conn.cursor() as cur:
        cur.execute("SELECT max(day) FROM port_activity")
        last = cur.fetchone()[0]
    start = "2025-01-01" if backfill or not last else last.isoformat()
    rows = 0
    with conn.cursor() as cur:
        # Én havn om gangen: store spørringer får tidsavbrudd (504) hos PortWatch
        for pid in ports:
            where = f"portid = '{pid}' AND date >= '{start}'"
            offset = 0
            while True:
                feats = None
                for attempt in range(3):
                    try:
                        r = requests.get(DATA, params={"where": where, "outFields": "*", "orderByFields": "date ASC", "resultOffset": offset,
                                                       "resultRecordCount": 1000, "f": "json"}, headers=H, timeout=90)
                        r.raise_for_status()
                        feats = [f["attributes"] for f in r.json().get("features", [])]
                        break
                    except Exception as e:  # noqa: BLE001
                        if attempt == 2:
                            print(f"  ! {ports[pid][0]}: {e}")
                        time.sleep(5 * (attempt + 1))
                if not feats:
                    break
                cur.executemany(
                    """INSERT INTO port_activity (day, portid, portname, country, calls, calls_tanker, calls_dry_bulk, calls_container,
                         import, export, import_tanker, export_tanker, import_dry_bulk, export_dry_bulk)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT (day, portid) DO UPDATE SET calls=EXCLUDED.calls, calls_tanker=EXCLUDED.calls_tanker,
                         calls_dry_bulk=EXCLUDED.calls_dry_bulk, calls_container=EXCLUDED.calls_container, import=EXCLUDED.import,
                         export=EXCLUDED.export, import_tanker=EXCLUDED.import_tanker, export_tanker=EXCLUDED.export_tanker,
                         import_dry_bulk=EXCLUDED.import_dry_bulk, export_dry_bulk=EXCLUDED.export_dry_bulk""",
                    [(a["date"][:10], a["portid"], a.get("portname"), a.get("country"), a.get("portcalls"), a.get("portcalls_tanker"),
                      a.get("portcalls_dry_bulk"), a.get("portcalls_container"), a.get("import"), a.get("export"), a.get("import_tanker"),
                      a.get("export_tanker"), a.get("import_dry_bulk"), a.get("export_dry_bulk")) for a in feats],
                )
                conn.commit()
                rows += len(feats)
                offset += len(feats)
                if len(feats) < 1000:
                    break
        cur.execute("SELECT max(day) FROM port_activity")
        newest = cur.fetchone()[0]
    if not rows and not newest:
        raise RuntimeError("Fikk ingen havnedata fra PortWatch")
    print(f"  Havner: {len(ports)} funnet ({', '.join(n for n, _ in list(ports.values())[:20])}), {rows} rader, siste dato {newest}")
    return rows
