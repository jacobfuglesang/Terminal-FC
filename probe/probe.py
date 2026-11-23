"""Probe 13: content signals, bunkertabell-leverandør, PortWatch havnedatasett."""
import json, os, re
import requests
OUT = "probe/out13"; os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)"}
res = {}
def log(k, v):
    res[k] = v; print(k, json.dumps(v, ensure_ascii=False, default=str)[:1500])
r = requests.get("https://shipandbunker.com/robots.txt", headers=UA, timeout=30)
log("snb_signals", [l for l in r.text.splitlines() if l.lower().startswith(("content-signal", "user-agent", "disallow"))][:40])
r = requests.get("https://www.hellenicshippingnews.com/bunker-price-table", headers=UA, timeout=30)
i = r.text.find("provided by")
log("hsn_widget_src", {"around": r.text[max(0, i - 1500): i + 600], "iframes": re.findall(r"<iframe[^>]+src=\"([^\"]+)\"", r.text)[:5],
                       "scripts": [s for s in re.findall(r"<script[^>]+src=\"([^\"]+)\"", r.text) if "bunker" in s.lower()][:5]})
r = requests.get("https://www.hellenicshippingnews.com/robots.txt", headers=UA, timeout=30)
log("hsn_robots", r.text[:1500])
# PortWatch: finn havnedatasett
for q in ["Daily_Ports_Data", "Daily_Port_Activity_Data_and_Trade_Estimates", "PortWatch_ports_database", "Ports"]:
    url = f"https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/{q}/FeatureServer/0/query"
    try:
        rr = requests.get(url, params={"where": "1=1", "outFields": "*", "resultRecordCount": 1, "f": "json"}, headers=UA, timeout=40)
        js = rr.json()
        log(f"pw_{q}", {"status": rr.status_code, "err": js.get("error"), "fields": [f["name"] for f in js.get("fields", [])][:60],
                        "sample": [f["attributes"] for f in js.get("features", [])][:1]})
    except Exception as e:
        log(f"pw_{q}", repr(e))
try:
    rr = requests.get("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services?f=json", headers=UA, timeout=40)
    log("pw_services", [s["name"] for s in rr.json().get("services", [])][:80])
except Exception as e:
    log("pw_services", repr(e))
json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1, default=str)
