"""Fundamentet (web/content/fundament.md): fast grunnlag om aksjehandel og trading i shippingsektoren.

Ligger i repoet, slettes aldri, og oppdateres av Claude én gang i måneden. Morgenrapporten tar med kjerneprinsippene og
de avsnittene som passer best til dagens nyheter.
"""
from __future__ import annotations

import pathlib
import re

PATH = pathlib.Path(__file__).resolve().parent.parent / "web" / "content" / "fundament.md"


def sections() -> list[tuple[str, str]]:
    try:
        md = PATH.read_text(encoding="utf-8")
    except OSError:
        return []
    out, title, buf = [], None, []
    for line in md.splitlines():
        m = re.match(r"^##\s+(.*)$", line)
        if m:
            if title:
                out.append((title, "\n".join(buf)))
            title, buf = m.group(1).strip(), []
        elif title:
            buf.append(line)
    if title:
        out.append((title, "\n".join(buf)))
    return out


def relevant(query: str, budget: int = 2500) -> str:
    secs = sections()
    if not secs:
        return ""
    words = set(re.findall(r"[a-zæøå0-9]{4,}", query.lower()))
    core = next(((t, b) for t, b in secs if "kjerneprinsipp" in t.lower()), None)
    scored = sorted(((sum(b.lower().count(w) + 3 * (w in t.lower()) for w in words), t, b) for t, b in secs if (t, b) != core),
                    reverse=True)
    out = f"## {core[0]}\n{core[1][:1200]}\n" if core else ""
    for score, t, b in scored:
        if score <= 0:
            break
        block = f"## {t}\n{b}\n"
        if len(out) + len(block) > budget:
            break
        out += block
    return out.strip()
