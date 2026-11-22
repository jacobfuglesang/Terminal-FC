"""Probe 10: Newsweb-vedlegg (rapport-PDF), PDF-tekst og Groq-grenser for lange tekster."""
import io
import json
import os
import time
from datetime import date, timedelta

import requests
from pypdf import PdfReader

OUT = "probe/out10"
os.makedirs(OUT, exist_ok=True)
BASE = "https://api3.oslo.oslobors.no/v1/newsreader"
H = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)", "Accept": "application/json"}
res = {}


def log(k, v):
    res[k] = v
    print(k, json.dumps(v, ensure_ascii=False)[:1500])


today = date.today()
found = []
for issuer in ["FRO", "OET", "HAFNI", "WAWI", "MPCC", "BWLPG"]:
    try:
        r = requests.get(f"{BASE}/list", params={"issuer": issuer, "fromDate": (today - timedelta(days=150)).isoformat(),
                                                 "toDate": today.isoformat()}, headers=H, timeout=30)
        msgs = r.json().get("data", {}).get("messages", [])
        msgs = [m for m in msgs if m.get("issuerSign") == issuer]
        reps = [m for m in msgs if any(x in (m.get("title") or "").lower() for x in ("result", "quarter", "q3", "third"))]
        log(f"list_{issuer}", [{"id": m.get("messageId"), "t": m.get("title"), "att": m.get("numbAttachments"),
                                "cat": [c.get("category_en") for c in m.get("category", [])]} for m in reps[:4]])
        if reps:
            found.append((issuer, reps[0]))
        if issuer == "FRO" and msgs:
            log("list_keys", list(msgs[0].keys()))
    except Exception as e:
        log(f"list_{issuer}_err", repr(e))

for issuer, m in found[:4]:
    mid = m["messageId"]
    try:
        r = requests.get(f"{BASE}/message", params={"messageId": mid}, headers=H, timeout=30)
        msg = r.json().get("data", {}).get("message", {})
        log(f"msg_{issuer}_keys", list(msg.keys()))
        atts = msg.get("attachments") or []
        log(f"msg_{issuer}_atts", atts[:5])
        body = msg.get("body") or ""
        log(f"msg_{issuer}_bodylen", len(body))
        for a in atts[:3]:
            aid = a.get("id") or a.get("attachmentId")
            name = a.get("name") or a.get("fileName")
            for url, params in [
                (f"{BASE}/attachment", {"messageId": mid, "attachmentId": aid}),
                (f"https://api3.oslo.oslobors.no/v1/newsreader/attachment", {"messageId": mid, "attachmentId": aid}),
                (f"https://newsweb.oslobors.no/obsvc/attachment.obsvc", {"messageId": mid, "attachmentId": aid}),
            ]:
                try:
                    rr = requests.get(url, params=params, headers={"User-Agent": H["User-Agent"]}, timeout=60)
                    ct = rr.headers.get("content-type")
                    log(f"att_{issuer}_{aid}_{url[-25:]}", {"status": rr.status_code, "ct": ct, "len": len(rr.content), "name": name})
                    if rr.ok and rr.content[:4] == b"%PDF":
                        pdf = PdfReader(io.BytesIO(rr.content))
                        pages = [p.extract_text() or "" for p in pdf.pages]
                        txt = "\n".join(pages)
                        log(f"pdf_{issuer}_{aid}", {"pages": len(pages), "chars": len(txt), "p1": pages[0][:600],
                                                     "has_booked": [i for i, p in enumerate(pages) if "booked" in p.lower() or "covered" in p.lower()][:8],
                                                     "has_breakeven": [i for i, p in enumerate(pages) if "break" in p.lower() and "even" in p.lower()][:8]})
                        with open(f"{OUT}/{issuer}_{aid}.txt", "w") as f:
                            f.write(txt[:20000])
                        break
                except Exception as e:
                    log(f"att_{issuer}_{aid}_err", repr(e))
    except Exception as e:
        log(f"msg_{issuer}_err", repr(e))

# Groq: grenser for tokens per minutt og forespørselsstørrelse
key = os.environ.get("GROQ_API_KEY")
if key:
    hd = {"Authorization": f"Bearer {key}"}
    models = [m["id"] for m in requests.get("https://api.groq.com/openai/v1/models", headers=hd, timeout=30).json().get("data", [])]
    log("groq_models", models)
    for model in ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b"]:
        if model not in models:
            continue
        r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=hd, timeout=60,
                          json={"model": model, "messages": [{"role": "user", "content": "Si hei"}], "max_completion_tokens": 20})
        log(f"groq_{model}", {"status": r.status_code, **{k: v for k, v in r.headers.items() if k.lower().startswith("x-ratelimit")}})
        time.sleep(2)
    # Stor forespørsel: ~12k tokens
    big = "Frontline reported strong results. " * 1700
    r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=hd, timeout=90,
                      json={"model": "openai/gpt-oss-120b", "messages": [{"role": "user", "content": big + "\nOppsummer i én setning."}],
                            "max_completion_tokens": 100, "reasoning_effort": "low"})
    log("groq_big120", {"status": r.status_code, "body": r.text[:300]})
    time.sleep(3)
    r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=hd, timeout=90,
                      json={"model": "openai/gpt-oss-20b", "messages": [{"role": "user", "content": big + "\nOppsummer i én setning."}],
                            "max_completion_tokens": 100, "reasoning_effort": "low"})
    log("groq_big20", {"status": r.status_code, "body": r.text[:300]})

with open(f"{OUT}/res.json", "w") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
