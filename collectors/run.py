"""Starter innsamlerne. Bruk: python collectors/run.py prices|ssb|all [--backfill]"""
import sys
import traceback

import db
import prices
import ssb

JOBS = {
    "prices": ("Yahoo Finance (kurser)", lambda conn, bf: prices.run(conn, backfill=bf)),
    "ssb": ("SSB laksepris", lambda conn, bf: ssb.run(conn, weeks=520 if bf else 60)),
}


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    backfill = "--backfill" in sys.argv
    which = args[0] if args else "all"
    names = list(JOBS) if which == "all" else [which]
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
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                failed += 1
                traceback.print_exc()
                db.set_status(conn, label, False, 0, f"{type(e).__name__}: {e}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
