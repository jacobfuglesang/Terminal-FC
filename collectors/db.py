"""Felles databasekode for innsamlerne."""
import os
from contextlib import contextmanager
from pathlib import Path

import psycopg

SCHEMA = Path(__file__).with_name("schema.sql")


def _url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL mangler. Legg den inn som hemmelighet i GitHub (Settings > Secrets > Actions).")
    return url


@contextmanager
def connect():
    with psycopg.connect(_url(), autocommit=False, prepare_threshold=None) as conn:
        yield conn


def ensure_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA.read_text(encoding="utf-8"))
    conn.commit()


def set_status(conn, source: str, ok: bool, rows: int = 0, message: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO source_status (source, last_run, last_ok, ok, rows, message)
            VALUES (%s, now(), CASE WHEN %s THEN now() END, %s, %s, %s)
            ON CONFLICT (source) DO UPDATE SET
              last_run = now(),
              last_ok  = CASE WHEN EXCLUDED.ok THEN now() ELSE source_status.last_ok END,
              ok       = EXCLUDED.ok,
              rows     = EXCLUDED.rows,
              message  = EXCLUDED.message
            """,
            (source, ok, ok, rows, message[:500]),
        )
    conn.commit()
