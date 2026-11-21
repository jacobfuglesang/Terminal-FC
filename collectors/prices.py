"""Henter kurser for de fem lakseaksjene og EUR/NOK fra Yahoo Finance (15 min forsinket).

Ett samlet kall per kjøring for å holde oss langt unna Yahoos grenser.
"""
from datetime import timezone

import pandas as pd
import yfinance as yf

SYMBOLS = {
    "MOWI.OL": "Mowi",
    "SALM.OL": "SalMar",
    "BAKKA.OL": "Bakkafrost",
    "LSG.OL": "Lerøy",
    "GSF.OL": "Grieg Seafood",
    "EURNOK=X": "EUR/NOK",
}


def fetch(period: str = "5d") -> pd.DataFrame:
    df = yf.download(
        list(SYMBOLS),
        period=period,
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if df is None or df.empty:
        raise RuntimeError("Yahoo returnerte ingen data (mulig sperre eller nettverksfeil)")
    return df


def run(conn, backfill: bool = False) -> int:
    df = fetch("1y" if backfill else "5d")
    rows = 0
    with conn.cursor() as cur:
        for sym, name in SYMBOLS.items():
            if sym not in df.columns.get_level_values(0):
                print(f"  ! {sym}: ingen data")
                continue
            d = df[sym].dropna(subset=["Close"])
            if d.empty:
                print(f"  ! {sym}: tom serie")
                continue
            for idx, r in d.iterrows():
                vol = r.get("Volume")
                cur.execute(
                    """INSERT INTO price_daily (symbol, day, close, volume) VALUES (%s,%s,%s,%s)
                       ON CONFLICT (symbol, day) DO UPDATE SET close=EXCLUDED.close, volume=EXCLUDED.volume""",
                    (sym, idx.date(), float(r["Close"]), int(vol) if pd.notna(vol) else None),
                )
            last = d.iloc[-1]
            prev = float(d.iloc[-2]["Close"]) if len(d) > 1 else None
            price = float(last["Close"])
            chg = (price / prev - 1) * 100 if prev else None
            ts = d.index[-1].to_pydatetime()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            vol = last.get("Volume")
            cur.execute(
                """INSERT INTO quotes (symbol, name, price, prev_close, change_pct, volume, currency, market_time, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s, now())
                   ON CONFLICT (symbol) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price,
                     prev_close=EXCLUDED.prev_close, change_pct=EXCLUDED.change_pct, volume=EXCLUDED.volume,
                     currency=EXCLUDED.currency, market_time=EXCLUDED.market_time, updated_at=now()""",
                (sym, name, price, prev, chg, int(vol) if pd.notna(vol) else None,
                 "NOK", ts),
            )
            rows += 1
            print(f"  {name:<14} {price:>10.2f}  {chg if chg is not None else 0:+.2f} %")
    conn.commit()
    return rows
