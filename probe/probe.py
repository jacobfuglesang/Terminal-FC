"""Runde 5: fase 4-kilder."""
import os, time, json, traceback, requests
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
OUT = "probe/out5"; os.makedirs(OUT, exist_ok=True)
res = {}

def save():
    json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1, default=str)

def tryit(name, fn):
    t0 = time.time()
    try:
        res[name] = fn()
    except Exception as e:
        res[name] = {"error": repr(e)[:500], "tb": traceback.format_exc()[-800:]}
    if isinstance(res[name], dict):
        res[name]["_secs"] = round(time.time() - t0, 1)
    save()

# A. Newsweb
def newsweb():
    out = {}
    base = "https://api3.oslo.oslobors.no/v1/newsreader"
    for meth in ("GET", "POST"):
        try:
            u = f"{base}/list?issuer=MOWI&fromDate=2026-09-01&toDate=2026-11-22&category=&market=&messageTitle="
            r = requests.request(meth, u, headers=H, timeout=20)
            out[meth] = {"status": r.status_code, "type": r.headers.get("content-type"), "body": r.text[:1500]}
        except Exception as e:
            out[meth] = repr(e)
    try:
        r = requests.post(f"{base}/list?issuer=&fromDate=2026-11-01&toDate=2026-11-22", headers=H, timeout=20)
        js = r.json()
        msgs = js.get("data", {}).get("messages", []) if isinstance(js, dict) else []
        out["all_count"] = len(msgs)
        out["sample_msg"] = msgs[:2]
        if msgs:
            mid = msgs[0].get("messageId") or msgs[0].get("id")
            r2 = requests.post(f"{base}/message?messageId={mid}", headers=H, timeout=20)
            out["message"] = {"status": r2.status_code, "body": r2.text[:2000]}
    except Exception as e:
        out["all"] = repr(e)
    return out
tryit("newsweb", newsweb)

# B. Yahoo
def yahoo():
    import yfinance as yf
    out = {}
    for s in ["MOWI.OL", "GSF.OL", "BAKKA.OL"]:
        t = yf.Ticker(s); o = {}
        for attr in ["calendar", "earnings_estimate", "revenue_estimate", "eps_trend", "growth_estimates"]:
            try:
                v = getattr(t, attr)
                o[attr] = v.to_dict() if hasattr(v, "to_dict") else v
            except Exception as e:
                o[attr] = repr(e)[:200]
        try:
            q = t.quarterly_income_stmt
            o["q_rows"] = list(q.index)[:40]; o["q_cols"] = [str(c) for c in q.columns]
            o["q_rev"] = {str(k): v for k, v in q.loc["Total Revenue"].items()} if "Total Revenue" in q.index else None
            o["q_ebit"] = {str(k): v for k, v in q.loc["EBIT"].items()} if "EBIT" in q.index else None
        except Exception as e:
            o["q"] = repr(e)[:200]
        try:
            o["earn_dates"] = t.get_earnings_dates(limit=8).reset_index().astype(str).to_dict("records")
        except Exception as e:
            o["earn_dates"] = repr(e)[:200]
        try:
            i = t.info
            o["info"] = {k: i.get(k) for k in ["marketCap", "fullTimeEmployees", "currency", "financialCurrency", "trailingPE", "forwardPE", "dividendYield", "longBusinessSummary", "enterpriseValue", "sharesOutstanding"]}
        except Exception as e:
            o["info"] = repr(e)[:200]
        out[s] = o
    return out
tryit("yahoo", yahoo)

# C. Artikkeltekst
def articles():
    import feedparser, trafilatura
    out = {}
    try:
        from googlenewsdecoder import gnewsdecoder
    except Exception as e:
        gnewsdecoder = None; out["decoder_import"] = repr(e)
    G = "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q="
    feeds = {"ilaks": "https://ilaks.no/feed/", "dn": G + "site:dn.no+laks+when:14d", "e24": G + "site:e24.no+laks+when:14d",
             "laks": G + "lakseoppdrett+OR+havbruk+when:7d", "regj": "https://www.regjeringen.no/no/rss/Rss/2581966/"}
    for k, u in feeds.items():
        f = feedparser.parse(requests.get(u, headers=H, timeout=20).content)
        lst = []
        for e in f.entries[:3]:
            it = {"title": e.get("title"), "link": e.get("link")}
            cont = e.get("content")
            it["feed_content_len"] = len(cont[0].value) if cont else 0
            url = e.get("link")
            if "news.google.com" in url and gnewsdecoder:
                try:
                    d = gnewsdecoder(url, interval=1)
                    it["decoded"] = d
                    if d.get("status"):
                        url = d["decoded_url"]
                except Exception as ex:
                    it["decoded"] = repr(ex)[:200]
            try:
                r = requests.get(url, headers=H, timeout=20)
                it["fetch_status"] = r.status_code; it["final"] = r.url
                txt = trafilatura.extract(r.text, include_comments=False, favor_recall=True) or ""
                it["text_len"] = len(txt); it["text_start"] = txt[:400]; it["text_end"] = txt[-200:]
                md = trafilatura.extract_metadata(r.text)
                it["meta"] = {"title": md.title, "date": md.date, "sitename": md.sitename, "image": md.image} if md else None
            except Exception as ex:
                it["fetch"] = repr(ex)[:200]
            lst.append(it)
        out[k] = lst
        save()
    return out
tryit("articles", articles)

# D. Anlegg og eiere
def sites():
    out = {}
    cid, sec = os.environ.get("BW_CLIENT_ID"), os.environ.get("BW_CLIENT_SECRET")
    if cid:
        tok = requests.post("https://id.barentswatch.no/connect/token", data={"client_id": cid, "client_secret": sec, "scope": "api", "grant_type": "client_credentials"}, timeout=30).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.post("https://www.barentswatch.no/bwapi/v2/geodata/fishhealth/locality/2026/46", json={}, headers=h, timeout=60)
        js = r.json(); locs = js if isinstance(js, list) else js.get("localities", [])
        withrep = [l for l in locs if (l.get("liceReport") or {}).get("hasReported")]
        out["bw_sample"] = [{k: l.get(k) for k in ["aquaCultureRegister", "locality", "municipality", "productionArea", "diseases", "liceTreatments", "liceReport", "isFiltered"]} for l in withrep[:2]]
        for u in ["https://www.barentswatch.no/bwapi/v1/geodata/fishhealth/localities",
                  "https://www.barentswatch.no/bwapi/v1/geodata/fishhealth/locality/13209"]:
            r = requests.get(u, headers=h, timeout=60)
            out[u] = {"status": r.status_code, "body": r.text[:1500]}
    for u in ["https://api.fiskeridir.no/pub-aqua/api/v1/sites?range=0-2",
              "https://api.fiskeridir.no/pub-aqua/api/v1/sites/13209",
              "https://api.fiskeridir.no/pub-aqua/api/v1/licenses?range=0-2",
              "https://api.fiskeridir.no/pub-aqua/api/v1/entities?range=0-2"]:
        try:
            r = requests.get(u, headers={**H, "Accept": "application/json"}, timeout=30)
            out[u] = {"status": r.status_code, "type": r.headers.get("content-type"), "body": r.text[:1500]}
        except Exception as e:
            out[u] = repr(e)
    return out
tryit("sites", sites)
print("ferdig")
