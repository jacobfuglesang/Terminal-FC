"""Henter prøver fra kandidat-endepunkter og lagrer dem i probe/out/ (kun for utvikling)."""
import os, re, json, requests
H = {"User-Agent": "Mozilla/5.0 FUGLESANG-probe"}
OUT = "probe/out"; os.makedirs(OUT, exist_ok=True)
URLS = {
 "ssr_v2_instruments": "https://ssr.finanstilsynet.no/api/v2/instruments",
 "ssr_v2_instruments_export": "https://ssr.finanstilsynet.no/api/v2/instruments/export-json",
 "ssr_v1_instruments": "https://ssr.finanstilsynet.no/api/v1/instruments",
 "ssr_swagger": "https://ssr.finanstilsynet.no/swagger/v2/swagger.json",
 "ssr_swagger_v1": "https://ssr.finanstilsynet.no/swagger/v1/swagger.json",
 "fred_csv": "https://fred.stlouisfed.org/graph/fredgraph.csv?id=PFISHUSDM,PSMEAUSDM,PROILUSDM,PWHEAMTUSDM,PSUNOUSDM",
 "fiskeridir_bio_po": "https://www.fiskeridir.no/statistikk-tall-og-analyse/data-og-statistikk-om-akvakultur/biomassestatistikk-etter-produksjonsomrade",
 "fiskeridir_bio_fylke": "https://www.fiskeridir.no/statistikk-tall-og-analyse/data-og-statistikk-om-akvakultur/biomassestatistikk-etter-fylke",
 "euronext_esf_page": "https://live.euronext.com/en/product/commodities-futures/ESF-DPAR",
 "euronext_esf_ajax": "https://live.euronext.com/en/ajax/getPricesFutures/commodities-futures/ESF/DPAR",
 "euronext_esf_ajax2": "https://live.euronext.com/en/ajax/getFullDownloadAjax/commodities-futures/ESF/DPAR",
 "fishpool_sisalmon": "https://fishpool.eu/sisalmoni/",
 "fishpool_forward": "https://fishpool.eu/?p=838",
 "fishpool_home": "https://fishpool.eu/",
 "fiskeridir_bio_root": "https://www.fiskeridir.no/statistikk-tall-og-analyse/data-og-statistikk-om-akvakultur",
}
summary = {}
for k, u in URLS.items():
    try:
        r = requests.get(u, headers=H, timeout=40)
        txt = r.text
        summary[k] = {"status": r.status_code, "type": r.headers.get("content-type"), "len": len(txt)}
        links = sorted(set(re.findall(r'href="([^"]+\.(?:xlsx|xls|csv|json|pdf)[^"]*)"', txt, re.I)))[:80]
        with open(f"{OUT}/{k}.txt", "w", encoding="utf-8") as f:
            f.write(f"URL {u}\nSTATUS {r.status_code}\nTYPE {r.headers.get('content-type')}\nLEN {len(txt)}\nLINKS {json.dumps(links, ensure_ascii=False, indent=0)}\n\n")
            f.write(txt[:60000])
    except Exception as e:
        summary[k] = {"error": str(e)}
json.dump(summary, open(f"{OUT}/_summary.json", "w"), indent=1)
print(json.dumps(summary, indent=1))
