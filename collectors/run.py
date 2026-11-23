"""Starter innsamlerne.

Bruk: python run.py <jobb>[,<jobb>...] [--backfill]
Jobber: prices, announcements, news, shorts, fundamentals, freight, portwatch, ais, reports, alerts, brief, knowledge
Grupper: market (kurser, børsmeldinger, nyheter, AIS, varsler), daily (short, nøkkeltall, frakt, sund, AIS, varsler),
         morning (som daily + analytikerrapport), all (alt)
"""
import os
import sys
import traceback

import ais
import alerts
import announcements
import brief
import db
import freight
import fundamentals
import news
import portwatch
import bunkers
import brokers
import ports
import prices
import weather
import reports
import shorts
import knowledge

JOBS = {
    "prices": ("Yahoo Finance (kurser og fraktfutures)", lambda c, bf: prices.run(c, backfill=bf)),
    "announcements": ("Oslo Børs Newsweb (børsmeldinger)", lambda c, bf: announcements.run(c, days=200 if bf else 10, max_bodies=300 if bf else 60)),
    "news": ("Nyheter (RSS)", lambda c, bf: news.run(c)),
    "shorts": ("Finanstilsynet (short)", lambda c, bf: shorts.run(c)),
    "fundamentals": ("Yahoo Finance (konsensus, utbytte og nøkkeltall)", lambda c, bf: fundamentals.run(c)),
    "freight": ("Fraktrater (Drewry, SCFI, BDI, EIA)", lambda c, bf: freight.run(c, backfill=bf)),
    "portwatch": ("IMF PortWatch (sund)", lambda c, bf: portwatch.run(c, backfill=bf)),
    "ais": ("aisstream.io (skip i nøkkelområder)", lambda c, bf: ais.run(c, seconds=150)),
    "alerts": ("Varsler", lambda c, bf: alerts.run(c)),
    "reports": ("KI-rapportleser (kvartalsrapporter)",
                lambda c, bf: reports.run(c, max_reports=2, budget_s=200) if QUICK else reports.run(c)),
    "brokers": ("KI-meglerrapporter (ukentlige)", lambda c, bf: brokers.run(c, bf, max_reports=2 if QUICK else 3, quick=QUICK)),
    "bunkers": ("Bunkerpriser (BunkerEx via Hellenic Shipping News)", lambda c, bf: bunkers.run(c, bf)),
    "weather": ("Vær (GDACS stormer, Panamakanalen)", lambda c, bf: weather.run(c, bf)),
    "ports": ("IMF PortWatch (havner)", lambda c, bf: ports.run(c, bf)),
    "brief": ("KI-analytiker (morgenrapport)", lambda c, bf: brief.run(c)),
    # Egen arbeidsflyt (kunnskap.yml): lokal KI leser i KNOWLEDGE_MINUTES minutter
    "knowledge": ("Kunnskapsbank (lokal KI)", lambda c, bf: knowledge.run(c, minutes=float(os.environ.get("KNOWLEDGE_MINUTES", "30")))),
}
GROUPS = {
    "market": ["prices", "announcements", "news", "ais", "weather", "alerts", "reports", "brokers"],
    "daily": ["prices", "shorts", "fundamentals", "freight", "portwatch", "ports", "bunkers", "weather", "ais", "alerts"],
    # Morgenrapporten skrives før rapportleseren, så den alltid får den beste KI-modellen
    "morning": ["prices", "announcements", "news", "shorts", "fundamentals", "freight", "portwatch", "ports", "bunkers", "weather", "ais",
                "alerts", "brief", "reports", "brokers"],
    "all": ["prices", "announcements", "news", "shorts", "fundamentals", "freight", "portwatch", "ports", "bunkers", "weather", "ais",
            "alerts", "brief", "reports", "brokers"],
}
QUICK = False  # markedskjøringer hvert 15. minutt: korte KI-jobber, så kjøringen blir ferdig før neste starter

SOFT = (ais.MissingKey, brief.MissingKey, reports.MissingKey, brokers.MissingKey, knowledge.ai.MissingKey)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    backfill = "--backfill" in sys.argv
    names: list = []
    for part in (args[0] if args else "all").split(","):
        names += GROUPS.get(part.strip(), [part.strip()])
    names = list(dict.fromkeys(n for n in names if n in JOBS))
    global QUICK
    QUICK = (args[0] if args else "") == "market"
    failed = 0
    with db.connect() as conn:
        db.ensure_schema(conn)
    # Ny tilkobling per jobb: Neon lukker tilkoblinger som står ubrukt lenge (f.eks. mens KI leser en rapport)
    for name in names:
        label, fn = JOBS[name]
        print(f"== {label} ==")
        with db.connect() as conn:
            try:
                n = fn(conn, backfill)
                ok, msg, rows = True, f"{n} rader oppdatert", n
                print(f"  OK: {n} rader")
            except SOFT as e:
                ok, msg, rows = False, str(e), 0
                print(f"  Hoppet over: {e}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                traceback.print_exc()
                ok, msg, rows = False, f"{type(e).__name__}: {e}", 0
        with db.connect() as conn:  # status skrives på en frisk tilkobling, i tilfelle den gamle ble brutt
            db.set_status(conn, label, ok, rows, msg)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
