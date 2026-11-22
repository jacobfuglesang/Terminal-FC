"""Øyeblikksbilde av skipstrafikk i nøkkelområder fra aisstream.io (gratis, krever egen nøkkel).

aisstream.io bygger på mottakere på land, så dekningen er god nær kysten og i sund,
men kan ha hull ute på åpent hav. Vi lytter i rundt ett minutt per kjøring.
"""
import asyncio
import json
import os
import time
from datetime import datetime, timezone


class MissingKey(Exception):
    pass


# (navn, [[lat_sør, lon_vest], [lat_nord, lon_øst]])
ZONES = {
    "Hormuz": [[24.0, 54.5], [27.5, 58.5]],
    "Bab el-Mandeb": [[11.5, 42.0], [15.5, 45.5]],
    "Suez": [[29.5, 32.0], [31.7, 33.0]],
    "Singapore": [[0.9, 103.3], [1.6, 104.6]],
    "Gibraltar": [[35.6, -6.3], [36.3, -5.0]],
    "Dover": [[50.6, 0.8], [51.3, 2.0]],
    "Panama": [[8.7, -80.2], [9.6, -79.3]],
    "Kapp det gode håp": [[-36.5, 16.5], [-33.0, 21.0]],
}


def zone_of(lat: float, lon: float) -> str | None:
    for name, ((s, w), (n, e)) in ZONES.items():
        if s <= lat <= n and w <= lon <= e:
            return name
    return None


def kind(t: int | None) -> str:
    if t is None:
        return "ukjent"
    if 80 <= t <= 89:
        return "tank"
    if 70 <= t <= 79:
        return "last"
    return "annet"


async def listen(key: str, seconds: int) -> tuple[dict, dict]:
    import websockets

    pos, static = {}, {}
    sub = {"APIKey": key, "BoundingBoxes": list(ZONES.values()), "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}
    async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=20) as ws:
        await ws.send(json.dumps(sub))
        t0 = time.time()
        while time.time() - t0 < seconds:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=15)
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            md = msg.get("MetaData") or {}
            mmsi = md.get("MMSI")
            if not mmsi:
                continue
            if msg.get("MessageType") == "PositionReport":
                p = msg["Message"]["PositionReport"]
                pos[mmsi] = {"lat": md.get("latitude", p.get("Latitude")), "lon": md.get("longitude", p.get("Longitude")),
                             "sog": p.get("Sog"), "name": (md.get("ShipName") or "").strip()}
            elif msg.get("MessageType") == "ShipStaticData":
                s = msg["Message"]["ShipStaticData"]
                static[mmsi] = {"type": s.get("Type"), "dest": (s.get("Destination") or "").strip()[:40],
                                "draught": s.get("MaximumStaticDraught"), "name": (s.get("Name") or "").strip()}
    return pos, static


def run(conn, seconds: int = 70) -> int:
    key = os.environ.get("AISSTREAM_API_KEY", "").strip()
    if not key:
        raise MissingKey("Venter på aisstream-nøkkel (AISSTREAM_API_KEY)")
    try:
        pos, static = asyncio.run(listen(key, seconds))
    except (TimeoutError, OSError, asyncio.TimeoutError) as e:
        # aisstream er av og til nede; da hopper vi over denne gangen i stedet for å melde feil
        raise MissingKey(f"aisstream svarte ikke ({type(e).__name__}), prøver igjen neste kjøring") from e
    now = datetime.now(timezone.utc)
    counts: dict[str, dict[str, int]] = {z: {"total": 0, "tank": 0, "last": 0} for z in ZONES}
    with conn.cursor() as cur:
        cur.executemany(
                """INSERT INTO ais_ships (mmsi, name, ship_type, dest, draught, updated_at) VALUES (%s,%s,%s,%s,%s, now())
                   ON CONFLICT (mmsi) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''), ais_ships.name), ship_type=EXCLUDED.ship_type,
                     dest=EXCLUDED.dest, draught=EXCLUDED.draught, updated_at=now()""",
                [(mmsi, s["name"], s["type"], s["dest"], s["draught"]) for mmsi, s in static.items()],
            )
        cur.execute("SELECT mmsi, ship_type FROM ais_ships WHERE mmsi = ANY(%s)", (list(pos),))
        types = dict(cur.fetchall())
        rows = []
        for mmsi, p in pos.items():
            if p["lat"] is None or p["lon"] is None:
                continue
            z = zone_of(p["lat"], p["lon"])
            if not z:
                continue
            k = kind(types.get(mmsi))
            counts[z]["total"] += 1
            if k in ("tank", "last"):
                counts[z][k] += 1
            rows.append((mmsi, p["name"], p["lat"], p["lon"], p["sog"], z, k, now))
        cur.executemany(
                """INSERT INTO ais_positions (mmsi, name, lat, lon, sog, zone, kind, seen) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (mmsi) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''), ais_positions.name), lat=EXCLUDED.lat,
                     lon=EXCLUDED.lon, sog=EXCLUDED.sog, zone=EXCLUDED.zone, kind=EXCLUDED.kind, seen=EXCLUDED.seen""",
                rows,
            )
        for z, c in counts.items():
            cur.execute("INSERT INTO ais_zone (ts, zone, total, tankers, cargo) VALUES (%s,%s,%s,%s,%s)",
                        (now, z, c["total"], c["tank"], c["last"]))
        cur.execute("DELETE FROM ais_positions WHERE seen < now() - interval '2 days'")
        cur.execute("DELETE FROM ais_zone WHERE ts < now() - interval '400 days'")
    conn.commit()
    print("  AIS: " + ", ".join(f"{z} {c['total']} ({c['tank']} tank)" for z, c in counts.items()))
    return len(pos)
