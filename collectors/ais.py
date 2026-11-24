"""Skipsposisjoner fra aisstream.io for hele verden (gratis, krever egen nøkkel).

aisstream.io bygger på mottakere på land, så dekningen er god nær kysten, i sund og ved havner,
men har hull ute på åpent hav. Vi lytter et par minutter per kjøring og samler opp:
- siste posisjon per skip (beholdes i 3 døgn), med fart, kurs og dypgang
- skipsdata (type, lengde, maks dypgang, destinasjon), som bygges opp over tid
- telling per nøkkelområde, også hvor mange som ligger stille (ankret eller venter) = trengsel

Lastet eller ballast anslås ut fra dypgang mot typisk konstruksjonsdypgang for skipets lengde.
Det er et grovt anslag og merkes slik i terminalen.
"""
import asyncio
import json
import os
import time
from datetime import datetime, timezone


class MissingKey(Exception):
    pass


# Nøkkelområder: sund, kanaler og ankringsområder ved store laste- og lossehavner
# (navn, [[lat_sør, lon_vest], [lat_nord, lon_øst]])
ZONES = {
    "Hormuz": [[24.0, 54.5], [27.5, 58.5]],
    "Fujairah ankring": [[24.9, 56.3], [25.4, 56.7]],
    "Bab el-Mandeb": [[11.5, 42.0], [15.5, 45.5]],
    "Suez": [[29.5, 32.0], [31.7, 33.0]],
    "Singapore": [[0.9, 103.3], [1.6, 104.6]],
    "Malakkastredet": [[1.5, 99.5], [5.5, 103.3]],
    "Gibraltar": [[35.6, -6.3], [36.3, -5.0]],
    "Dover": [[50.6, 0.8], [51.3, 2.0]],
    "Rotterdam": [[51.8, 3.5], [52.2, 4.3]],
    "Panama": [[8.7, -80.2], [9.6, -79.3]],
    "Kapp det gode håp": [[-36.5, 16.5], [-33.0, 21.0]],
    "Qingdao": [[35.5, 119.8], [36.4, 120.9]],
    "Ningbo-Zhoushan": [[29.5, 121.7], [30.4, 122.8]],
    "Port Hedland": [[-20.4, 118.2], [-19.6, 119.0]],
    "Tubarão/Vitória": [[-20.6, -40.4], [-20.0, -39.9]],
    "US Gulf (Houston/Galveston)": [[28.8, -95.4], [29.8, -94.3]],
    "Ras Tanura": [[26.4, 49.9], [27.0, 50.5]],
    "Taiwanstredet": [[22.5, 118.5], [25.5, 121.0]],
    "Bosporus": [[40.9, 28.8], [41.3, 29.2]],
}

STILL_KN = 0.7  # under denne farten regnes skipet som stillestående (ankret, fortøyd eller venter)


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


def size_class(k: str, length: float | None) -> str | None:
    """Grov størrelsesklasse ut fra lengde (AIS oppgir ikke dødvekt)."""
    if not length or length < 50:
        return None
    if k == "tank":
        return ("VLCC" if length >= 300 else "Suezmax" if length >= 255 else "Aframax/LR2" if length >= 220
                else "MR/LR1" if length >= 160 else "Liten tanker")
    if k == "last":
        return ("Capesize/ULCV" if length >= 280 else "Panamax/Kamsarmax" if length >= 220 else "Supramax/Ultramax" if length >= 180
                else "Handysize" if length >= 130 else "Lite lasteskip")
    return None


def laden(length: float | None, draught: float | None) -> bool | None:
    """Anslag: lastet hvis dypgangen er minst 75 % av typisk konstruksjonsdypgang (ca. 6,4 % av lengden)."""
    if not length or not draught or length < 100 or draught <= 0.5:
        return None
    return draught >= 0.75 * 0.064 * length


async def listen(key: str, seconds: int) -> tuple[dict, dict]:
    import websockets

    pos, static = {}, {}
    sub = {"APIKey": key, "BoundingBoxes": [[[-90, -180], [90, 180]]], "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}
    async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=20, max_size=None) as ws:
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
                lat, lon = md.get("latitude", p.get("Latitude")), md.get("longitude", p.get("Longitude"))
                if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
                    continue
                cog = p.get("Cog")
                pos[mmsi] = {"lat": lat, "lon": lon, "sog": p.get("Sog"), "cog": cog if cog is not None and cog < 360 else None,
                             "name": (md.get("ShipName") or "").strip()}
            elif msg.get("MessageType") == "ShipStaticData":
                s = msg["Message"]["ShipStaticData"]
                d = s.get("Dimension") or {}
                length = (d.get("A") or 0) + (d.get("B") or 0)
                static[mmsi] = {"type": s.get("Type"), "dest": (s.get("Destination") or "").strip()[:40],
                                "draught": s.get("MaximumStaticDraught"), "name": (s.get("Name") or "").strip(),
                                "length": length or None, "imo": s.get("ImoNumber") or None}
    return pos, static


def run(conn, seconds: int = 150) -> int:
    key = os.environ.get("AISSTREAM_API_KEY", "").strip()
    if not key:
        raise MissingKey("Venter på aisstream-nøkkel (AISSTREAM_API_KEY)")
    from websockets.exceptions import WebSocketException

    try:
        pos, static = asyncio.run(listen(key, seconds))
    except (TimeoutError, OSError, asyncio.TimeoutError, WebSocketException) as e:
        # aisstream er av og til nede; da hopper vi over denne gangen i stedet for å melde feil
        raise MissingKey(f"aisstream svarte ikke ({type(e).__name__}), prøver igjen neste kjøring") from e
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO ais_ships (mmsi, name, ship_type, dest, draught, length, imo, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s, now())
               ON CONFLICT (mmsi) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''), ais_ships.name), ship_type=EXCLUDED.ship_type,
                 dest=EXCLUDED.dest, draught=EXCLUDED.draught, length=COALESCE(EXCLUDED.length, ais_ships.length),
                 imo=COALESCE(EXCLUDED.imo, ais_ships.imo), updated_at=now()""",
            [(m, s["name"], s["type"], s["dest"], s["draught"], s["length"], s["imo"]) for m, s in static.items()],
        )
        cur.execute("SELECT mmsi, ship_type, length, draught, dest FROM ais_ships WHERE mmsi = ANY(%s)", (list(pos),))
        info = {r[0]: r[1:] for r in cur.fetchall()}
        counts = {z: {"total": 0, "tank": 0, "last": 0, "still": 0, "still_tank": 0, "still_last": 0} for z in ZONES}
        rows = []
        for mmsi, p in pos.items():
            t, length, draught, dest = info.get(mmsi, (None, None, None, None))
            k = kind(t)
            z = zone_of(p["lat"], p["lon"])
            still = p["sog"] is not None and p["sog"] < STILL_KN
            if z:
                c = counts[z]
                c["total"] += 1
                if k in ("tank", "last"):
                    c[k] += 1
                if still:
                    c["still"] += 1
                    if k in ("tank", "last"):
                        c[f"still_{k}"] += 1
            # Lagrer bare tank- og lasteskip, og skip vi ennå ikke vet typen på (typen kommer ofte i en senere kjøring)
            if k in ("tank", "last", "ukjent"):
                rows.append((mmsi, p["name"], p["lat"], p["lon"], p["sog"], p["cog"], z, k, size_class(k, length),
                             laden(length, draught), dest, now))
        cur.executemany(
            """INSERT INTO ais_positions (mmsi, name, lat, lon, sog, cog, zone, kind, size, laden, dest, seen)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (mmsi) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''), ais_positions.name), lat=EXCLUDED.lat,
                 lon=EXCLUDED.lon, sog=EXCLUDED.sog, cog=EXCLUDED.cog, zone=EXCLUDED.zone, kind=EXCLUDED.kind, size=EXCLUDED.size,
                 laden=EXCLUDED.laden, dest=COALESCE(NULLIF(EXCLUDED.dest,''), ais_positions.dest), seen=EXCLUDED.seen""",
            rows,
        )
        # Skip som ble sett før typen var kjent: fyll inn type, størrelse og lastet/ballast når skipsdata finnes
        cur.execute("""UPDATE ais_positions p SET kind = CASE WHEN s.ship_type BETWEEN 80 AND 89 THEN 'tank'
                         WHEN s.ship_type BETWEEN 70 AND 79 THEN 'last' ELSE 'annet' END
                       FROM ais_ships s WHERE p.mmsi = s.mmsi AND p.kind = 'ukjent' AND s.ship_type IS NOT NULL""")
        cur.execute("DELETE FROM ais_positions WHERE kind = 'annet' OR seen < now() - interval '3 days'")
        cur.executemany(
            """INSERT INTO ais_zone (ts, zone, total, tankers, cargo, still, still_tank, still_last) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (ts, zone) DO NOTHING""",
            [(now, z, c["total"], c["tank"], c["last"], c["still"], c["still_tank"], c["still_last"]) for z, c in counts.items()],
        )
        cur.execute("DELETE FROM ais_zone WHERE ts < now() - interval '400 days'")
        cur.execute("DELETE FROM ais_ships WHERE updated_at < now() - interval '120 days'")
        cur.execute("SELECT count(*), count(*) FILTER (WHERE kind = 'tank'), count(*) FILTER (WHERE kind = 'last') FROM ais_positions")
        tot, nt, nl = cur.fetchone()
    conn.commit()
    busy = sorted(counts.items(), key=lambda x: -x[1]["total"])[:6]
    print(f"  AIS: {len(pos)} skip hørt nå, {len(static)} med skipsdata. I kartet: {tot} ({nt} tank, {nl} last) siste 3 døgn")
    print("  Områder: " + ", ".join(f"{z} {c['total']} ({c['still']} stille)" for z, c in busy))
    return len(pos)
