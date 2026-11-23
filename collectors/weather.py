"""Vær som påvirker skipsfarten: tropiske stormer i hele verden (GDACS) og vannstanden i Panamakanalen.

- GDACS (Global Disaster Alert and Coordination System, FN og EU) gir orkaner, tyfoner og sykloner i alle hav,
  med varselnivå (grønn, oransje, rød). Vi regner ut avstanden til viktige havner og sund.
- Panamakanalen publiserer daglig offisiell vannstand i Gatun-sjøen, maks dypgang og tillegg for ferskvann.
  Lav vannstand gir lavere dypgang og færre passeringer, som binder opp flåte og kan presse ratene opp.
"""
import io
import math
import re
from datetime import date, datetime, timedelta, timezone

import requests

UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)"}
GDACS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
PANAMA = "https://evtms-rpts.pancanal.com/eng/h2o/GatunWaterIndicators.pdf"

# Viktige punkter for rederiene i terminalen (lat, lon)
PLACES = {
    "US Gulf (Houston)": (29.3, -94.8), "Mexicogolfen (offshore)": (27.0, -90.0), "Karibia/Panama": (9.3, -79.9),
    "Taiwanstredet": (24.0, 119.5), "Sør-Kinahavet": (15.0, 115.0), "Shanghai/Ningbo": (30.6, 122.1), "Qingdao": (36.0, 120.3),
    "Hongkong/Guangzhou": (22.3, 114.0), "Filippinene": (13.0, 123.0), "Japan": (34.0, 136.0), "Sør-Korea": (35.0, 129.0),
    "Singapore": (1.25, 103.8), "Bengalbukta/India øst": (17.0, 85.0), "Arabiahavet/India vest": (19.0, 70.0),
    "Hormuz/Fujairah": (25.5, 56.5), "Port Hedland (jernmalm)": (-20.3, 118.6), "Dampier (jernmalm)": (-20.6, 116.7),
    "Queensland (kull)": (-21.0, 149.5), "Madagaskar/Mosambik": (-20.0, 42.0), "Florida/US østkyst": (28.0, -79.0),
}
NEAR_KM = 700


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def storms(cur) -> int:
    since = (date.today() - timedelta(days=14)).isoformat()
    r = requests.get(GDACS, params={"eventlist": "TC", "fromdate": since}, headers=UA, timeout=40)
    r.raise_for_status()
    n = 0
    for f in r.json().get("features", []):
        p = f.get("properties", {})
        lon, lat = (f.get("geometry") or {}).get("coordinates", [None, None])[:2]
        if lat is None:
            continue
        near, dist = min(((name, km((lat, lon), pt)) for name, pt in PLACES.items()), key=lambda x: x[1])
        url = (p.get("url") or {}).get("report") if isinstance(p.get("url"), dict) else None
        cur.execute(
            """INSERT INTO weather_events (id, name, alert, country, lat, lon, from_date, to_date, near, near_km, url, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
               ON CONFLICT (id) DO UPDATE SET alert=EXCLUDED.alert, lat=EXCLUDED.lat, lon=EXCLUDED.lon, to_date=EXCLUDED.to_date,
                 near=EXCLUDED.near, near_km=EXCLUDED.near_km, country=EXCLUDED.country, updated_at=now()""",
            (f"TC{p.get('eventid')}", p.get("eventname") or p.get("name"), (p.get("alertlevel") or "").lower(), p.get("country"),
             lat, lon, p.get("fromdate"), p.get("todate"), near if dist <= NEAR_KM else None, round(dist), url),
        )
        n += 1
    cur.execute("DELETE FROM weather_events WHERE to_date < now() - interval '60 days'")
    return n


def panama(cur) -> dict | None:
    from pypdf import PdfReader

    r = requests.get(PANAMA, headers=UA, timeout=40)
    r.raise_for_status()
    if r.content[:4] != b"%PDF":
        return None
    text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(r.content)).pages[:1])
    ft = [float(x) for x in re.findall(r"(\d{2}\.\d)\s*ft", text)]
    pct = re.findall(r"(\d+\.\d+)%", text)
    if len(ft) < 3:
        return None
    # Datoen står med mellomrom inni ordene (f.eks. «N ov. 23, 2026»)
    m = re.search(r"for\s*\n?\s*([A-Z])\s?([a-z]{2})\.?\s*(\d{1,2}),\s*(\d{4})", text)
    try:
        day = datetime.strptime(f"{m.group(1)}{m.group(2)} {m.group(3)} {m.group(4)}", "%b %d %Y").date() if m else date.today()
    except ValueError:
        day = date.today()
    row = {"day": day, "gatun": ft[0], "neo": ft[1], "panamax": ft[2], "surcharge": float(pct[0]) if pct else None}
    cur.execute(
        """INSERT INTO panama (day, gatun_ft, draft_neo_ft, draft_panamax_ft, surcharge_pct) VALUES (%s,%s,%s,%s,%s)
           ON CONFLICT (day) DO UPDATE SET gatun_ft=EXCLUDED.gatun_ft, draft_neo_ft=EXCLUDED.draft_neo_ft,
             draft_panamax_ft=EXCLUDED.draft_panamax_ft, surcharge_pct=EXCLUDED.surcharge_pct""",
        (row["day"], row["gatun"], row["neo"], row["panamax"], row["surcharge"]),
    )
    return row


def run(conn, backfill: bool = False) -> int:
    out, errors = 0, []
    with conn.cursor() as cur:
        try:
            n = storms(cur)
            cur.execute("""SELECT name, alert, near, near_km FROM weather_events WHERE to_date > now() - interval '2 days'
                           ORDER BY near_km NULLS LAST""")
            active = cur.fetchall()
            print(f"  Stormer: {n} siste 14 dager, {len(active)} aktive"
                  + (": " + ", ".join(f"{a[0]} ({a[1]}, {a[3]:.0f} km fra {a[2]})" for a in active if a[2])[:300] if active else ""))
            out += n
        except Exception as e:  # noqa: BLE001
            errors.append(f"GDACS: {e}")
        try:
            p = panama(cur)
            if p:
                print(f"  Panama {p['day']}: Gatun {p['gatun']} ft, maks dypgang Neopanamax {p['neo']} ft / Panamax {p['panamax']} ft")
                out += 1
            else:
                errors.append("Panama: fant ikke tallene i PDF-en")
        except Exception as e:  # noqa: BLE001
            errors.append(f"Panama: {e}")
    conn.commit()
    for e in errors:
        print(f"  ! {e}")
    if not out:
        raise RuntimeError("; ".join(errors) or "Ingen værdata")
    return out
