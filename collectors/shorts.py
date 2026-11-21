"""Shortposisjoner fra Finanstilsynets åpne SSR-API (data under 0,5 % per aktør publiseres ikke)."""
import requests

URL = "https://ssr.finanstilsynet.no/api/v2/instruments"
ISIN = {
    "NO0003054108": "MOWI.OL",
    "NO0010310956": "SALM.OL",
    "FO0000000179": "BAKKA.OL",
    "NO0003096208": "LSG.OL",
    "NO0010365521": "GSF.OL",
}


def run(conn) -> int:
    data = requests.get(URL, headers={"User-Agent": "FUGLESANG/1.0"}, timeout=60).json()
    rows = 0
    found = set()
    with conn.cursor() as cur:
        for inst in data:
            sym = ISIN.get(inst.get("isin"))
            if not sym:
                continue
            found.add(sym)
            for ev in inst.get("events", []):
                day = (ev.get("date") or "")[:10]
                if not day:
                    continue
                cur.execute(
                    """INSERT INTO shorts (symbol, day, pct, holders) VALUES (%s,%s,%s,%s)
                       ON CONFLICT (symbol, day) DO UPDATE SET pct=EXCLUDED.pct, holders=EXCLUDED.holders""",
                    (sym, day, float(ev.get("shortPercent") or 0), len(ev.get("activePositions") or [])),
                )
                rows += 1
    conn.commit()
    missing = sorted(set(ISIN.values()) - found)
    print(f"  Short: {rows} hendelser. Uten offentlige posisjoner: {', '.join(missing) or 'ingen'}")
    return rows
