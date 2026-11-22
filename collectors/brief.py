"""KI-analytikerens daglige rapport. Bygger et kompakt bilde av dataene og ber Groq skrive en kort oversikt.

Rapporten beskriver data og nyheter. Den gir aldri kjøps- eller salgsråd.
Bildet (snapshot) lagres også, slik at «Spør analytikeren» på nettsiden kan bruke det.
"""
import os
import re
from datetime import date, timedelta

import requests

import news
from universe import COMPANIES, MARKET


class MissingKey(Exception):
    pass


def pct(a, b):
    return None if a is None or not b else (a / b - 1) * 100


def fp(v, d=1):
    return "–" if v is None else f"{v:+.{d}f} %"


def series_change(cur, table_sql: str, params: tuple, days: int):
    cur.execute(table_sql, params)
    rows = cur.fetchall()
    if not rows:
        return None, None, None
    last_day, last = rows[0]
    ref = next((v for d, v in rows if (last_day - d).days >= days), None)
    return last_day, last, pct(last, ref)


def snapshot(conn) -> str:
    out = [f"Dato: {date.today():%d.%m.%Y}"]
    with conn.cursor() as cur:
        out.append("\n## Frakt")
        for sym in ("BWET", "BDRY"):
            q = "SELECT day, close FROM price_daily WHERE symbol = %s ORDER BY day DESC LIMIT 40"
            d, v, w = series_change(cur, q, (sym,), 7)
            _, _, m = series_change(cur, q, (sym,), 30)
            if v:
                out.append(f"- {MARKET[sym][0]}: {v:.2f} USD ({d}), 1 uke {fp(w)}, 1 mnd {fp(m)}")
        for s, label in (("BDI", "Baltic Dry Index"), ("WCI", "Drewry WCI (USD/40ft)"), ("SCFI", "SCFI"), ("US_CRUDE", "USAs kommersielle oljelagre (mill. fat)")):
            q = "SELECT day, value FROM freight WHERE series = %s ORDER BY day DESC LIMIT 60"
            d, v, w = series_change(cur, q, (s,), 6)
            if v:
                out.append(f"- {label}: {v:,.1f} ({d}), endring siste uke {fp(w)}")

        out.append("\n## Råvarer og valuta (endring 1 uke)")
        for sym in ("BZ=F", "TTF=F", "TIO=F", "HG=F", "NOK=X"):
            d, v, w = series_change(cur, "SELECT day, close FROM price_daily WHERE symbol = %s ORDER BY day DESC LIMIT 15", (sym,), 7)
            if v:
                out.append(f"- {MARKET[sym][0]}: {v:,.2f} ({fp(w)})")

        out.append("\n## Trafikk i sundene (IMF PortWatch, skip per dag)")
        cur.execute("SELECT DISTINCT portid, name FROM chokepoints")
        for pid, name in cur.fetchall():
            cur.execute("SELECT day, n_total, n_tanker FROM chokepoints WHERE portid = %s ORDER BY day DESC LIMIT 29", (pid,))
            r = cur.fetchall()
            if len(r) < 8:
                continue
            last7 = sum(x[1] or 0 for x in r[:7]) / 7
            prev = sum(x[1] or 0 for x in r[7:]) / max(1, len(r[7:]))
            cur.execute("SELECT avg(n_total) FROM chokepoints WHERE portid = %s AND day BETWEEN %s AND %s",
                        (pid, r[0][0] - timedelta(days=372), r[0][0] - timedelta(days=358)))
            ly = cur.fetchone()[0]
            out.append(f"- {name}: snitt siste 7 dager {last7:.0f} (forrige 3 uker {prev:.0f}, samme tid i fjor {float(ly):.0f}" if ly else
                       f"- {name}: snitt siste 7 dager {last7:.0f} (forrige 3 uker {prev:.0f}")
            out[-1] += f"), siste dato {r[0][0]}"

        out.append("\n## Rederiene (kurs i NOK, endring 1 uke / 1 mnd)")
        for c in COMPANIES:
            q = "SELECT day, close FROM price_daily WHERE symbol = %s ORDER BY day DESC LIMIT 40"
            d, v, w = series_change(cur, q, (c["symbol"],), 7)
            _, _, m = series_change(cur, q, (c["symbol"],), 30)
            if v:
                out.append(f"- {c['name']} ({c['segment']}): {v:.2f} ({fp(w)} / {fp(m)})")

        cur.execute("SELECT symbol, data->'next_report'->>'date' FROM fundamentals WHERE data->'next_report'->>'date' IS NOT NULL")
        soon = [(s, d) for s, d in cur.fetchall() if d and date.today() <= date.fromisoformat(d) <= date.today() + timedelta(days=21)]
        if soon:
            names = {c["symbol"]: c["name"] for c in COMPANIES}
            out.append("\n## Rapporter neste tre uker (Yahoo)")
            out += [f"- {names.get(s, s)}: {d}" for s, d in sorted(soon, key=lambda x: x[1])]

        cur.execute("""SELECT symbol, period, data FROM reports WHERE status = 'ok' AND published > now() - interval '10 days'
                       ORDER BY published DESC LIMIT 8""")
        reps = cur.fetchall()
        if reps:
            names = {c["symbol"]: c["name"] for c in COMPANIES}
            out.append("\n## Kvartalsrapporter lest av KI siste 10 dager")
            for sym, period, d in reps:
                line = f"- {names.get(sym, sym)} {period}: {d.get('headline', '')}"
                bk = "; ".join(f"{b.get('segment')} {b.get('share_pct')} % booket til {b.get('rate')} {b.get('unit', '')} for {b.get('period')}"
                               for b in (d.get("bookings") or [])[:3] if b.get("rate"))
                be = "; ".join(f"dødpunkt {b.get('segment')} {b.get('rate')} {b.get('unit', '')}" for b in (d.get("breakeven") or [])[:2] if b.get("rate"))
                out.append(line + (f" Booking: {bk}." if bk else "") + (f" {be}." if be else ""))

        cur.execute("SELECT title FROM alerts WHERE created_at > now() - interval '2 days' ORDER BY created_at DESC LIMIT 12")
        al = [r[0] for r in cur.fetchall()]
        if al:
            out.append("\n## Varsler siste to døgn")
            out += [f"- {t}" for t in al]

        cur.execute("""SELECT title, source, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 240)) FROM news
                       WHERE published > now() - interval '36 hours' AND body_status IS DISTINCT FROM 'blocked'
                       ORDER BY published DESC LIMIT 25""")
        nw = cur.fetchall()
        if nw:
            out.append("\n## Nyheter siste 36 timer")
            out += [f"- {t} ({s}): {(x or '').strip()[:240]}" for t, s, x in nw]
    return "\n".join(out)


PROMPT = (
    "Du er analytiker for en privat shippingterminal. Skriv en kort morgenrapport på norsk bokmål for en privatinvestor "
    "som holder shippingaksjer på Oslo Børs i uker til måneder. Bruk BARE tallene og nyhetene i dataene under, og ikke finn på noe. "
    "Gi ingen kjøps- eller salgsråd, ingen kursmål og ikke gjengi analytikeres anbefalinger. "
    "Bruk disse overskriftene (markdown ##): «Kort fortalt» (tre punkter), «Tank», «Tørrbulk», «Container, bil og gass», "
    "«Geopolitikk og trafikk», «Følg med på» (kommende rapporter og datapunkter). Har KI lest nye kvartalsrapporter, "
    "nevn det viktigste fra dem (booking for neste kvartal og dødpunkt) under riktig segment. Maks 400 ord. "
    "Oppgi tall med enhet og retning. Si det kort hvis data mangler for et område. Skriv enkelt og konkret.\n\nDATA:\n"
)


def write(snap: str) -> tuple[str, str]:
    key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not key:
        raise MissingKey("Venter på Groq-nøkkel (GROQ_API_KEY)")
    for model in news.groq_models(key):
        payload = {"model": model, "messages": [{"role": "user", "content": PROMPT + snap[:14000]}],
                   "temperature": 0.3, "max_completion_tokens": 2500}
        if model.startswith("openai/gpt-oss"):
            payload["reasoning_effort"] = "low"
        r = requests.post(f"{news.GROQ}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=120)
        if r.status_code == 429 and float(r.headers.get("retry-after") or 999) <= 90:
            # Rapportleseren kan ha brukt minuttkvoten rett før; vent og prøv samme modell igjen
            import time

            time.sleep(float(r.headers["retry-after"]) + 2)
            r = requests.post(f"{news.GROQ}/chat/completions", headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=120)
        if r.status_code != 200:
            print(f"  ! Groq {model}: HTTP {r.status_code} {r.text[:160]}")
            continue
        text = r.json()["choices"][0]["message"].get("content") or ""
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
        if text:
            return text, model
    raise RuntimeError("Groq ga ikke noe svar")


def run(conn) -> int:
    snap = snapshot(conn)
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO briefs (day, text, model, snapshot) VALUES (CURRENT_DATE, '', '', %s)
                       ON CONFLICT (day) DO UPDATE SET snapshot = EXCLUDED.snapshot""", (snap,))
    conn.commit()
    text, model = write(snap)
    with conn.cursor() as cur:
        cur.execute("UPDATE briefs SET text = %s, model = %s, created_at = now() WHERE day = CURRENT_DATE", (text, model))
    conn.commit()
    print(f"  Analytikerrapport skrevet ({model}, {len(text.split())} ord). Start: {text[:160]!r}")
    return 1
