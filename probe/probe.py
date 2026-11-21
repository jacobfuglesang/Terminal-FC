"""Runde 4: nyhetsstrømmer."""
import os, time, json, requests, feedparser
H = {"User-Agent": "Mozilla/5.0 (FUGLESANG; privat nyhetsleser)"}
OUT = "probe/out4"; os.makedirs(OUT, exist_ok=True)
G = "https://news.google.com/rss/search?hl=no&gl=NO&ceid=NO:no&q="
FEEDS = {
 "ilaks": "https://ilaks.no/feed/",
 "salmonbusiness": "https://www.salmonbusiness.com/feed/",
 "fishfarmingexpert": "https://www.fishfarmingexpert.com/rss",
 "kyst": "https://www.kyst.no/feed",
 "intrafish_no": "https://www.intrafish.no/rss",
 "seafood_no": "https://www.seafood.no/aktuelt/nyheter/rss/",
 "mattilsynet": "https://www.mattilsynet.no/rss",
 "regjeringen_rss": "https://www.regjeringen.no/no/rss/Rss/2581966/",
 "regjeringen_nfd": "https://www.regjeringen.no/no/rss/Rss/2581966/?departmentType=dep&department=nfd",
 "stortinget": "https://www.stortinget.no/no/Rss/",
 "google_laks": G + "lakseoppdrett+OR+havbruk+OR+lakseaksjer+when:7d",
 "google_dn": G + "site:dn.no+laks+when:14d",
 "google_regjeringen": G + "site:regjeringen.no+havbruk+OR+laks+when:30d",
 "google_e24": G + "site:e24.no+laks+when:14d",
}
res = {}
for k, u in FEEDS.items():
    t0 = time.time()
    try:
        r = requests.get(u, headers=H, timeout=(10, 25))
        f = feedparser.parse(r.content)
        items = [{"title": e.get("title"), "link": e.get("link"), "published": e.get("published"),
                  "summary": (e.get("summary") or "")[:300], "source": (e.get("source") or {}).get("title") if isinstance(e.get("source"), dict) else None}
                 for e in f.entries[:4]]
        res[k] = {"status": r.status_code, "type": r.headers.get("content-type"), "n": len(f.entries), "secs": round(time.time()-t0, 1),
                  "final_url": r.url, "items": items}
    except Exception as e:
        res[k] = {"error": str(e), "secs": round(time.time()-t0, 1)}
json.dump(res, open(f"{OUT}/feeds.json", "w"), ensure_ascii=False, indent=1)
