"""Runde 9: SCFI, utgivernavn, Baltic-rapporter via Hellenic, AIS-test."""
import os, re, time, json, traceback, requests
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
OUT = "probe/out9"; os.makedirs(OUT, exist_ok=True)
res = {}
def save(): json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1, default=str)
def tryit(name, fn):
    try: res[name] = fn()
    except Exception as e: res[name] = {"error": repr(e)[:400], "tb": traceback.format_exc()[-600:]}
    save()

def scfi():
    out = {}
    for u in ["https://en.sse.net.cn/currentIndex?indexName=scfi", "https://en.sse.net.cn/currentIndex?indexName=ccfi"]:
        r = requests.get(u, headers={**H, "Referer": "https://en.sse.net.cn/indices/scfinew.jsp", "X-Requested-With": "XMLHttpRequest"}, timeout=25)
        out[u] = {"status": r.status_code, "body": r.text[:1500]}
    return out
tryit("scfi", scfi)

def issuers():
    r = requests.get("https://api3.oslo.oslobors.no/v1/newsreader/list", params={"fromDate": "2026-08-01", "toDate": "2026-11-23"}, headers=H, timeout=30)
    msgs = (r.json().get("data") or {}).get("messages") or []
    seen = {}
    for m in msgs:
        n = m.get("issuerName") or ""
        if re.search(r"2020|jinhui|flex|cool co|belships|golden ocean|odfjell|stolt", n, re.I):
            seen[n] = m.get("issuerSign")
    return {"n": len(msgs), "matches": seen}
tryit("issuers", issuers)

def hellenic():
    import feedparser
    out = {}
    for name, u in {"tanker_cat": "https://www.hellenicshippingnews.com/category/shipping-news/tanker-market/feed/",
                    "dry_cat": "https://www.hellenicshippingnews.com/category/shipping-news/dry-bulk-market/feed/",
                    "search_tanker": "https://www.hellenicshippingnews.com/?s=%22Tanker+report%22&feed=rss2",
                    "search_cape": "https://www.hellenicshippingnews.com/?s=Capesize+Baltic+weekly&feed=rss2"}.items():
        try:
            f = feedparser.parse(requests.get(u, headers=H, timeout=25).content)
            items = []
            for e in f.entries[:15]:
                t = e.get("title", "")
                if re.search(r"tanker report|dry bulk market|capesize|weekly|vlcc", t, re.I):
                    txt = re.sub(r"<[^>]+>", " ", (e.get("content") or [{}])[0].get("value", "") if e.get("content") else e.get("summary", ""))
                    items.append({"title": t, "date": e.get("published"), "link": e.get("link"), "len": len(txt), "text": re.sub(r"\s+", " ", txt)[:700]})
            out[name] = {"n": len(f.entries), "hits": items[:5], "all_titles": [e.get("title") for e in f.entries[:12]]}
        except Exception as ex:
            out[name] = repr(ex)[:200]
    return out
tryit("hellenic", hellenic)

def ais():
    key = os.environ.get("AISSTREAM_API_KEY")
    if not key:
        return {"skip": "ingen nøkkel"}
    import asyncio, websockets
    async def go():
        n, types = 0, {}
        async with websockets.connect("wss://stream.aisstream.io/v0/stream") as ws:
            await ws.send(json.dumps({"APIKey": key, "BoundingBoxes": [[[24.0, 54.0], [28.0, 58.5]]], "FilterMessageTypes": ["PositionReport", "ShipStaticData"]}))
            t0 = time.time()
            while time.time() - t0 < 40:
                try:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                except asyncio.TimeoutError:
                    break
                n += 1
                types[msg.get("MessageType")] = types.get(msg.get("MessageType"), 0) + 1
        return {"messages": n, "types": types}
    return asyncio.run(go())
tryit("ais", ais)
