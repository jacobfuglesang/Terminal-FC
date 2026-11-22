"""Runde 7: rå lusedata for feilsøking + Groq-modeller."""
import os, json, gzip, requests
OUT = "probe/out7"; os.makedirs(OUT, exist_ok=True)
res = {}
cid, sec = os.environ.get("BW_CLIENT_ID"), os.environ.get("BW_CLIENT_SECRET")
tok = requests.post("https://id.barentswatch.no/connect/token", data={"client_id": cid, "client_secret": sec, "scope": "api", "grant_type": "client_credentials"}, timeout=30).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
for w in (46, 47):
    r = requests.post(f"https://www.barentswatch.no/bwapi/v2/geodata/fishhealth/locality/2026/{w}", json={}, headers=h, timeout=90)
    js = r.json()
    for l in (js if isinstance(js, list) else js.get("localities", [])):
        l.pop("geometry", None)
    with gzip.open(f"{OUT}/w{w}.json.gz", "wt", encoding="utf-8") as f:
        json.dump(js, f, ensure_ascii=False)
    res[f"w{w}"] = {"status": r.status_code, "type": type(js).__name__}
k = os.environ.get("GROQ_API_KEY", "")
res["groq_key_shape"] = {"len": len(k), "prefix": k[:4], "has_space": k != k.strip(), "has_bearer": k.lower().startswith("bearer")}
if k:
    r = requests.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {k.strip()}"}, timeout=30)
    res["models_status"] = r.status_code
    try:
        res["models"] = sorted(m["id"] for m in r.json().get("data", []))
    except Exception:
        res["models_body"] = r.text[:500]
    r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {k.strip()}"},
                      json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "Si hei på norsk."}], "max_tokens": 20}, timeout=30)
    res["chat_status"] = r.status_code; res["chat_body"] = r.text[:600]
json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1)
