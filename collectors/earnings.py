"""Inntjeningsanslag fra bookingtallene i kvartalsrapportene (samme regning som web/lib/earnings.ts).

Brukes av morgenrapporten. Standardantakelser: resten av dagene går til samme rate som de bookede,
97 % utnyttelse. Tall brukeren har lagt inn på bookingsiden (booking_inputs) går foran.
"""
from __future__ import annotations

import re
from datetime import date

FLEET = {"flåtesnitt", "flåte", "fleet", "total", "alle", "samlet", ""}
ALIAS = {"aframaxlr2": "lr2", "lr2aframax": "lr2", "aframax": "lr2", "mr2": "mr", "mr1": "mr", "handysize": "handy",
         "vlgcs": "vlgc", "vlccs": "vlcc", "suezmaxes": "suezmax"}


def _norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9æøå]", "", (s or "").lower())


def is_fleet(seg: str | None) -> bool:
    return _norm(seg) in FLEET


def seg_key(seg: str | None) -> str:
    if is_fleet(seg):
        return "flåtesnitt"
    n = _norm(seg)
    return ALIAS.get(n, n)


def parse_q(p: str | None):
    m = re.search(r"Q([1-4])\s*(\d{4})", p or "", re.I)
    return (int(m.group(1)), int(m.group(2))) if m else None


def next_q(p: str) -> str:
    x = parse_q(p)
    if not x:
        return p
    q, y = x
    return f"Q1 {y + 1}" if q == 4 else f"Q{q + 1} {y}"


def cmp_q(a: str, b: str) -> int:
    x, y = parse_q(a), parse_q(b)
    if not x or not y:
        return 0
    return (x[1] - y[1]) * 4 + (x[0] - y[0])


def q_days(p: str) -> int:
    x = parse_q(p)
    if not x:
        return 91
    q, y = x
    start = date(y, (q - 1) * 3 + 1, 1)
    end = date(y + 1, 1, 1) if q == 4 else date(y, q * 3 + 1, 1)
    return (end - start).days


def current_q(d: date | None = None) -> str:
    d = d or date.today()
    return f"Q{(d.month - 1) // 3 + 1} {d.year}"


def pick_bookings(rows: list[dict], period: str) -> list[dict]:
    ok = [r for r in rows or [] if (r.get("rate") or 0) > 0 and 0 < (r.get("share_pct") or 0) <= 100]
    inp = [r for r in ok if not r.get("period") or not parse_q(r.get("period")) or cmp_q(r["period"], period) == 0]

    def score(r):
        return (0 if r.get("rate_ok") is False else 4) + (0 if r.get("share_pct_ok") is False else 2) + (0 if re.search("spot", r.get("note") or "", re.I) else 1)

    best: dict[str, dict] = {}
    for r in inp:
        k = seg_key(r.get("segment"))
        if k not in best or score(r) > score(best[k]):
            best[k] = r
    if len(best) > 1:
        best.pop("flåtesnitt", None)
    return list(best.values())


def match_rate(rows, segment):
    lst = [r for r in rows or [] if (r.get("rate") or 0) > 0]
    k = seg_key(segment)
    for r in lst:
        if seg_key(r.get("segment")) == k:
            return r
    for r in lst:
        if is_fleet(r.get("segment")):
            return r
    return lst[0] if len(lst) == 1 else None


def match_vessels(rows, segment):
    lst = [r for r in rows or [] if (r.get("count") or 0) > 0 or (r.get("days") or 0) > 0]
    k = seg_key(segment)
    for r in lst:
        if seg_key(r.get("segment")) == k:
            return r.get("count"), r.get("days")
    if k == "flåtesnitt" and lst:
        for r in lst:
            if is_fleet(r.get("segment")):
                return r.get("count"), r.get("days")
        return sum(r.get("count") or 0 for r in lst) or None, None
    return None, None


def fleet_ref(symbol: str, segment: str) -> dict | None:
    """Fast reserve fra web/content/fleet.json (antall skip og dødpunkt fra selskapenes rapporter)."""
    import json
    import pathlib

    try:
        rows = json.loads((pathlib.Path(__file__).resolve().parent.parent / "web" / "content" / "fleet.json").read_text("utf-8"))["rows"]
    except Exception:  # noqa: BLE001
        return None
    k = seg_key(segment)
    mine = [r for r in rows if r["symbol"] == symbol]
    for r in mine:
        if seg_key(r["segment"]) == k:
            return r
    if k == "flåtesnitt":
        return next((r for r in mine if is_fleet(r["segment"])), None)
    return None


def estimate(share, booked, vessels, days, rest, breakeven, util, qd):
    total = days if days else (vessels * qd * util if vessels else None)
    if total is None:
        return None
    revenue = total * share * booked + total * (1 - share) * rest
    return {"days": total, "revenue": revenue, "surplus": revenue - total * breakeven if breakeven else None}


def company_estimates(conn) -> list[dict]:
    """Ett anslag per selskap med bookingtall i siste rapport."""
    from universe import COMPANIES

    with conn.cursor() as cur:
        cur.execute("""SELECT DISTINCT ON (symbol) symbol, period, published, data FROM reports
                       WHERE (status = 'ok' OR (status = 'pending' AND data ? 'v')) AND data IS NOT NULL
                       ORDER BY symbol, published DESC""")
        reps = {r[0]: r for r in cur.fetchall()}
        try:
            cur.execute("SELECT symbol, segment, vessels, rest_rate, breakeven, util FROM booking_inputs")
            own = {(r[0], r[1]): r[2:] for r in cur.fetchall()}
        except Exception:  # noqa: BLE001 - tabellen lages av nettsiden første gang den åpnes
            conn.rollback()
            own = {}
        cur.execute("SELECT symbol, data->'info'->>'sharesOutstanding' FROM fundamentals")
        shares = {s: float(v) for s, v in cur.fetchall() if v}
        cur.execute("SELECT symbol, price FROM quotes WHERE symbol = ANY(%s)", ([c["symbol"] for c in COMPANIES] + ["NOK=X"],))
        price = {s: float(p) for s, p in cur.fetchall() if p is not None}

    out = []
    usdnok = price.get("NOK=X")
    for c in COMPANIES:
        rep = reps.get(c["symbol"])
        if not rep or not parse_q(rep[1]):
            continue
        _, rperiod, published, d = rep
        period = next_q(rperiod)
        rows = pick_bookings(d.get("bookings") or [], period)
        if not rows:
            later = sorted({b.get("period") for b in d.get("bookings") or [] if parse_q(b.get("period")) and cmp_q(b["period"], rperiod) > 0},
                           key=lambda p: parse_q(p)[1] * 4 + parse_q(p)[0])
            if later:
                period = later[0]
                rows = pick_bookings(d.get("bookings") or [], period)
        if not rows:
            continue
        qd = q_days(period)
        segs, total, missing = [], 0.0, False
        for b in rows:
            seg = b.get("segment") or "flåtesnitt"
            o = own.get((c["symbol"], seg), (None, None, None, None))
            vc, vd = match_vessels(d.get("vessels"), seg)
            be = (match_rate(d.get("breakeven"), seg) or {}).get("rate")
            ref, opex = fleet_ref(c["symbol"], seg), False
            if ref and not vc and not vd and ref.get("vessels"):
                vc = ref["vessels"]
            if ref and not be and ref.get("breakeven"):
                be, opex = ref["breakeven"], ref.get("breakeven_kind") == "opex"
            share, rate = b["share_pct"] / 100, b["rate"]
            est = estimate(share, rate, o[0] if o[0] is not None else vc, None if o[0] is not None else vd,
                           o[1] if o[1] is not None else rate, o[2] if o[2] is not None else be,
                           o[3] if o[3] is not None else 0.97, qd)
            segs.append({"segment": seg, "share": share, "rate": rate, "unverified": b.get("rate_ok") is False or b.get("share_pct_ok") is False,
                         "surplus": est["surplus"] if est else None, "opex": opex and o[2] is None})
            if not est or est["surplus"] is None:
                missing = True
            else:
                total += est["surplus"]
        sh = shares.get(c["symbol"])
        ps = total / sh if not missing and sh else None
        ps_nok = ps * usdnok if ps is not None and usdnok else None
        out.append({"symbol": c["symbol"], "name": c["name"], "period": period, "report": rperiod,
                    "status": "utdatert" if cmp_q(period, current_q()) < 0 else ("nå" if cmp_q(period, current_q()) == 0 else "neste"),
                    "segs": segs, "surplus": None if missing else total, "per_share": ps, "per_share_nok": ps_nok,
                    "of_price": ps_nok / price[c["symbol"]] if ps_nok is not None and price.get(c["symbol"]) else None,
                    "dividend": (d.get("dividend") or {}).get("per_share")})
    return out


def lines(conn) -> list[str]:
    """Korte linjer til morgenrapporten og analytikeren."""
    out = []
    for e in company_estimates(conn):
        segs = "; ".join(f"{s['segment']} {s['share'] * 100:.0f} % til {s['rate']:,.0f} USD/dag{' (?)' if s['unverified'] else ''}" for s in e["segs"])
        est = (f" Anslått overskudd over dødpunkt {e['surplus'] / 1e6:,.1f} MUSD" + (f", {e['per_share']:.2f} USD per aksje" if e["per_share"] is not None else "")
               + (f" ({e['of_price'] * 100:.1f} % av kursen)" if e["of_price"] is not None else "") + "."
               if e["surplus"] is not None else " Mangler antall skip eller dødpunkt for fullt anslag.")
        if e["surplus"] is not None and any(s.get("opex") for s in e["segs"]):
            est += " Dødpunktet er bare driftskostnad (renter og avdrag mangler), så overskuddet er for høyt."
        div = f" Siste utbytte {e['dividend']} per aksje." if e.get("dividend") else ""
        out.append(f"- {e['name']} {e['period']} ({'kvartalet nå' if e['status'] == 'nå' else e['status']}, fra rapport {e['report']}): {segs}.{est}{div}")
    return out
