"""Lagringsvakt: følger med på hvor full databasen er (Neon gratis: 1 GB per prosjekt).

Over 1 GB stopper alle skrivinger i hele terminalen, så vi holder alltid en buffer:
- Kunnskapsbanken skriver bare til databasen er 90 % full (se knowledge.CAP).
- Kommer databasen likevel over 92 %, rydder denne jobben: eldre rådata først, deretter de eldste vanlige notatene.
"""
from __future__ import annotations

import os

LIMIT = float(os.environ.get("DB_LIMIT_MB", "1024")) * 1024 * 1024
ALARM = 0.92


def size(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_database_size(current_database())")
        return int(cur.fetchone()[0])


def run(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("""SELECT relname, pg_total_relation_size(relid) FROM pg_catalog.pg_statio_user_tables
                       ORDER BY 2 DESC LIMIT 8""")
        top = cur.fetchall()
    s = size(conn)
    print(f"  Database {s / 1e6:.0f} MB av {LIMIT / 1e6:.0f} MB ({s / LIMIT:.0%}). Størst: "
          + ", ".join(f"{n} {b / 1e6:.1f} MB" for n, b in top))
    if s < ALARM * LIMIT:
        return 0
    print(f"  ! Over {ALARM:.0%}: rydder eldre rådata")
    steps = [
        "DELETE FROM ais_zone WHERE ts < now() - interval '60 days'",
        "UPDATE announcements SET body = NULL WHERE body IS NOT NULL AND published < now() - interval '120 days'",
        "DELETE FROM port_activity WHERE day < now() - interval '400 days'",
        "DELETE FROM chokepoints WHERE day < now() - interval '500 days'",
        "UPDATE reports SET data = data - 'files' WHERE published < now() - interval '400 days'",
    ]
    done = 0
    with conn.cursor() as cur:
        for sql in steps:
            try:
                cur.execute(sql)
                done += cur.rowcount
                conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                print(f"  ! {sql[:50]}: {e}")
    import knowledge

    done += knowledge.prune(conn)
    print(f"  Ryddet {done} rader. Database nå {size(conn) / 1e6:.0f} MB (plassen frigjøres helt når Postgres har ryddet opp).")
    return done
