"""Probe 11: hvor står booking og dødpunkt i rapportene (Hafnia, Frontline, Okeanis, Höegh)?"""
import io, json, os, re
import requests
from pypdf import PdfReader
BASE = "https://api3.oslo.oslobors.no/v1/newsreader"
H = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)", "Accept": "application/json"}
OUT = "probe/out11"; os.makedirs(OUT, exist_ok=True)
res = {}
KEY = re.compile(r"(cover|booked|fixed|contracted|break[- ]?even|per day|/day)", re.I)
for name, mid in [("HAFNI", 686774), ("FRO", 687036), ("OET", 686252)]:
    msg = requests.get(f"{BASE}/message", params={"messageId": mid}, headers=H, timeout=30).json()["data"]["message"]
    texts = [("body", re.sub(r"<[^>]+>", " ", msg.get("body") or ""))]
    for a in msg.get("attachments") or []:
        r = requests.get(f"{BASE}/attachment", params={"messageId": mid, "attachmentId": a["id"]}, headers={"User-Agent": H["User-Agent"]}, timeout=90)
        if r.content[:4] == b"%PDF":
            for i, p in enumerate(PdfReader(io.BytesIO(r.content)).pages):
                texts.append((f"{a['name']} s.{i+1}", p.extract_text() or ""))
    hits = []
    for src, t in texts:
        for m in KEY.finditer(t):
            s = t[max(0, m.start() - 220): m.end() + 160].replace("\n", " ")
            hits.append(f"[{src}] ...{s}...")
    res[name] = {"title": msg.get("title"), "parts": len(texts), "chars": sum(len(t) for _, t in texts), "hits": hits[:25]}
    print(name, res[name]["title"], res[name]["parts"], res[name]["chars"], len(hits))
json.dump(res, open(f"{OUT}/res.json", "w"), ensure_ascii=False, indent=1)
