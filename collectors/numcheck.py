"""Tallsjekk for tekst fra KI, særlig den lokale modellen (som lettere finner på tall).

scrub() fjerner setninger med tall som ikke står i kildematerialet. Årstall og små hele tall (1–12) regnes som ufarlige.
"""
from __future__ import annotations

import re


def _ok_numbers(sentence: str, pool: set[float]) -> bool:
    from reports import found, numbers_pos

    for _, cands in numbers_pos(sentence):
        if all((1 <= x <= 12 and x == int(x)) or (1800 <= x <= 2035 and x == int(x)) for x in cands):
            continue
        if not any(found(x, pool) or found(x * 1000, pool) or found(x / 1000, pool) for x in cands):
            return False
    return True


def scrub(text: str, source: str) -> tuple[str, int]:
    """Returnerer (renset tekst, antall setninger fjernet)."""
    from reports import numbers_in

    pool = numbers_in(source)
    out, removed = [], 0
    for line in text.splitlines():
        if line.lstrip().startswith("#") or not re.search(r"\d", line):
            out.append(line)
            continue
        bullet = re.match(r"^(\s*(?:[-*•]|\d+\.)\s+)", line)
        prefix = bullet.group(1) if bullet else ""
        body = line[len(prefix):]
        parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÆØÅ«\"(])", body)
        keep = [p for p in parts if _ok_numbers(p, pool)]
        removed += len(parts) - len(keep)
        if keep:
            out.append(prefix + " ".join(keep))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip(), removed
