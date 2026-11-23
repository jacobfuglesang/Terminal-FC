"""Eksporterer terminalens datagrunnlag til mappen kb-data/ (legges i grenen kb-data i repoet).

Claude har ingen databasenøkkel. Når Claude gjør researchen (lørdager og fundamentet), leser Claude disse filene
for å vite hva terminalen ser: kurser, frakt, sund, bookinger, kursmønstre, rapporter, nyheter og hva som allerede
finnes i kunnskapsbanken. Bare markedsdata, aldri portefølje, notater eller innloggingsdata.
"""
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

import brief
import db
import earnings


def run(conn, folder: str = "../kb-data") -> int:
    out = pathlib.Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    snap = brief.snapshot(conn)
    (out / "snapshot.md").write_text(f"# Datagrunnlag {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC\n\n{snap}\n", encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute("""SELECT title, body, url FROM knowledge WHERE kind = 'mønster' ORDER BY title""")
        pats = cur.fetchall()
        cur.execute("""SELECT url, kind, topic, title, coalesce(credibility, ''), coalesce(model, ''), created_at::date FROM knowledge
                       ORDER BY created_at DESC LIMIT 600""")
        idx = cur.fetchall()
        cur.execute("""SELECT published, source, title, url, coalesce(summary, '') FROM news
                       WHERE published > now() - interval '7 days' AND body_status IS DISTINCT FROM 'blocked'
                       ORDER BY published DESC LIMIT 200""")
        news = cur.fetchall()
        cur.execute("""SELECT DISTINCT ON (symbol) symbol, period, published::date, data FROM reports
                       WHERE status IN ('ok', 'pending') AND data ? 'v' ORDER BY symbol, published DESC""")
        reps = cur.fetchall()
    (out / "patterns.md").write_text("\n\n".join(f"## {t}\n{b}" for t, b, _ in pats), encoding="utf-8")
    (out / "bookings.md").write_text("\n".join(earnings.lines(conn)), encoding="utf-8")
    (out / "knowledge_index.json").write_text(json.dumps(
        [{"url": u, "kind": k, "topic": tp, "title": t, "credibility": c, "model": m, "date": str(d)} for u, k, tp, t, c, m, d in idx],
        ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "news_7d.json").write_text(json.dumps(
        [{"published": p.isoformat(), "source": s, "title": t, "url": u, "summary": x} for p, s, t, u, x in news],
        ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "reports_latest.json").write_text(json.dumps(
        [{"symbol": s, "period": p, "published": str(d), "headline": (data or {}).get("headline"), "summary": (data or {}).get("summary"),
          "bookings": (data or {}).get("bookings"), "tce": (data or {}).get("tce"), "breakeven": (data or {}).get("breakeven"),
          "dividend": (data or {}).get("dividend"), "outlook": (data or {}).get("outlook")} for s, p, d, data in reps],
        ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"  Eksporterte datagrunnlaget til {out}: {len(pats)} mønstre, {len(idx)} notater i indeksen, {len(news)} nyheter, {len(reps)} rapporter")
    return 1


if __name__ == "__main__":
    with db.connect() as c:
        run(c, sys.argv[1] if len(sys.argv) > 1 else "../kb-data")
