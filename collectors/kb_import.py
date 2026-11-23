"""Henter inn kunnskapsnotater skrevet av Claude (lagt som JSON i mappen kb-inbox/ i repoet).

Claude har ingen databasenøkkel. Notatene legges derfor i repoet, og denne jobben (som kjører i GitHub med nøkkelen)
lagrer dem i kunnskapsbanken. Å kjøre den flere ganger er trygt: et notat med samme adresse erstattes.

Filformat:
{"model": "claude-opus-5-5", "date": "2026-11-24",
 "notes": [{"id": "kort-slug", "url": "(valgfri, ellers claude:<id>)", "kind": "begrep|rapport|syntese|...", "topic": "...",
            "title": "...", "body": "...", "source_title": "...", "link": "https://...", "credibility": "A|B|C", "symbols": []}],
 "society": {"week": "2026-48", "text": "markdown"}}
"""
from __future__ import annotations

import json
import pathlib
import sys

import db
import knowledge


def run(folder: str) -> int:
    files = sorted(pathlib.Path(folder).glob("*.json"))
    n = 0
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        model = f"claude/{data.get('model') or 'claude'}"
        for note in data.get("notes") or []:
            if not note.get("title") or not note.get("body"):
                continue
            url = note.get("url") or f"claude:{note['id']}"
            knowledge.save_note({
                "url": url, "kind": note.get("kind") or "begrep", "topic": note.get("topic"), "title": note["title"],
                "body": note["body"], "facts": {"link": note.get("link"), "date": data.get("date")},
                "symbols": note.get("symbols") or [], "source_title": note.get("source_title") or "Claude",
                "model": model, "checked": 0, "unverified": 0, "credibility": note.get("credibility") or "B",
            })
            n += 1
        soc = data.get("society")
        if soc and soc.get("text") and soc.get("week"):
            with db.connect() as c, c.cursor() as cur:
                cur.execute("""INSERT INTO society_reports (week, text, model, sources, removed) VALUES (%s,%s,%s,%s,0)
                               ON CONFLICT (week) DO UPDATE SET text = EXCLUDED.text, model = EXCLUDED.model,
                                 sources = EXCLUDED.sources, removed = 0, created_at = now()""",
                            (soc["week"], soc["text"], model, json.dumps(soc.get("sources") or [], ensure_ascii=False)))
                c.commit()
            print(f"  ✓ Samfunnsrapport uke {soc['week']}")
        print(f"  {f.name}: {len(data.get('notes') or [])} notater")
    print(f"Hentet inn {n} notater fra {len(files)} filer")
    return n


if __name__ == "__main__":
    with db.connect() as c:
        db.ensure_schema(c)
    run(sys.argv[1] if len(sys.argv) > 1 else "../kb-inbox")
