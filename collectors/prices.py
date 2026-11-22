"""Henter kurser for rederiene, fraktfondene og råvarer fra Yahoo Finance (15 min forsinket).

Ett samlet kall per kjøring for å holde oss langt unna Yahoos grenser.
"""
from datetime import timezone

import pandas as pd
import yfinance as yf

from universe import COMPANIES, MARKET

SYMBOLS = {**{c["symbol"]: c["name"] for c in COMPANIES}, **{k: v[0] for k, v in MARKET.items()}}
CURRENCY = {**{c["symbol"]: "NOK" for c in COMPANIES}, **{k: v[1] for k, v in MARKET.items()}}
INTRADAY = [c["symbol"] for c in COMPANIES] + ["BWET", "BDRY", "BZ=F", "NOK=X"]


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


def fetch_intraday() -> pd.DataFrame:
    return yf.download(INTRADAY, period="5d", interval="15m", group_by="ticker",
                       auto_adjust=False, progress=False, threads=False)


def store_intraday(conn) -> int:
    """Lagrer 15-minutters kurser for siste 5 handelsdager. Feiler stille, siden dette er et tillegg."""
    try:
        df = fetch_intraday()
    except Exception as e:  # noqa: BLE001
        print(f"  ! intradag feilet: {e}")
        return 0
    if df is None or df.empty:
        return 0
    n = 0
    with conn.cursor() as cur:
        for sym in INTRADAY:
            if sym not in df.columns.get_level_values(0):
                continue
            d = df[sym].dropna(subset=["Close"])
            for idx, r in d.iterrows():
                ts = idx.to_pydatetime()
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                cur.execute(
                    """INSERT INTO price_intraday (symbol, ts, price) VALUES (%s,%s,%s)
                       ON CONFLICT (symbol, ts) DO UPDATE SET price=EXCLUDED.price""",
                    (sym, ts, float(r["Close"])),
                )
                n += 1
        cur.execute("DELETE FROM price_intraday WHERE ts < now() - interval '12 days'")
    conn.commit()
    print(f"  Intradag: {n} punkter")
    return n


def run(conn, backfill: bool = False) -> int:
    df = fetch("2y" if backfill else "5d")
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
                 CURRENCY.get(sym, "NOK"), ts),
            )
            rows += 1
            print(f"  {name[:28]:<28} {price:>10.2f}  {chg if chg is not None else 0:+.2f} %")
    conn.commit()
    store_intraday(conn)
    return rows
