"""Starter innsamlerne.

Bruk: python run.py <jobb>[,<jobb>...] [--backfill]
Jobber: prices, ssb, shorts, feed, biomass, futures, lice, daily (= shorts,feed,biomass,futures,lice), all
"""
import sys
import traceback

import biomass
import db
import feed
import futures
import lice
import prices
import shorts
import ssb

JOBS = {
    "prices": ("Yahoo Finance (kurser)", lambda c, bf: prices.run(c, backfill=bf)),
    "ssb": ("SSB laksepris", lambda c, bf: ssb.run(c, weeks=520 if bf else 60)),
    "shorts": ("Finanstilsynet (short)", lambda c, bf: shorts.run(c)),
    "feed": ("IMF/FRED (fôrråvarer)", lambda c, bf: feed.run(c)),
    "biomass": ("Fiskeridirektoratet (biomasse)", lambda c, bf: biomass.run(c)),
    "futures": ("Euronext (terminkurve)", lambda c, bf: futures.run(c)),
    "lice": ("BarentsWatch (lus og sykdom)", lambda c, bf: lice.run(c, weeks=26 if bf else 3)),
}
GROUPS = {"daily": ["shorts", "biomass", "futures", "lice", "feed"], "all": ["prices", "ssb", "shorts", "biomass", "futures", "lice", "feed"]}


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    backfill = "--backfill" in sys.argv
    names: list = []
    for part in (args[0] if args else "all").split(","):
        names += GROUPS.get(part, [part])
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
            except (lice.MissingKey, feed.SourceDown) as e:
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
