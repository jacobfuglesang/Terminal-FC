"""Runde 3: alternative kilder for fôrråvarer (FRED er tregt fra GitHub)."""
import os, time, requests
H = {"User-Agent": "Mozilla/5.0 FUGLESANG-probe"}
OUT = "probe/out3"; os.makedirs(OUT, exist_ok=True)
URLS = {
 "dbn_pfish": "https://api.db.nomics.world/v22/series/IMF/PCPS/M.W00.PFISH.USD?observations=1",
 "dbn_search": "https://api.db.nomics.world/v22/series/IMF/PCPS?q=fish%20meal&limit=5",
 "dbn_dims": "https://api.db.nomics.world/v22/datasets/IMF/PCPS",
 "fred_fish": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PFISHUSDM&cosd=2024-01-01",
 "imf_xls_head": "https://www.imf.org/-/media/Files/Research/CommodityPrices/Monthly/external-data.xls",
}
with open(f"{OUT}/summary.txt", "w", encoding="utf-8") as s:
    for k, u in URLS.items():
        t0 = time.time()
        try:
            r = requests.get(u, headers=H, timeout=(10, 30))
            s.write(f"{k}: {r.status_code} {r.headers.get('content-type')} {len(r.content)}B {time.time()-t0:.1f}s\n")
            with open(f"{OUT}/{k}.txt", "w", encoding="utf-8") as f:
                f.write(r.text[:6000] if "xls" not in k else repr(r.content[:300]))
        except Exception as e:
            s.write(f"{k}: FEIL {e} {time.time()-t0:.1f}s\n")
