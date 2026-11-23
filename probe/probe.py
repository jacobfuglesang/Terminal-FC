"""Probe 12: meglerrapporter, bunkers, vær, arbitrasje, havner og global AIS."""
import asyncio
import io
import json
import os
import re
import time

import requests

OUT = "probe/out12"
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)"}
res = {}


def log(k, v):
    res[k] = v
    print(k, json.dumps(v, ensure_ascii=False, default=str)[:1200])


def get(url, **kw):
    try:
        return requests.get(url, headers=UA, timeout=30, **kw)
    except Exception as e:  # noqa: BLE001
        return e


for name, url in [
    ("hsn_weekly_cat", "https://www.hellenicshippingnews.com/category/report-analysis/weekly-shipping-market-reports/feed/"),
    ("hsn_reports_cat", "https://www.hellenicshippingnews.com/category/report-analysis/feed/"),
    ("hsn_search_weekly", "https://www.hellenicshippingnews.com/?s=%22weekly+market+report%22&feed=rss2"),
]:
    r = get(url)
    if isinstance(r, Exception):
        log(name, repr(r)); continue
    items = re.findall(r"<item>.*?<title>(.*?)</title>.*?<link>(.*?)</link>.*?<pubDate>(.*?)</pubDate>", r.text, re.S)
    cats = re.findall(r"<category><!\[CDATA\[(.*?)\]\]></category>", r.text)
    log(name, {"status": r.status_code, "n": len(items), "items": items[:15], "cats": sorted(set(cats))[:30]})
    if name == "hsn_weekly_cat" and items:
        import trafilatura
        for i, (_, l, _) in enumerate(items[:2]):
            a = get(l.strip())
            if not isinstance(a, Exception):
                t = trafilatura.extract(a.text) or ""
                log(f"hsn_article_{i}", {"url": l.strip(), "status": a.status_code, "chars": len(t), "start": t[:900]})

for name, url in [
    ("snb_global", "https://shipandbunker.com/prices"),
    ("snb_sin", "https://shipandbunker.com/prices/apac/sea/sg-sin-singapore"),
    ("snb_fjr", "https://shipandbunker.com/prices/emea/ae/fjr-fujaira"),
    ("hsn_bunker", "https://www.hellenicshippingnews.com/bunker-price-table"),
    ("snb_robots", "https://shipandbunker.com/robots.txt"),
    ("snb_terms", "https://shipandbunker.com/terms"),
]:
    r = get(url)
    if isinstance(r, Exception):
        log(name, repr(r)); continue
    txt = re.sub(r"<script.*?</script>|<style.*?</style>", " ", r.text, flags=re.S)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = re.sub(r"\s+", " ", txt)
    if "robots" in name:
        log(name, {"status": r.status_code, "text": r.text[:1200]})
    elif "terms" in name:
        i = max(0, txt.lower().find("scrap") - 300)
        log(name, {"status": r.status_code, "snip": txt[i:i + 1500]})
    else:
        i = max(0, txt.find("VLSFO") - 200)
        log(name, {"status": r.status_code, "len": len(r.text), "snip": txt[i:i + 1500]})

for name, url in [
    ("gdacs_tc", "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC"),
    ("gdacs_rss", "https://www.gdacs.org/xml/rss.xml"),
    ("nhc_current", "https://www.nhc.noaa.gov/CurrentStorms.json"),
]:
    r = get(url)
    if isinstance(r, Exception):
        log(name, repr(r)); continue
    log(name, {"status": r.status_code, "ct": r.headers.get("content-type"), "len": len(r.text), "start": r.text[:900]})

for name, url in [
    ("pan_pdf", "https://evtms-rpts.pancanal.com/eng/h2o/GatunWaterIndicators.pdf"),
    ("pan_aquatic", "https://panama.aquaticinformatics.net/Data/Chart/ChartId/3"),
]:
    r = get(url)
    if isinstance(r, Exception):
        log(name, repr(r)); continue
    info = {"status": r.status_code, "ct": r.headers.get("content-type"), "len": len(r.content)}
    if r.content[:4] == b"%PDF":
        from pypdf import PdfReader
        info["text"] = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(r.content)).pages)[:1500]
    else:
        info["start"] = r.text[:600]
    log(name, info)

import yfinance as yf
for sym in ["CL=F", "RB=F", "HO=F", "EURUSD=X", "JKM=F", "BZ=F", "TTF=F", "NG=F", "CO2.L", "CRBN.L", "QA=F"]:
    try:
        h = yf.Ticker(sym).history(period="10d")
        log(f"yf_{sym}", {"rows": len(h), "last": None if h.empty else [str(h.index[-1].date()), float(h["Close"].iloc[-1])]})
    except Exception as e:  # noqa: BLE001
        log(f"yf_{sym}", repr(e))

pw = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query"
r = get(pw, params={"where": "1=1", "outFields": "*", "resultRecordCount": 2, "orderByFields": "date DESC", "f": "json"})
if not isinstance(r, Exception):
    try:
        js = r.json()
        log("pw_ports_fields", [f["name"] for f in js.get("fields", [])])
        log("pw_ports_sample", [f["attributes"] for f in js.get("features", [])])
    except Exception as e:  # noqa: BLE001
        log("pw_ports_err", {"status": r.status_code, "text": r.text[:400], "e": repr(e)})
for port in ["Ras Tanura", "Fujairah", "Singapore", "Rotterdam", "Qingdao", "Port Hedland", "Houston", "Santos", "Ningbo", "Tubarao", "Shanghai", "Los Angeles"]:
    r = get(pw, params={"where": f"portname LIKE '%{port}%'", "outFields": "portid,portname,country", "returnDistinctValues": "true",
                        "returnGeometry": "false", "resultRecordCount": 5, "f": "json"})
    if not isinstance(r, Exception):
        try:
            log(f"pw_port_{port}", [f["attributes"] for f in r.json().get("features", [])])
        except Exception as e:  # noqa: BLE001
            log(f"pw_port_{port}", repr(e))

key = os.environ.get("AISSTREAM_API_KEY")
if key:
    import websockets

    async def listen():
        stats = {"pos": 0, "static": 0, "mmsi": set(), "types": {}, "draught": 0}
        sub = {"APIKey": key, "BoundingBoxes": [[[-90, -180], [90, 180]]], "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}
        t0 = time.time()
        try:
            async with websockets.connect("wss://stream.aisstream.io/v0/stream", open_timeout=30, max_size=None) as ws:
                await ws.send(json.dumps(sub))
                while time.time() - t0 < 60:
                    try:
                        m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                    except asyncio.TimeoutError:
                        continue
                    mt = m.get("MessageType")
                    stats["mmsi"].add(m.get("MetaData", {}).get("MMSI"))
                    if mt == "PositionReport":
                        stats["pos"] += 1
                    elif mt == "ShipStaticData":
                        stats["static"] += 1
                        sd = m["Message"]["ShipStaticData"]
                        t = sd.get("Type")
                        stats["types"][t] = stats["types"].get(t, 0) + 1
                        if sd.get("MaximumStaticDraught"):
                            stats["draught"] += 1
                        if "example_static" not in stats and 70 <= (t or 0) <= 89:
                            stats["example_static"] = {k: sd.get(k) for k in ("Name", "Type", "Dimension", "MaximumStaticDraught", "Destination", "ImoNumber")}
        except Exception as e:  # noqa: BLE001
            stats["err"] = repr(e)
        stats["mmsi"] = len(stats["mmsi"])
        stats["types"] = dict(sorted(stats["types"].items(), key=lambda x: -x[1])[:15])
        return stats

    log("ais_global_60s", asyncio.run(listen()))

with open(f"{OUT}/res.json", "w") as f:
    json.dump(res, f, ensure_ascii=False, indent=1, default=str)
