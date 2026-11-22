"""Runde 8: shippingkilder."""
import os, re, time, json, traceback, requests
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
     "Accept-Language": "en-US,en;q=0.9"}
OUT = "probe/out8"; os.makedirs(OUT, exist_ok=True)
res = {}
def save(): json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1, default=str)
def tryit(name, fn):
    t0 = time.time()
    try: res[name] = fn()
    except Exception as e: res[name] = {"error": repr(e)[:400], "tb": traceback.format_exc()[-600:]}
    if isinstance(res[name], dict): res[name]["_secs"] = round(time.time() - t0, 1)
    save()

SHIP = ["FRO.OL","HAFNI.OL","OET.OL","ODF.OL","SNI.OL","BELCO.OL","2020.OL","HSHP.OL","MPCC.OL","WAWI.OL","HAUTO.OL",
        "BWLPG.OL","FLNG.OL","COOL.OL","KCC.OL","GOGL.OL","CMBTO.OL","AGAS.OL","WWI.OL","WWIB.OL","EWIND.OL","HUNT.OL",
        "BWO.OL","SOFF.OL","DOFG.OL","STSU.OL","AMSC.OL","OKEA.OL","EQNR.OL","JIN.OL","GOGL","FRO","CMBT","HAFN"]
OTHER = ["BDRY","BWET","BZ=F","CL=F","NG=F","TTF=F","HG=F","TIO=F","ZS=F","ZW=F","NOK=X","EURNOK=X","^OSEAX","OSEBX.OL","^GSPC","ZIM","SBLK","DHT"]

def yahoo():
    import yfinance as yf
    out = {}
    for s in SHIP + OTHER:
        try:
            t = yf.Ticker(s)
            h = t.history(period="1y", interval="1d")
            info = {}
            try:
                i = t.info or {}
                info = {k: i.get(k) for k in ("shortName","longName","currency","exchange","marketCap","dividendYield","industry")}
            except Exception as e:
                info = {"err": repr(e)[:80]}
            out[s] = {"rows": len(h), "last": float(h["Close"].iloc[-1]) if len(h) else None, "last_date": str(h.index[-1])[:10] if len(h) else None, **info}
        except Exception as e:
            out[s] = {"error": repr(e)[:120]}
    try:
        out["_div_FRO"] = {str(k)[:10]: float(v) for k, v in yf.Ticker("FRO.OL").dividends.tail(6).items()}
        out["_div_HAFNI"] = {str(k)[:10]: float(v) for k, v in yf.Ticker("HAFNI.OL").dividends.tail(6).items()}
    except Exception as e:
        out["_div"] = repr(e)
    return out
tryit("yahoo", yahoo)

def newsweb():
    out = {}
    for sign in ["FRO","HAFNI","OET","ODF","SNI","BELCO","2020","HSHP","MPCC","WAWI","HAUTO","BWLPG","FLNG","COOL","KCC","GOGL","CMBTO","AGAS","WWI","EWIND"]:
        try:
            r = requests.get("https://api3.oslo.oslobors.no/v1/newsreader/list", params={"issuer": sign, "fromDate": "2026-09-01", "toDate": "2026-11-23"}, headers=H, timeout=20)
            msgs = (r.json().get("data") or {}).get("messages") or []
            out[sign] = {"n": len(msgs), "issuer": msgs[0].get("issuerName") if msgs else None, "titles": [m["title"] for m in msgs[:3]]}
        except Exception as e:
            out[sign] = repr(e)[:120]
    return out
tryit("newsweb", newsweb)

def shorts():
    r = requests.get("https://ssr.finanstilsynet.no/api/v2/instruments", headers=H, timeout=40)
    js = r.json()
    pat = re.compile(r"frontline|hafnia|okeanis|odfjell|stolt|belships|2020 bulkers|himalaya|mpc container|wallenius|h[øo]egh|bw lpg|flex lng|cool co|klaveness|golden ocean|cmb|avance|wilh", re.I)
    hits = [{k: x.get(k) for k in ("isin","issuerName","name")} | {"n_events": len(x.get("events") or [])} for x in js if pat.search(str(x.get("issuerName") or x.get("name") or ""))]
    return {"total": len(js), "hits": hits, "sample_keys": list(js[0].keys()) if js else []}
tryit("shorts", shorts)

def portwatch():
    base = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query"
    r = requests.get(base, params={"where": "1=1", "outFields": "*", "orderByFields": "date DESC", "resultRecordCount": 60, "f": "json"}, headers=H, timeout=60)
    js = r.json()
    feats = [f["attributes"] for f in js.get("features", [])]
    return {"status": r.status_code, "n": len(feats), "fields": list(feats[0].keys()) if feats else js, "sample": feats[:3],
            "names": sorted({(f.get("portid"), f.get("portname")) for f in feats}, key=str)}
tryit("portwatch", portwatch)

def baltic():
    out = {}
    for seg in ["tanker", "dry"]:
        for w in (46, 47):
            for pat in [f"https://www.balticexchange.com/en/data-services/WeeklyRoundup/{seg}/news/2026/{seg}-report-week-{w}.html"]:
                try:
                    r = requests.get(pat, headers=H, timeout=25)
                    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))
                    i = max(txt.find("VLCC"), txt.find("Capesize"))
                    out[f"{seg}{w}"] = {"status": r.status_code, "len": len(r.text), "snippet": txt[i:i+900] if i > 0 else txt[:300]}
                except Exception as e:
                    out[f"{seg}{w}"] = repr(e)[:120]
    try:
        r = requests.get("https://www.balticexchange.com/en/data-services/WeeklyRoundup.html", headers=H, timeout=25)
        links = sorted(set(re.findall(r'href="([^"]*WeeklyRoundup[^"]*\.html)"', r.text)))
        out["index"] = {"status": r.status_code, "links": links[:40]}
    except Exception as e:
        out["index"] = repr(e)[:120]
    return out
tryit("baltic", baltic)

def drewry():
    out = {}
    for u in ["https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry", "https://www.drewry.co.uk/wci"]:
        try:
            r = requests.get(u, headers=H, timeout=25)
            txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))
            m = re.findall(r"World Container Index[^.]{0,120}\$[\d,]+ per 40ft[^.]*\.", txt)
            out[u] = {"status": r.status_code, "final": r.url, "matches": m[:4], "date": re.findall(r"assessment for [A-Za-z]+, \d+ \w+ \d{4}", txt)[:2]}
        except Exception as e:
            out[u] = repr(e)[:120]
    return out
tryit("drewry", drewry)

def scfi():
    out = {}
    for u in ["https://en.sse.net.cn/indices/scfinew.jsp", "https://www.sse.net.cn/index/singleIndex?indexType=scfi"]:
        try:
            r = requests.get(u, headers=H, timeout=25)
            out[u] = {"status": r.status_code, "len": len(r.text), "snippet": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))[:600]}
        except Exception as e:
            out[u] = repr(e)[:120]
    return out
tryit("scfi", scfi)

def feeds():
    import feedparser, trafilatura
    G = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="
    F = {"splash247": "https://splash247.com/feed/", "hellenic": "https://www.hellenicshippingnews.com/feed/", "gcaptain": "https://gcaptain.com/feed/",
         "maritime_exec": "https://maritime-executive.com/articles.rss", "seatrade": "https://www.seatrade-maritime.com/rss.xml",
         "freightwaves_mar": "https://www.freightwaves.com/news/category/news/maritime/feed", "offshore_energy": "https://www.offshore-energy.biz/feed/",
         "g_tradewinds": G + "site:tradewindsnews.com+when:3d", "g_lloyds": G + "site:lloydslist.com+when:3d",
         "g_no_shipping": "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q=shipping+OR+rederi+OR+tankskip+OR+tørrbulk+when:3d"}
    out = {}
    for k, u in F.items():
        try:
            r = requests.get(u, headers=H, timeout=25)
            f = feedparser.parse(r.content)
            it = {"status": r.status_code, "n": len(f.entries), "titles": [e.get("title") for e in f.entries[:3]]}
            if f.entries and "news.google" not in u:
                link = f.entries[0].get("link")
                rr = requests.get(link, headers=H, timeout=20)
                if "charset" not in (rr.headers.get("content-type") or "").lower(): rr.encoding = "utf-8"
                body = trafilatura.extract(rr.text, favor_recall=True) or ""
                it["article_status"] = rr.status_code; it["article_len"] = len(body); it["article_start"] = body[:200]
            out[k] = it
        except Exception as e:
            out[k] = repr(e)[:150]
        save()
    return out
tryit("feeds", feeds)

def eia():
    out = {}
    for u in ["https://ir.eia.gov/wpsr/table1.csv", "https://www.eia.gov/petroleum/supply/weekly/csv/table1.csv",
              "https://fred.stlouisfed.org/graph/fredgraph.csv?id=WCESTUS1&cosd=2025-01-01"]:
        try:
            r = requests.get(u, headers=H, timeout=(8, 20))
            out[u] = {"status": r.status_code, "type": r.headers.get("content-type"), "head": r.text[:500]}
        except Exception as e:
            out[u] = repr(e)[:150]
    return out
tryit("eia", eia)
print("ferdig")
