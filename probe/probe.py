"""Runde 6: artikkeltekst via dekodede Google News-lenker."""
import os, time, json, traceback, requests, feedparser, trafilatura
from googlenewsdecoder import gnewsdecoder
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
     "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.6"}
OUT = "probe/out6"; os.makedirs(OUT, exist_ok=True)
G = "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q="
feeds = {"dn": G + "site:dn.no+laks+when:14d", "e24": G + "site:e24.no+laks+when:14d",
         "laks": G + "lakseoppdrett+OR+havbruk+when:7d", "en": "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=salmon+farming+when:7d"}
res = {}
for k, u in feeds.items():
    f = feedparser.parse(requests.get(u, headers=H, timeout=20).content)
    lst = []
    for e in f.entries[:5]:
        it = {"title": e.get("title")}
        t0 = time.time()
        try:
            d = gnewsdecoder(e.link, interval=1)
            it["decoded"] = d
            url = d.get("decoded_url") if d.get("status") or d.get("success") else None
            if url:
                r = requests.get(url, headers=H, timeout=20)
                it["status"] = r.status_code
                txt = trafilatura.extract(r.text, favor_recall=True) or ""
                it["len"] = len(txt); it["start"] = txt[:300]; it["end"] = txt[-200:]
                md = trafilatura.extract_metadata(r.text)
                it["image"] = md.image if md else None
                it["paywall_hint"] = any(x in r.text for x in ["paywall", "Paywall", "abonnent", "Allerede abonnent", "Logg inn for å lese"])
        except Exception as ex:
            it["err"] = repr(ex)[:300]
        it["secs"] = round(time.time() - t0, 1)
        lst.append(it)
    res[k] = lst
    json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1)
# regjeringen med annen UA
for ua in ["Mozilla/5.0 (compatible; FeedFetcher-Google)", "curl/8.0"]:
    try:
        r = requests.get("https://www.regjeringen.no/no/aktuelt/vil-apne-nye-havomrader-for-oppdrett/id3193178/", headers={"User-Agent": ua}, timeout=20)
        res["regj_" + ua[:10]] = {"status": r.status_code, "len": len(trafilatura.extract(r.text) or "")}
    except Exception as ex:
        res["regj_" + ua[:10]] = repr(ex)
json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1)
