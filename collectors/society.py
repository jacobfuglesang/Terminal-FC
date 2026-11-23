"""Ukens samfunnssituasjon: en rapport om verden, økonomien og geopolitikken, og hva det betyr for shipping.

Skrives hver lørdag (når Groq er satt av til kunnskapsbanken) ut fra kunnskapsbanken, ukens nyheter og markedsdata.
Skrives bare av en skymodell. Tall som ikke står i materialet, fjernes.
"""
from __future__ import annotations

import json
import re
from datetime import date

import ai
import db
import numcheck

WORLD_RE = (r"war|krig|iran|israel|hormuz|red sea|rødehavet|houthi|suez|panama|sanction|sanksjon|tariff|toll|trade|handel|"
            r"china|kina|russia|russland|ukraine|opec|oil price|oljepris|inflation|rente|interest rate|fed\b|recession|resesjon|"
            r"gdp|bnp|election|valg|venezuela|taiwan|india|lng|gas|energy|energi|imf|wto|world bank")

PROMPT = """Du skriver «Samfunnssituasjonen uke {week}» på norsk bokmål for en privat shippingterminal. Leseren handler shippingaksjer
på Oslo Børs og holder dem fra 1 dag til 1 måned. Bruk BARE materialet under (kunnskapsbanken, ukens nyheter og markedsdata).
Skriv tall nøyaktig slik de står i materialet, og ikke finn på noe. Ingen kjøps- eller salgsråd og ingen kursmål.
Skill tydelig mellom det som har skjedd, og det som er usikkert. Skriv enkelt og konkret.

Bruk disse overskriftene (markdown ##):
## Kort fortalt (4–5 punkter)
## Geopolitikk og konflikter
## Verdensøkonomi og renter
## Handel og toll
## Energi og råvarer
## Hva det betyr for shipping (tank, tørrbulk, container og bil, gass – kort per segment)
## Scenarier de neste ukene (2–3 scenarier, hva som utløser dem og hvordan de slår ut for shipping)
## Følg med på (konkrete hendelser og datapunkter)
Maks 750 ord.

MATERIALE:
{text}"""


def material(conn) -> tuple[str, list[str]]:
    used: list[str] = []
    parts: list[str] = []
    with conn.cursor() as cur:
        cur.execute("""SELECT title, body, url FROM knowledge WHERE kind = 'syntese' ORDER BY created_at DESC LIMIT 7""")
        syn = cur.fetchall()
        cur.execute("""SELECT title, body, url FROM knowledge
                       WHERE topic IN ('geopolitikk', 'verdensøkonomi', 'makro', 'råvarer', 'hendelser') AND kind <> 'syntese'
                       ORDER BY created_at DESC LIMIT 16""")
        notes = cur.fetchall()
        cur.execute("""SELECT published::date, title, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 260)) FROM news
                       WHERE published > now() - interval '7 days' AND body_status IS DISTINCT FROM 'blocked'
                       AND (title ~* %s OR coalesce(summary, '') ~* %s) ORDER BY published DESC LIMIT 40""", (WORLD_RE, WORLD_RE))
        news = cur.fetchall()
    for t, b, u in syn:
        parts.append(f"### Sammenfatning: {t}\n{b[:1500]}")
        used.append(u)
    for t, b, u in notes:
        parts.append(f"### {t}\n{b[:900]}")
        used.append(u)
    if news:
        parts.append("### Ukens nyheter\n" + "\n".join(f"- {d} {t}: {(x or '').strip()[:240]}" for d, t, x in news))
    # Markedsdata: samme avsnitt som morgenrapporten (regnet ut, ikke KI)
    try:
        import brief

        snap = brief.snapshot(conn)
        parts.append("### Markedsdata\n" + brief.sections(snap, ("Frakt", "Råvarer og valuta", "Trafikk i sundene")))
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        print(f"  ! Markedsdata til samfunnsrapporten: {e}")
    return "\n\n".join(parts), used


def run() -> int:
    week = f"{date.today().isocalendar()[0]}-{date.today().isocalendar()[1]:02d}"
    with db.connect() as conn:
        text, used = material(conn)
    if len(text) < 1500:
        print("  Samfunnsrapport: for lite materiale ennå")
        return 0
    text = text[:15000]
    try:
        out, model = ai.chat(PROMPT.format(week=week.split("-")[1].lstrip("0"), text=text), "knowledge", 3000, temperature=0.2,
                             local_ok=False)
    except ai.RateLimited:
        print("  Samfunnsrapport: Groq er tom for kvote. Beholder forrige ukes rapport.")
        return 0
    out = re.sub(r"<think>.*?</think>", "", out, flags=re.S).strip()
    out, removed = numcheck.scrub(out, text)
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO society_reports (week, text, model, sources, removed) VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (week) DO UPDATE SET text = EXCLUDED.text, model = EXCLUDED.model, sources = EXCLUDED.sources,
                         removed = EXCLUDED.removed, created_at = now()""",
                    (week, out, model, json.dumps(used, ensure_ascii=False), removed))
        conn.commit()
    print(f"  ✓ Samfunnsrapport uke {week} ({model}, {len(out.split())} ord, {removed} setninger med ukjente tall fjernet)")
    return 1


def latest(conn) -> tuple[str, str] | None:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT week, text FROM society_reports ORDER BY week DESC LIMIT 1")
            return cur.fetchone()
    except Exception:  # noqa: BLE001
        conn.rollback()
        return None
