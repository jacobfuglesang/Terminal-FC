"""Nøkkeltall og analytikernes resultatforventninger (konsensus) fra Yahoo Finance.

Bare forventet inntjening og omsetning. Anbefalinger og kursmål hentes aldri.
"""
import json
import math
from datetime import datetime, timezone

import yfinance as yf

from universe import COMPANIES

SYMBOLS = [c["symbol"] for c in COMPANIES]


def _clean(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return None if math.isnan(f) or math.isinf(f) else f


def _table(df, cols=("avg", "low", "high", "numberOfAnalysts", "yearAgoEps", "yearAgoRevenue", "growth")):
    out = {}
    if df is None or getattr(df, "empty", True):
        return out
    for period in df.index:
        row = df.loc[period]
        out[str(period)] = {c: _clean(row[c]) for c in cols if c in row.index}
        if "currency" in row.index:
            out[str(period)]["currency"] = str(row["currency"])
    return out


def _quarters(t) -> list:
    try:
        q = t.quarterly_income_stmt
    except Exception:  # noqa: BLE001
        return []
    if q is None or q.empty:
        return []
    rows = []
    for col in q.columns[:8]:
        g = lambda name: _clean(q.loc[name, col]) if name in q.index else None  # noqa: E731
        rows.append({"end": str(col)[:10], "revenue": g("Total Revenue"), "ebit": g("EBIT"), "net": g("Net Income"), "eps": g("Diluted EPS")})
    return rows


def _next_report(t):
    try:
        ed = t.get_earnings_dates(limit=8)
    except Exception:  # noqa: BLE001
        return None
    if ed is None or ed.empty:
        return None
    now = datetime.now(timezone.utc)
    fut = [(idx, row) for idx, row in ed.iterrows() if idx.to_pydatetime() > now]
    if not fut:
        return None
    idx, row = sorted(fut, key=lambda x: x[0])[0]
    return {"date": idx.date().isoformat(), "eps_estimate": _clean(row.get("EPS Estimate"))}


def run(conn) -> int:
    n = 0
    for s in SYMBOLS:
        t = yf.Ticker(s)
        data = {"fetched": datetime.now(timezone.utc).isoformat()}
        try:
            i = t.info or {}
        except Exception:  # noqa: BLE001
            i = {}
        data["info"] = {k: _clean(i.get(k)) if k not in ("currency", "financialCurrency") else i.get(k)
                        for k in ["marketCap", "enterpriseValue", "fullTimeEmployees", "currency", "financialCurrency",
                                  "trailingPE", "forwardPE", "dividendYield", "sharesOutstanding", "priceToBook"]}
        for name, attr, cols in [
            ("eps", "earnings_estimate", ("avg", "low", "high", "numberOfAnalysts", "yearAgoEps", "growth")),
            ("revenue", "revenue_estimate", ("avg", "low", "high", "numberOfAnalysts", "yearAgoRevenue", "growth")),
        ]:
            try:
                data[name] = _table(getattr(t, attr), cols)
            except Exception:  # noqa: BLE001
                data[name] = {}
        try:
            tr = t.eps_trend
            data["eps_trend"] = _table(tr, ("current", "7daysAgo", "30daysAgo", "60daysAgo", "90daysAgo"))
        except Exception:  # noqa: BLE001
            data["eps_trend"] = {}
        data["quarters"] = _quarters(t)
        try:
            dv = t.dividends
            data["dividends"] = [{"date": str(k)[:10], "value": _clean(v)} for k, v in dv.tail(12).items()]
        except Exception:  # noqa: BLE001
            data["dividends"] = []
        try:
            cal = t.calendar or {}
            exd = cal.get("Ex-Dividend Date")
            data["ex_dividend"] = str(exd)[:10] if exd else None
        except Exception:  # noqa: BLE001
            data["ex_dividend"] = None
        data["next_report"] = _next_report(t)
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO fundamentals (symbol, data, updated_at) VALUES (%s, %s, now()) ON CONFLICT (symbol) DO UPDATE SET data=EXCLUDED.data, updated_at=now()",
                (s, json.dumps(data)),
            )
        e = data.get("eps", {}).get("0y", {})
        print(f"  {s}: EPS i år {e.get('avg')} ({e.get('numberOfAnalysts')} analytikere), neste rapport {data['next_report']}")
        n += 1
    conn.commit()
    return n
