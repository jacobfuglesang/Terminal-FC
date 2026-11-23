"""KI-analytikerens daglige rapport. Bygger et kompakt bilde av dataene og ber Groq skrive en kort oversikt.

Rapporten beskriver data og nyheter. Den gir aldri kjøps- eller salgsråd.
Bildet (snapshot) lagres også, slik at «Spør analytikeren» på nettsiden kan bruke det.
"""
import os
import re
from datetime import date, timedelta

import requests

import ai
import earnings
import knowledge
from universe import COMPANIES, MARKET


MissingKey = ai.MissingKey


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

        cur.execute("""SELECT symbol, period, data FROM reports WHERE (status = 'ok' OR (status = 'pending' AND data ? 'v')) AND published > now() - interval '10 days'
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

        # Meglerrapporter siste 7 dager (KI-sammendrag)
        try:
            cur.execute("""SELECT data FROM broker_reports WHERE status = 'ok' AND published > now() - interval '7 days'
                           ORDER BY published DESC LIMIT 6""")
            brs = [r[0] for r in cur.fetchall()]
            if brs:
                out.append("\n## Meglerrapporter siste uke (KI-sammendrag)")
                for d in brs:
                    segs = "; ".join(f"{s.get('segment')} {s.get('direction')}" for s in (d.get("segments") or [])[:5])
                    out.append(f"- {d.get('broker')}: {d.get('headline', '')} ({segs})")
        except Exception:  # noqa: BLE001
            conn.rollback()

        # Bunkers og vær
        try:
            cur.execute("""SELECT port, grade, price FROM bunkers WHERE day = (SELECT max(day) FROM bunkers)
                           AND port IN ('Singapore','Rotterdam','Fujairah') ORDER BY port, grade""")
            b = cur.fetchall()
            if b:
                out.append("\n## Bunkers (USD/tonn)")
                by = {}
                for port, grade, price in b:
                    by.setdefault(port, {})[grade] = price
                for port, g in by.items():
                    spread = (g.get("VLSFO") or 0) - (g.get("HSFO") or 0) if g.get("VLSFO") and g.get("HSFO") else None
                    out.append(f"- {port}: VLSFO {g.get('VLSFO')}, HSFO {g.get('HSFO')}, MGO {g.get('MGO')}"
                               + (f", scrubberspread {spread:.0f}" if spread else ""))
            cur.execute("""SELECT name, alert, near, near_km FROM weather_events WHERE near IS NOT NULL AND to_date > now() - interval '2 days'""")
            w = cur.fetchall()
            cur.execute("SELECT day, gatun_ft, draft_neo_ft FROM panama ORDER BY day DESC LIMIT 1")
            p = cur.fetchone()
            if w or p:
                out.append("\n## Vær")
                for name, alert, near, dist in w:
                    out.append(f"- Storm {name} ({alert}) ca. {dist:.0f} km fra {near}")
                if p:
                    out.append(f"- Panamakanalen {p[0]}: Gatun {p[1]} fot, maks dypgang Neopanamax {p[2]} fot")
        except Exception:  # noqa: BLE001
            conn.rollback()

        # Bookingtabellen: hvor mye av kvartalet som er booket og anslått overskudd (samme regning som på nettsiden)
        try:
            bl = earnings.lines(conn)
            if bl:
                out.append("\n## Bookinger og anslått inntjening (fra kvartalsrapportene, grovt anslag, resten antatt til samme rate)")
                out += bl
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            print(f"  ! Bookingtabellen: {e}")

        cur.execute("SELECT title FROM alerts WHERE created_at > now() - interval '2 days' ORDER BY created_at DESC LIMIT 12")
        al = [r[0] for r in cur.fetchall()]
        if al:
            out.append("\n## Varsler siste to døgn")
            out += [f"- {t}" for t in al]

        cur.execute("""SELECT title, source, coalesce(summary, left(coalesce(nullif(excerpt,''), body, ''), 240)) FROM news
                       WHERE published > now() - interval '36 hours' AND body_status IS DISTINCT FROM 'blocked'
                       ORDER BY published DESC LIMIT 20""")
        nw = cur.fetchall()
        # Kunnskapsbanken: bakgrunn som passer til dagens nyheter, pluss sektormønstrene
        bg = knowledge.search(conn, " ".join(t for t, _, _ in nw) + " tankrater tørrbulk fraktrater", limit=4)
        pat = knowledge.get(conn, "intern:mønster:marked")
        if bg or pat:
            out.append("\n## Bakgrunn fra kunnskapsbanken (lest tidligere, ikke dagens tall)")
            for title, body, _ in pat + [b for b in bg if b not in pat]:
                out.append(f"- {title}: {re.sub(r'\s+', ' ', body)[:450]}")
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
    "nevn det viktigste fra dem (booking for neste kvartal og dødpunkt) under riktig segment. Bruk bookingtabellen til å si "
    "kort hva bookingene betyr for inntjeningen dette kvartalet, og si at det er grove anslag. Bruk kunnskapsbanken bare som "
    "bakgrunn for å forklare sammenhenger; dagens tall skal komme fra dataene. Maks 450 ord. "
    "Oppgi tall med enhet og retning. Si det kort hvis data mangler for et område. Skriv enkelt og konkret.\n\nDATA:\n"
)


def write(snap: str) -> tuple[str, str]:
    return ai.chat(PROMPT + snap[:16500], "quality", 2500, temperature=0.3)


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
