"""Starter innsamlerne.

Bruk: python run.py <jobb>[,<jobb>...] [--backfill]
Jobber: prices, announcements, news, shorts, fundamentals, freight, portwatch, ais, reports, alerts, brief
Grupper: market (kurser, børsmeldinger, nyheter, AIS, varsler), daily (short, nøkkeltall, frakt, sund, AIS, varsler),
         morning (som daily + analytikerrapport), all (alt)
"""
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
import prices
import reports
import shorts

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
    "reports": ("KI-rapportleser (kvartalsrapporter)", lambda c, bf: reports.run(c)),
    "brief": ("KI-analytiker (morgenrapport)", lambda c, bf: brief.run(c)),
}
GROUPS = {
    "market": ["prices", "announcements", "news", "ais", "reports", "alerts"],
    "daily": ["prices", "shorts", "fundamentals", "freight", "portwatch", "ais", "alerts"],
    "morning": ["prices", "announcements", "news", "shorts", "fundamentals", "freight", "portwatch", "ais", "reports", "alerts", "brief"],
    "all": ["prices", "announcements", "news", "shorts", "fundamentals", "freight", "portwatch", "ais", "reports", "alerts", "brief"],
}
SOFT = (ais.MissingKey, brief.MissingKey, reports.MissingKey)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    backfill = "--backfill" in sys.argv
    names: list = []
    for part in (args[0] if args else "all").split(","):
        names += GROUPS.get(part.strip(), [part.strip()])
    names = list(dict.fromkeys(n for n in names if n in JOBS))
    failed = 0
    with db.connect() as conn:
        db.ensure_schema(conn)
        for name in names:
            label, fn = JOBS[name]
            print(f"== {label} ==")
            try:
                n = fn(conn, backfill)
                db.set_status(conn, label, True, n, f"{n} rader oppdatert")
                print(f"  OK: {n} rader")
            except SOFT as e:
                conn.rollback()
                db.set_status(conn, label, False, 0, str(e))
                print(f"  Hoppet over: {e}")
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                failed += 1
                traceback.print_exc()
                db.set_status(conn, label, False, 0, f"{type(e).__name__}: {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
