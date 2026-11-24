"""Tak for fundamentet (web/content/fundament.md): maks 5 % av terminalens lagringsgrense (Big J valgte 5 %).

Fundamentet ligger i koden (GitHub), ikke i databasen, men regnes mot samme grense så det aldri vokser ukontrollert.
Hver måned flyttes det gamle «Situasjonen nå» inn i «## Arkiv: tidligere situasjonsbilder» som et ###-avsnitt.
Blir filen større enn taket, slettes de ELDSTE arkivavsnittene først. Kjerneprinsippene og resten røres ikke.
Alle versjoner finnes uansett i Git-historikken.
"""
from __future__ import annotations

import os
import pathlib
import re
import sys

LIMIT_MB = float(os.environ.get("DB_LIMIT_MB", "1024"))  # samme grense som databasen (Neon Free: 1 GB)
SHARE = 0.05
CAP_BYTES = int(SHARE * LIMIT_MB * 1024 * 1024)
PATH = pathlib.Path(__file__).resolve().parent.parent / "web" / "content" / "fundament.md"
ARCHIVE = "## Arkiv: tidligere situasjonsbilder"
MONTHS = {m: i for i, m in enumerate(["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september",
                                       "oktober", "november", "desember"], 1)}


def _key(title: str) -> tuple[int, int]:
    m = re.search(r"([a-zæøå]+)\s+(\d{4})", title.lower())
    return (int(m.group(2)), MONTHS.get(m.group(1), 0)) if m else (0, 0)


def trim(text: str, cap: int = CAP_BYTES) -> tuple[str, list[str]]:
    """Fjerner eldste ###-avsnitt i arkivet til filen er under taket. Returnerer ny tekst og titlene som ble fjernet."""
    removed: list[str] = []
    while len(text.encode("utf-8")) > cap:
        start = text.find(ARCHIVE)
        if start < 0:
            break
        rest_at = text.find("\n## ", start + len(ARCHIVE))
        end = len(text) if rest_at < 0 else rest_at + 1
        body = text[start:end]
        parts = [(m.start(), m.group(1)) for m in re.finditer(r"^### (.+)$", body, re.M)]
        if not parts:
            break
        oldest = min(range(len(parts)), key=lambda i: _key(parts[i][1]))
        a = parts[oldest][0]
        b = parts[oldest + 1][0] if oldest + 1 < len(parts) else len(body)
        removed.append(parts[oldest][1].strip())
        text = text[:start] + body[:a] + body[b:] + text[end:]
    return text, removed


def main() -> int:
    text = PATH.read_text(encoding="utf-8")
    size = len(text.encode("utf-8"))
    print(f"Fundamentet: {size / 1024:.1f} KB av taket {CAP_BYTES / 1024 / 1024:.1f} MB ({size / CAP_BYTES * 100:.3f} %)")
    new, removed = trim(text)
    if removed:
        PATH.write_text(new, encoding="utf-8")
        print("Slettet eldste arkivavsnitt: " + ", ".join(removed))
    if len(new.encode("utf-8")) > CAP_BYTES:
        print("ADVARSEL: fortsatt over taket etter at arkivet er tomt. Kjerneinnholdet må kortes ned for hånd.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
