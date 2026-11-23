"""Varsler: regler som går gjennom ferske data og lagrer det som er verdt å se på.

Valgfritt: hvis NTFY_TOPIC er satt, sendes de viktigste varslene også til mobilen via ntfy.sh.
Varslene beskriver hva som har skjedd. De er aldri kjøps- eller salgsråd.
"""
import os
from datetime import date, timedelta

import requests

from universe import COMPANIES

NAME = {c["symbol"]: c["name"] for c in COMPANIES}
WATCH_CP = ("chokepoint6", "chokepoint1", "chokepoint4", "chokepoint2", "chokepoint7")


def add(cur, key: str, kind: str, title: str, body: str = "", symbol: str | None = None, url: str | None = None, level: int = 1) -> bool:
    cur.execute(
        """INSERT INTO alerts (key, kind, symbol, title, body, url, level) VALUES (%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (key) DO NOTHING RETURNING key""",
        (key, kind, symbol, title, body, url, level),
    )
    return cur.fetchone() is not None


def push(items: list[tuple[str, str, int]]):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic or not items:
        return
    for title, body, level in items[:6]:
        try:
            requests.post(f"https://ntfy.sh/{topic}", data=body.encode("utf-8") or title.encode("utf-8"),
                          headers={"Title": title.encode("utf-8"), "Priority": "high" if level >= 2 else "default", "Tags": "ship"},
                          timeout=15)
        except requests.RequestException as e:
            print(f"  ! ntfy: {e}")


def run(conn) -> int:
    new: list[tuple[str, str, int]] = []
    with conn.cursor() as cur:
        # 1) Rapporter, trading updates, utbytte og innsidehandel siste døgn
        cur.execute("""SELECT id, symbol, title, kind FROM announcements WHERE published > now() - interval '1 day'
                       AND kind IN ('Rapport','Trading update','Utbytte','Innsidehandel','Innsideinformasjon')""")
        for aid, sym, title, k in cur.fetchall():
            level = 2 if k in ("Rapport", "Trading update", "Innsideinformasjon") else 1
            t = f"{NAME.get(sym, sym)}: {k.lower()}"
            if add(cur, f"ann:{aid}", k, t, title, sym, f"/melding/{aid}", level):
                new.append((t, title, level))

        # 2) Store kursbevegelser (minst 6 % på en dag)
        cur.execute("SELECT symbol, change_pct, price FROM quotes WHERE change_pct IS NOT NULL AND abs(change_pct) >= 6 AND updated_at > now() - interval '1 day'")
        for sym, ch, price in cur.fetchall():
            if sym not in NAME:
                continue
            t = f"{NAME[sym]} {'opp' if ch > 0 else 'ned'} {abs(ch):.1f} % i dag".replace(".", ",")
            if add(cur, f"px:{sym}:{date.today()}", "Kurs", t, f"Kurs {price:.2f} kr".replace(".", ","), sym, None, 1):
                new.append((t, "", 1))

        # 3) Fraktfutures: minst 10 % på fem handelsdager
        for sym, label in (("BWET", "Tankfrakt (BWET)"), ("BDRY", "Tørrbulkfrakt (BDRY)")):
            cur.execute("SELECT day, close FROM price_daily WHERE symbol = %s ORDER BY day DESC LIMIT 6", (sym,))
            r = cur.fetchall()
            if len(r) == 6 and r[5][1]:
                ch = (r[0][1] / r[5][1] - 1) * 100
                if abs(ch) >= 10:
                    t = f"{label} {'opp' if ch > 0 else 'ned'} {abs(ch):.0f} % på en uke"
                    if add(cur, f"ffa:{sym}:{r[0][0]}", "Frakt", t, "Fraktfutures følger forventet spotrate de neste månedene.", None, "/frakt", 2):
                        new.append((t, "", 2))

        # 3b) Tropiske stormer med oransje/rødt varsel nær viktige havner og sund
        try:
            cur.execute("""SELECT id, name, alert, near, near_km FROM weather_events WHERE near IS NOT NULL
                           AND alert IN ('orange','red') AND to_date > now() - interval '1 day'""")
            for wid, name, alert, near, dist in cur.fetchall():
                t = f"Storm {name} ({'rødt' if alert == 'red' else 'oransje'} varsel) ca. {dist:.0f} km fra {near}"
                if add(cur, f"storm:{wid}:{alert}", "Vær", t, "Kan gi forsinkelser og stengte havner i området.", None, "/vaer", 2):
                    new.append((t, "", 2))
        except Exception:  # noqa: BLE001
            pass

        # 3c) Panamakanalen: endret maks dypgang
        try:
            cur.execute("SELECT day, draft_neo_ft FROM panama ORDER BY day DESC LIMIT 2")
            r = cur.fetchall()
            if len(r) == 2 and r[0][1] and r[1][1] and r[0][1] != r[1][1]:
                t = f"Panamakanalen: maks dypgang Neopanamax {'opp' if r[0][1] > r[1][1] else 'ned'} til {r[0][1]:.1f} fot".replace(".", ",")
                if add(cur, f"panama:{r[0][0]}", "Vær", t, "Lavere dypgang betyr mindre last per skip og færre passeringer.", None, "/vaer", 2):
                    new.append((t, "", 2))
        except Exception:  # noqa: BLE001
            pass

        # 4) Ukesrater for container (WCI/SCFI) minst 8 %
        for series, label in (("WCI", "Drewry WCI"), ("SCFI", "SCFI")):
            cur.execute("SELECT day, value FROM freight WHERE series = %s ORDER BY day DESC LIMIT 2", (series,))
            r = cur.fetchall()
            if len(r) == 2 and r[1][1]:
                ch = (r[0][1] / r[1][1] - 1) * 100
                if abs(ch) >= 8:
                    t = f"{label} {'opp' if ch > 0 else 'ned'} {abs(ch):.0f} % siste uke"
                    if add(cur, f"fr:{series}:{r[0][0]}", "Frakt", t, "", None, "/frakt", 1):
                        new.append((t, "", 1))

        # 5) Trafikk i sundene: siste dag mot snittet av de 28 dagene før (minst 30 % avvik og minst 8 skip i snitt)
        for pid in WATCH_CP:
            cur.execute("SELECT day, name, n_total FROM chokepoints WHERE portid = %s ORDER BY day DESC LIMIT 29", (pid,))
            r = cur.fetchall()
            if len(r) < 15:
                continue
            day, name, last = r[0]
            avg = sum(x[2] or 0 for x in r[1:]) / len(r[1:])
            if avg >= 8 and last is not None and abs(last / avg - 1) >= 0.30:
                ch = (last / avg - 1) * 100
                t = f"{name}: {last} skip {day:%d.%m}, {'+' if ch > 0 else '−'}{abs(ch):.0f} % mot snittet"
                if add(cur, f"cp:{pid}:{day}", "Trafikk", t, f"Snitt siste 4 uker: {avg:.0f} skip per dag.", None, "/trafikk", 2):
                    new.append((t, "", 2))

        # 6) Shortandel endret minst 1 prosentpoeng
        cur.execute("""SELECT symbol, day, pct, lag(pct) OVER (PARTITION BY symbol ORDER BY day) FROM shorts
                       WHERE day > now() - interval '10 days'""")
        for sym, day, pct, prev in cur.fetchall():
            if prev is not None and abs(pct - prev) >= 1 and day >= date.today() - timedelta(days=7):
                t = f"{NAME.get(sym, sym)}: shortandel {prev:.1f} → {pct:.1f} %".replace(".", ",")
                if add(cur, f"sh:{sym}:{day}", "Short", t, "", sym, None, 1):
                    new.append((t, "", 1))
        cur.execute("DELETE FROM alerts WHERE created_at < now() - interval '120 days'")
    conn.commit()
    push([n for n in new if n[2] >= 2] + [n for n in new if n[2] < 2])
    print(f"  Varsler: {len(new)} nye" + (" (sendt til mobil)" if new and os.environ.get("NTFY_TOPIC") else ""))
    return len(new)
