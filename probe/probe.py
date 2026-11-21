"""Runde 2: Fiskeridir-xlsx, SSR for lakseaksjer, BarentsWatch-dokumentasjon."""
import os, json, io, requests
H = {"User-Agent": "Mozilla/5.0 FUGLESANG-probe"}
OUT = "probe/out2"; os.makedirs(OUT, exist_ok=True)
import openpyxl
def dump_xlsx(name, url):
    r = requests.get(url, headers=H, timeout=60)
    with open(f"{OUT}/{name}.txt", "w", encoding="utf-8") as f:
        f.write(f"URL {url}\nSTATUS {r.status_code}\n")
        if r.status_code != 200: return
        wb = openpyxl.load_workbook(io.BytesIO(r.content), data_only=True)
        for ws in wb.worksheets:
            f.write(f"\n=== SHEET {ws.title} dims={ws.dimensions}\n")
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i < 40 or i > ws.max_row - 15:
                    f.write(repr(row)[:600] + "\n")
B = "https://register.fiskeridir.no/biomassestatistikk/BIOSTAT-LAKS-OMR/"
dump_xlsx("behfisk01_omr", B + "biostat-behfisk01-omr.xlsx")
dump_xlsx("behfisk02_omr_2026", B + "biostat-behfisk02-omr-2026.xlsx")
dump_xlsx("forforbruk01_omr", B + "biostat-forforbruk01-omr.xlsx")
dump_xlsx("svinn01_omr", B + "biostat-svinn01-omr.xlsx")
# SSR
data = requests.get("https://ssr.finanstilsynet.no/api/v2/instruments", headers=H, timeout=60).json()
keep = [d for d in data if any(k in (d.get("issuerName") or "").upper() for k in ["MOWI", "SALMAR", "BAKKAFROST", "LERØY", "LEROY", "GRIEG", "AUSTEVOLL"])]
for d in keep: d["events"] = d["events"][:5]
json.dump({"count_all": len(data), "salmon": keep}, open(f"{OUT}/ssr_salmon.json", "w"), ensure_ascii=False, indent=1)
# BarentsWatch docs
for k, u in {"bw_docs": "https://developer.barentswatch.no/docs/fishhealth/", "bw_openapi": "https://www.barentswatch.no/bwapi/openapi/fishhealth/openapi.json", "bw_swagger": "https://www.barentswatch.no/bwapi/swagger/fishhealth/swagger.json"}.items():
    try:
        r = requests.get(u, headers=H, timeout=40)
        open(f"{OUT}/{k}.txt", "w", encoding="utf-8").write(f"STATUS {r.status_code}\n" + r.text[:400000])
    except Exception as e:
        open(f"{OUT}/{k}.txt", "w").write(str(e))
