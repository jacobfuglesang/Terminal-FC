"""KI-rapportleser: leser kvartalsrapportene til rederiene og lagrer et norsk sammendrag med nøkkeltall.

Slik virker den:
1. Finner resultatmeldinger i børsmeldingene (Newsweb) og grupperer dem per selskap og kvartal,
   slik at pressemelding, rapport og presentasjon leses samlet.
2. Henter meldingsteksten og PDF-vedleggene, og velger ut sidene med mest nyttig innhold
   (høydepunkter, dagrater/TCE, booking for neste kvartal, dødpunkt, utbytte, gjeld og utsikter).
3. Groq på gratisnivå tar maks 8 000 tokens i minuttet. Lange rapporter leses derfor i biter
   (notater per bit), og til slutt lager en større modell ett samlet svar i JSON.
4. Hvert tall i svaret sjekkes mot kildeteksten. Tall som ikke finnes der, merkes som ukontrollert.

Gir aldri kjøps- eller salgsråd.
"""
import io
import json
import os
import re
import time
from datetime import timedelta

import requests

import ai
import db
from universe import COMPANIES

BASE = "https://api3.oslo.oslobors.no/v1/newsreader"
H = {"User-Agent": "Mozilla/5.0 (Terminal FC; privat terminal)", "Accept": "application/json"}
NAMES = {c["symbol"]: c["name"] for c in COMPANIES}
SEGMENT = {c["symbol"]: c["segment"] for c in COMPANIES}

# Ikke selve rapporten: invitasjoner, webcast-lenker, kalender, utbyttedetaljer
SKIP = re.compile(r"invitation|invitasjon|webcast|conference call|to be held|will be held|key information|"
                  r"financial calendar|finansiell kalender|ex[- ]dividend|reminder|påminnelse|general meeting|"
                  r"generalforsamling|\begm\b|\bagm\b|notice of|innkalling|mandatory notification|share buy|change of (date|publication)|"
                  r"publication date|postpone|reschedul|new date|ny dato|endring av dato|utsatt", re.I)
REPORTISH = re.compile(r"result|quarter|kvartal|half[- ]year|halvår|annual report|årsrapport|interim|"
                       r"presentation|\bq[1-4]\b|financial information|financial statements|nine[- ]month|six[- ]month", re.I)
MAX_PDF_BYTES = 25_000_000
VERSION = 8  # økes når leseren forbedres, så gamle uttrekk leses på nytt

# Groq: én forespørsel må holde seg under 8 000 tokens (inn + ut). Ca. 3,6 tegn per token i rapporttekst.
CHUNK_CHARS = 11_000
DIRECT_CHARS = 12_000
SOURCE_BUDGET = 40_000


# ---------------------------------------------------------------- periode
WORD_Q = {"first": 1, "second": 2, "third": 3, "fourth": 4, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4,
          "første": 1, "andre": 2, "tredje": 3, "fjerde": 4}


def period_of(title: str, published) -> str:
    t = title.lower()
    years = [int(y) for y in re.findall(r"\b(20[2-3]\d)\b", t)]  # største år, så «2020 Bulkers» ikke blir året
    m = re.search(r"\bq([1-4])\b|\b([1-4])q\b", t)
    if m:
        q = int(m.group(1) or m.group(2))
    else:
        w = re.search(r"\b(first|second|third|fourth|1st|2nd|3rd|4th|første|andre|tredje|fjerde)\s+(quarter|kvartal)", t)
        if w:
            q = WORD_Q[w.group(1)]
        elif re.search(r"half[- ]year|first half|six[- ]month|halvår", t):
            q = 2
        elif re.search(r"nine[- ]month", t):
            q = 3
        elif re.search(r"annual|full[- ]year|årsrapport|fourth", t):
            q = 4
        else:
            q = None
    if q is None:
        # Ukjent: rapporter kommer som regel 1–2 måneder etter kvartalsslutt
        d = published - timedelta(days=45)
        q, y = (d.month - 1) // 3 + 1, d.year
        return f"Q{q} {y}"
    y = max(years) if years else (published.year if q < 4 or published.month > 3 else published.year - 1)
    return f"Q{q} {y}"


# ---------------------------------------------------------------- kildetekst
def _get_json(url, params):
    for i in range(3):
        try:
            r = requests.get(url, params=params, headers=H, timeout=(8, 30))
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if i == 2:
                raise
            time.sleep(4 * (i + 1))


def pdf_pages(blob: bytes) -> list[str]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(blob))
        return [(p.extract_text() or "") for p in reader.pages]
    except Exception as e:  # noqa: BLE001
        print(f"    ! Kunne ikke lese PDF: {e}")
        return []


def fetch_sources(message_ids: list[int]) -> tuple[list[dict], list[dict]]:
    """Returnerer (biter med tekst, vedleggsliste) for alle meldingene i gruppen."""
    parts, files = [], []
    for mid in message_ids:
        msg = _get_json(f"{BASE}/message", {"messageId": mid}).get("data", {}).get("message", {})
        body = re.sub(r"<[^>]+>", " ", msg.get("body") or "")
        body = re.sub(r"[ \t]+", " ", body).strip()
        for k in range(0, len(body), 3500):
            parts.append({"src": f"Melding: {msg.get('title', '')} ({k // 3500 + 1})", "text": body[k:k + 3500], "first": k < 7000})
        for a in (msg.get("attachments") or [])[:4]:
            name = a.get("name") or ""
            url = f"{BASE}/attachment?messageId={mid}&attachmentId={a.get('id')}"
            files.append({"name": name, "url": url})
            if not name.lower().endswith(".pdf"):
                continue
            try:
                r = requests.get(url, headers={"User-Agent": H["User-Agent"]}, timeout=(8, 90))
                if not r.ok or r.content[:4] != b"%PDF" or len(r.content) > MAX_PDF_BYTES:
                    continue
            except requests.RequestException as e:
                print(f"    ! Vedlegg {name}: {e}")
                continue
            for i, page in enumerate(pdf_pages(r.content)):
                page = re.sub(r"[ \t]+", " ", page).strip()
                if len(page) > 80:
                    parts.append({"src": f"{name} s. {i + 1}", "text": page, "first": i < 3})
    return parts, files


SCORE = [
    (r"highlight|høydepunkt|summary|key figures|nøkkeltall", 4),
    (r"\btce\b|time charter equivalent|per day|/day|pr\.? dag|per dag|dagrate", 4),
    (r"booked|fixed|covered|contracted|coverage|booket|sikret|forward", 5),
    (r"break[- ]?even|dødpunkt|opex", 5),
    (r"dividend|utbytte|distribution|buyback|tilbakekjøp", 4),
    (r"outlook|utsikter|guidance|market update|markedet", 3),
    (r"net income|net profit|resultat|ebitda|earnings per share|eps|revenue|inntekter", 3),
    (r"net debt|netto gjeld|liquidity|likviditet|cash and cash equivalents|leverage", 2),
    (r"fleet|flåte|newbuild|nybygg|delivery|levering|sold|sale of|acquisition|kjøp", 2),
    (r"forward[- ]looking statements|disclaimer|this presentation is not|safe harbor", -8),
    (r"consolidated statement of (financial position|cash flows|changes in equity)|notes to the", -2),
]


KEYLINE = re.compile(r"\bcover(ed|age)\b|\bbooked\b|\bfixed\b|\bcontracted\b|break[- ]?even|\btce\b|"
                     r"per (operating |calendar |available )?day|/day|dividend of|dividend per share|declared a (cash )?dividend|"
                     r"booket|dekket|dødpunkt|utbytte på", re.I)


def key_lines(parts: list[dict], budget: int = 5000) -> str:
    """Tekstbiter rundt setninger om booking, dagrater, dødpunkt og utbytte, fra hele rapporten.
    Sendes alltid med, så de viktigste tallene ikke forsvinner når rapporten er lang."""
    out, seen, used = [], set(), 0
    for p in parts:
        t = re.sub(r"\s+", " ", p["text"])
        spans = []
        for m in KEYLINE.finditer(t):
            a, b = max(0, m.start() - 250), min(len(t), m.end() + 450)
            if spans and a <= spans[-1][1]:
                spans[-1][1] = b
            else:
                spans.append([a, b])
        for a, b in spans:
            snip = t[a:b].strip()
            sig = re.sub(r"[^a-z0-9]", "", snip.lower())[:160]
            if sig in seen or used + len(snip) > budget:
                continue
            seen.add(sig)
            out.append(f"…{snip}…")
            used += len(snip) + 4
    return "\n".join(out)


def _shingles(text: str) -> set[str]:
    w = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(w[i:i + 8]) for i in range(0, max(0, len(w) - 7), 3)}


def pick_text(parts: list[dict], budget: int = SOURCE_BUDGET) -> str:
    """Velger de mest nyttige delene innenfor budsjettet, i opprinnelig rekkefølge.
    Hopper over deler som stort sett gjentar noe som allerede er valgt (meldingen og PDF-en er ofte like)."""
    scored = []
    for i, p in enumerate(parts):
        t = p["text"].lower()
        s = sum(w * min(3, len(re.findall(rx, t))) for rx, w in SCORE)
        s += 6 if p["first"] else 0
        s += min(4, len(re.findall(r"\d[\d,.\s]{2,}", t)) // 15)  # tallrike sider er ofte nyttige
        scored.append((s, i))
    chosen, used, seen = set(), 0, set()
    for s, i in sorted(scored, reverse=True):
        if s <= 0:
            continue
        sh = _shingles(parts[i]["text"][:6000])
        if sh and len(sh & seen) / len(sh) > 0.6:
            continue
        n = min(len(parts[i]["text"]), 6000) + 40
        if used + n > budget:
            continue
        chosen.add(i)
        seen |= sh
        used += n
    return "\n\n".join(f"[{parts[i]['src']}]\n{parts[i]['text'][:6000]}" for i in sorted(chosen))


# ---------------------------------------------------------------- KI (via felles KI-lag)
MissingKey = ai.MissingKey
RateLimited = ai.RateLimited
BIG_BUDGET = 150_000  # tegn kildetekst når en leverandør med stor kontekst (Mistral/Gemini) er tilgjengelig


NOTES_PROMPT = (
    "Du leser del {i} av {n} av en kvartalsrapport fra shippingselskapet {name} ({period}). "
    "Skriv korte stikkord på engelsk med ALLE konkrete tall som står i teksten om: resultat (inntekter, EBITDA, "
    "nettoresultat, resultat per aksje), oppnådde dagrater/TCE per skipstype, andel dager booket for neste kvartal og til "
    "hvilken rate, dødpunkt/cash breakeven og opex per dag, utbytte per aksje, gjeld, kontanter, flåte (kjøp, salg, nybygg), "
    "antall skip per skipstype og tilgjengelige/operative dager per skipstype, "
    "og hva ledelsen sier om markedet framover. Skriv tallene nøyaktig som i teksten, med enhet og periode. "
    "Ikke gjett og ikke regn ut noe selv. Maks 220 ord.\n\nTEKST:\n{text}"
)

FINAL_PROMPT = """Du er analytiker i en privat shippingterminal. Under er utdrag fra kvartalsrapporten til {name} ({segment}), periode {period}.
Først kommer NØKKELLINJER (setninger om booking, dagrater, dødpunkt og utbytte hentet fra hele rapporten), deretter mer tekst eller notater.
Lag et nøkternt sammendrag for en privatinvestor som holder aksjer i uker til måneder.

REGLER:
- Bruk BARE tall som står i teksten. Skriv dem nøyaktig som de står (samme tall og enhet). Ikke regn ut nye tall.
- Ratene i 2026 kan være ekstreme (flere hundre tusen USD per dag). Kopier tallet selv om det virker uvanlig høyt eller lavt.
  Aldri juster, avrund eller «korriger» et tall etter hva du tror er normalt.
- Mangler et tall, bruk null. Ikke gjett.
- Ingen kjøps- eller salgsråd, ingen kursmål, ikke gjengi analytikeres anbefalinger.
- ALLE tekstfelt (headline, summary, outlook, watch, fleet, label, note) skal være på norsk bokmål, selv om rapporten er på engelsk.
  Oversett, ikke kopier engelske setninger. Skipstyper (VLCC, Suezmax, LR2, PCTC) og tall kan stå som i rapporten.
- Kort og enkelt språk.
- "bookings" er det viktigste: andel av dagene i NESTE periode som er booket/covered/fixed/done, og snittraten for de dagene.
  Ikke bland med oppnådd rate for kvartalet som rapporteres (det hører i "tce"). I tabeller står raten rett før prosenten:
  «Q4 2026 Spot % done … $562,600 68%» betyr 68 % booket til 562 600 USD/dag.
  "segment" er bare skipstypen (VLCC, Suezmax, LR2, MR …). Skriv i "note" om det gjelder spotdager, timecharter eller alle dager.
  Er bare et snitt for hele flåten oppgitt, bruk segment "flåtesnitt". Ikke lag rader uten tall. Ta med hver skipstype
  og både spot- og totaldager hvis begge er oppgitt. I tabeller heter kolonnene ofte «% covered» og «TCE currently contracted».
- "vessels": antall skip selskapet driver per skipstype (eid og innleid, på vannet nå, ikke nybygg som ikke er levert),
  og antall tilgjengelige/operative dager for NESTE periode hvis det står. Bare tall som står i teksten. Står bare
  hele flåten, bruk segment "flåtesnitt". Står ingenting, bruk tom liste.
- Settes "is_report" til false hvis teksten ikke er en finansiell rapport (f.eks. bare ny dato, invitasjon eller kalender).

Svar KUN med gyldig JSON i dette formatet:
{{
 "is_report": true,
 "period": "{period}",
 "headline": "én setning på norsk om det viktigste",
 "tone": "positiv | nøytral | negativ (hvordan rapporten selv beskriver kvartalet og utsiktene)",
 "summary": ["4–6 korte punkter"],
 "numbers": [{{"label": "f.eks. Resultat per aksje", "value": 2.38, "unit": "USD", "period": "Q3 2026"}}],
 "tce": [{{"segment": "VLCC", "rate": 61500, "unit": "USD/dag", "period": "Q3 2026"}}],
 "bookings": [{{"segment": "VLCC", "period": "Q4 2026", "share_pct": 65, "rate": 98000, "unit": "USD/dag", "note": "spotdager"}}],
 "breakeven": [{{"segment": "flåtesnitt", "rate": 23600, "unit": "USD/dag", "note": "cash breakeven neste 12 mnd"}}],
 "vessels": [{{"segment": "VLCC", "count": 41, "days": null, "note": "eid og innleid"}}],
 "dividend": {{"per_share": 2.38, "unit": "USD", "note": "kort om utbetaling eller politikk"}},
 "balance": [{{"label": "Netto rentebærende gjeld", "value": 1200, "unit": "MUSD"}}],
 "fleet": "én setning om flåteendringer, eller null",
 "outlook": "1–2 setninger om hva ledelsen sier om markedet framover",
 "watch": ["2–4 ting en investor bør følge med på, basert på rapporten"]
}}

TEKST:
{text}"""


def notes_for(name: str, period: str, source: str, size: int = CHUNK_CHARS) -> str:
    chunks = [source[i:i + size] for i in range(0, len(source), size)][:5]
    notes = []
    for i, ch in enumerate(chunks):
        if i:
            time.sleep(62)  # gratisnivået tillater omtrent én slik bit i minuttet per modell
        text, _ = ai.chat(NOTES_PROMPT.format(i=i + 1, n=len(chunks), name=name, period=period, text=ch), "small", 700, local_ok=False)
        notes.append(f"[Notater del {i + 1}]\n{text}")
    return "\n\n".join(notes)


def final(name: str, sym_segment: str, period: str, material: str, purpose: str = "quality") -> tuple[dict, str]:
    raw, model = ai.chat(FINAL_PROMPT.format(name=name, segment=sym_segment, period=period, text=material),
                         purpose, 2200, json_mode=True, temperature=0.1, local_ok=False)
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise RuntimeError("Svaret var ikke JSON")
    return json.loads(m.group(0)), model


FIX_PROMPT = """Noen tall i et uttrekk fra kvartalsrapporten til {name} ({period}) står ikke i rapporten, eller hører ikke sammen.
Finn de riktige tallene i NØKKELLINJENE under. Kopier dem nøyaktig, også hvis de virker ekstreme. Finnes de ikke, bruk null.
Booking gjelder NESTE kvartal. I tabeller står raten rett før prosenten («$562,600 68%» = 68 % til 562 600).
I setninger står den etter («74% of Q4 days are covered at USD 55,148»). Oppnådd rate for rapportert kvartal hører i "tce".
Svar KUN med JSON med de samme listene rettet: {{"bookings": [...], "tce": [...], "breakeven": [...]}}

FEIL ELLER USIKRE TALL:
{bad}

NØKKELLINJER:
{keys}"""


def fix(name: str, period: str, data: dict, keys: str) -> dict:
    """Én ekstra runde hvis booking, dagrater eller dødpunkt ikke finnes i kilden."""
    bad, bad_fields = [], set()
    for field, num in (("bookings", "rate"), ("tce", "rate"), ("breakeven", "rate")):
        for row in data.get(field) or []:
            if row.get(f"{num}_ok") is False or row.get("share_pct_ok") is False:
                bad.append(f"{field}: {json.dumps({k: v for k, v in row.items() if not k.endswith('_ok')}, ensure_ascii=False)}")
                bad_fields.add(field)
    if not bad or not keys:
        return data
    time.sleep(20)
    try:
        raw, _ = ai.chat(FIX_PROMPT.format(name=name, period=period, bad="\n".join(bad), keys=keys),
                         "quality", 1500, json_mode=True, temperature=0.1, local_ok=False)
        m = re.search(r"\{.*\}", raw, re.S)
        new = json.loads(m.group(0)) if m else {}
    except Exception as e:  # noqa: BLE001
        print(f"    ! Rettelsesrunden feilet: {e}")
        return data
    for field in bad_fields:  # bare listene som hadde feil byttes ut
        if isinstance(new.get(field), list) and new[field]:
            data[field] = [{k: v for k, v in r.items() if not k.endswith("_ok")} for r in new[field] if isinstance(r, dict)]
    data["fixed"] = True
    return data


def ask(name: str, segment: str, period: str, source: str, keys: str, full: str = "") -> tuple[dict, str]:
    head = f"NØKKELLINJER:\n{keys}\n\n" if keys else ""
    # Med Mistral eller Gemini leses hele den utvalgte rapportteksten i én forespørsel
    if full and ai.has("big"):
        try:
            return final(name, segment, period, head + "TEKST:\n" + full, purpose="big")
        except (RuntimeError, ai.RateLimited) as e:
            print(f"    · Hel lesing gikk ikke ({e}), leser i biter i stedet")
    if len(source) + len(head) <= DIRECT_CHARS:
        try:
            return final(name, segment, period, head + "TEKST:\n" + source)
        except RuntimeError:
            pass  # for stor for leverandørene som er ledige: les i biter
    return final(name, segment, period, head + notes_for(name, period, source))


# ---------------------------------------------------------------- kontroll av tall
NUM = re.compile(r"\d{1,3}(?:[ ,.  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?")


def _interpret(raw: str) -> set[float]:
    s = raw.replace("\u00a0", " ").replace("\u202f", " ")
    cands = set()
    if re.fullmatch(r"\d{1,3}(?:[ ,.]\d{3})+", s):
        cands.add(float(re.sub(r"[ ,.]", "", s)))
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+\.\d+", s):
        cands.add(float(s.replace(",", "")))
    if re.fullmatch(r"\d{1,3}(?:[ .]\d{3})+,\d+", s):
        cands.add(float(s.replace(" ", "").replace(".", "").replace(",", ".")))
    if re.fullmatch(r"\d+[.,]\d+", s):
        cands.add(float(s.replace(",", ".")))
    if re.fullmatch(r"\d+", s):
        cands.add(float(s))
    return cands


def numbers_pos(text: str) -> list[tuple[int, set[float]]]:
    return [(m.start(), _interpret(m.group(0))) for m in NUM.finditer(text)]


def numbers_in(text: str) -> set[float]:
    """Alle tall i teksten, med flere tolkninger av skilletegn (23.600 kan bety 23600 eller 23,6)."""
    out = set()
    for _, c in numbers_pos(text):
        out |= c
    return out


def _match(v: float, p: float) -> bool:
    if abs(p - v) <= max(0.0015 * v, 0.006):
        return True
    # «$61.5k» mot 61 500, eller «1,2 mrd» mot 1 200 mill.: bare for tall med desimaler eller over 10
    return (p >= 10 or p != int(p)) and any(abs(p * k - v) <= 0.0015 * v for k in (1000, 0.001))


def found(value, pool: set[float]) -> bool:
    try:
        v = abs(float(value))
    except (TypeError, ValueError):
        return True
    if v == 0:
        return True
    return any(_match(v, p) for p in pool)


def _is_year(c: set[float]) -> bool:
    return any(1990 <= x <= 2035 and x == int(x) for x in c)


def found_pair(share, rate, pos: list[tuple[int, set[float]]], text: str) -> bool:
    """Hører raten til andelen? I tekst står raten etter prosenten («74 % ... covered at USD 55,148»),
    i tabeller rett foran («$562,600 68%»). Godtar bare nærmeste store tall i én av de to retningene."""
    try:
        vs, vr = abs(float(share)), abs(float(rate))
    except (TypeError, ValueError):
        return False
    big = [(i, c) for i, c in pos if any(x >= 1000 for x in c) and not _is_year(c)]
    for i, c in pos:
        if not any(abs(x - vs) < 0.51 for x in c):
            continue
        tail = text[i:i + 8]
        if "%" not in tail and "pct" not in tail.lower() and "per cent" not in text[i:i + 14].lower():
            continue
        after = next(((j, cj) for j, cj in big if j > i), None)
        before = next(((j, cj) for j, cj in reversed(big) if j < i), None)
        if after and after[0] - i <= 220 and any(_match(vr, x) for x in after[1]):
            return True
        # Tabell: tallet rett foran, med bare mellomrom eller tegn imellom (ingen ord)
        if before and i - before[0] <= 40 and not re.search(r"[A-Za-z]", text[before[0]:i]) and any(_match(vr, x) for x in before[1]):
            return True
    return False


def tidy(data: dict) -> dict:
    """Fjerner tomme rader (uten tall eller med 0), som modellen av og til lager for skipstyper uten opplysninger."""
    def has(r, k):
        try:
            return r.get(k) is not None and float(r[k]) != 0
        except (TypeError, ValueError):
            return False
    for field, keys in (("bookings", ("rate",)), ("tce", ("rate",)), ("breakeven", ("rate",)),
                        ("numbers", ("value",)), ("balance", ("value",)), ("vessels", ("count", "days"))):
        rows = data.get(field)
        if isinstance(rows, list):
            data[field] = [r for r in rows if isinstance(r, dict) and any(has(r, k) for k in keys)]
    return data


SEG = r"(VLCC|Suezmax|Aframax|LR2|LR1|MR2|MR1|MR|Handy(?:size)?|Capesize|Panamax|Kamsarmax|Ultramax|Supramax|Newcastlemax|PCTC|VLGC|LPG|LNG|chemical|product)"
BOOK = re.compile(
    r"(?P<share>\d{1,3}(?:[.,]\d)?)\s?%\s(?:of\s)?(?P<what>[^.%;]{0,90}?)(?:days?|earning days|operating days|spot days|voyage days)"
    r"[^.%;]{0,40}?(?:have been|has been|are|were|is)?\s?(?:covered|booked|fixed|contracted)\s(?:for\s(?:Q[1-4]\s?(?:20\d\d)?|the\s\w+\squarter)\s)?"
    r"at\s(?:an\s)?(?:average\s)?(?:(?:daily\s)?TCE\s(?:rate\s)?)?(?:of\s)?(?:USD|US\$|\$)\s?(?P<rate>\d{1,3}(?:[,.\s]\d{3})+|\d{4,6})",
    re.I)


def rule_bookings(text: str, default_period: str) -> list[dict]:
    """Faste regler for setninger som «74% of our Q4 earning days are covered at an average of USD 55,148 per day»."""
    out, seen = [], set()
    t = re.sub(r"\s+", " ", text)
    for m in BOOK.finditer(t):
        ctx = t[max(0, m.start() - 120): m.end()]
        seg = re.findall(SEG, ctx, re.I)
        per = re.search(r"\bQ([1-4])\s?(20\d\d)?", t[max(0, m.start() - 160): m.end()])
        period = f"Q{per.group(1)} {per.group(2) or default_period.split()[-1]}" if per else default_period
        share = float(m.group("share").replace(",", "."))
        rate = float(re.sub(r"[,.\s]", "", m.group("rate")))
        key = (share, rate)
        if key in seen or not (0 < share <= 100) or rate < 1000:
            continue
        seen.add(key)
        whole = m.group(0).lower()
        note = "spotdager" if "spot" in whole else ("operative dager" if "operating" in whole else "")
        out.append({"segment": seg[-1] if seg else "flåtesnitt", "period": period, "share_pct": share, "rate": rate,
                    "unit": "USD/dag", "note": note or "fra teksten", "rate_ok": True, "share_pct_ok": True, "rule": True})
    return out[:8]


def next_period(period: str) -> str:
    m = re.match(r"Q([1-4]) (\d{4})", period)
    if not m:
        return period
    q, y = int(m.group(1)), int(m.group(2))
    return f"Q{q % 4 + 1} {y + (1 if q == 4 else 0)}"


def verify(data: dict, source: str) -> dict:
    data = tidy(data)
    pool = numbers_in(source)
    pos = numbers_pos(source)
    checked = missing = 0

    def mark(obj: dict, field: str):
        nonlocal checked, missing
        if obj.get(field) is None:
            return
        ok = found(obj[field], pool)
        obj[f"{field}_ok"] = ok
        checked += 1
        missing += 0 if ok else 1

    for row in data.get("numbers") or []:
        mark(row, "value")
    for row in data.get("tce") or []:
        mark(row, "rate")
    for row in data.get("bookings") or []:
        mark(row, "rate")
        mark(row, "share_pct")
        # Raten må høre til andelen, ellers er det trolig to tall fra ulike kolonner eller kvartaler
        if row.get("rate") is not None and row.get("share_pct") is not None and row.get("rate_ok"):
            if not found_pair(row["share_pct"], row["rate"], pos, source):
                row["rate_ok"] = False
                missing += 1
    for row in data.get("breakeven") or []:
        mark(row, "rate")
    for row in data.get("balance") or []:
        mark(row, "value")
    for row in data.get("vessels") or []:
        mark(row, "count")
        mark(row, "days")
    if isinstance(data.get("dividend"), dict):
        mark(data["dividend"], "per_share")
    data["check"] = {"checked": checked, "unverified": missing}
    return data


# ---------------------------------------------------------------- jobben
def discover(conn, days: int = 200) -> int:
    """Grupperer resultatmeldinger per selskap og kvartal og legger nye grupper i køen."""
    with conn.cursor() as cur:
        cur.execute("""SELECT id, symbol, title, published FROM announcements
                       WHERE kind IN ('Rapport', 'Annet') AND published > now() - make_interval(days => %s)
                       ORDER BY published""", (days,))
        rows = [r for r in cur.fetchall() if REPORTISH.search(r[2]) and not SKIP.search(r[2])]
        groups: dict[tuple[str, str], dict] = {}
        for mid, sym, title, published in rows:
            g = groups.setdefault((sym, period_of(title, published)), {"ids": [], "titles": [], "published": published})
            g["ids"].append(mid)
            g["titles"].append(title)
            g["published"] = min(g["published"], published)
        added = 0
        for (sym, period), g in groups.items():
            cur.execute(
                """INSERT INTO reports (key, symbol, period, published, title, message_ids, status)
                   VALUES (%s,%s,%s,%s,%s,%s,'pending')
                   ON CONFLICT (key) DO UPDATE SET message_ids = EXCLUDED.message_ids, title = EXCLUDED.title,
                     status = CASE WHEN reports.message_ids <> EXCLUDED.message_ids AND reports.status <> 'pending'
                                   AND reports.tries < 3 THEN 'pending' ELSE reports.status END
                   RETURNING (xmax = 0)""",
                (f"{sym}|{period}", sym, period, g["published"], " · ".join(dict.fromkeys(g["titles"]))[:400], sorted(g["ids"])),
            )
            added += 1 if cur.fetchone()[0] else 0
        keys = [f"{sym}|{period}" for sym, period in groups]
        cur.execute("""DELETE FROM reports WHERE published > now() - make_interval(days => %s) AND NOT (key = ANY(%s))""", (days, keys))
        # Bare den nyeste rapporten per selskap leses på nytt når leseren forbedres (sparer KI-kvote).
        # Den gamle versjonen vises til den nye er ferdig.
        cur.execute("""UPDATE reports SET status = 'pending', tries = 0 WHERE status = 'ok'
                       AND coalesce((data->>'v')::int, 1) < %s
                       AND key IN (SELECT DISTINCT ON (symbol) key FROM reports WHERE status IN ('ok', 'pending') ORDER BY symbol, published DESC)""",
                    (VERSION,))
    conn.commit()
    return added


def run(conn, max_reports: int = 3, budget_s: int = 480) -> int:
    ai.require()
    if ai.has("big"):
        max_reports, budget_s = max(max_reports, 6), max(budget_s, 600)  # hele rapporter går raskere med stor kontekst
    added = discover(conn)
    t0 = time.time()
    done = 0
    with conn.cursor() as cur:
        cur.execute("""SELECT key, symbol, period, message_ids FROM reports
                       WHERE status = 'pending' AND tries < 3 ORDER BY published DESC LIMIT %s""", (max_reports,))
        todo = cur.fetchall()
        cur.execute("SELECT count(*) FROM reports WHERE status = 'pending' AND tries < 3")
        queue = cur.fetchone()[0]
    print(f"  Rapporter: {added} nye i køen, {queue} venter, leser {len(todo)} nå (KI: {', '.join(ai.available())})")
    conn.commit()

    def write(sql: str, params: tuple) -> None:
        # Frisk tilkobling for hver skriving: lesingen kan ta minutter, og Neon lukker ubrukte tilkoblinger
        with db.connect() as c2, c2.cursor() as cur:
            cur.execute(sql, params)
            c2.commit()

    for key, sym, period, ids in todo:
        if time.time() - t0 > budget_s:
            break
        name = NAMES.get(sym, sym)
        write("UPDATE reports SET tries = tries + 1, updated_at = now() WHERE key = %s", (key,))
        try:
            parts, files = fetch_sources(list(ids))
            source = pick_text(parts)
            keys = key_lines(parts)
            if len(source) < 400:
                raise RuntimeError("Fant nesten ingen tekst i meldingen eller vedleggene")
            full = pick_text(parts, budget=BIG_BUDGET) if ai.has("big") else ""
            data, model = ask(name, SEGMENT.get(sym, ""), period, source, keys, full)
            data = verify(data, keys + "\n" + source)
            if data["check"]["unverified"]:
                data = verify(fix(name, period, data, keys), keys + "\n" + source)
            # Sikring uten KI: hvis ingen bookingrad er bekreftet, bruk setningene som kan leses med faste regler
            if not any(b.get("rate_ok") and b.get("share_pct_ok", True) for b in data.get("bookings") or []):
                rb = rule_bookings(keys + "\n" + source, next_period(period))
                if rb:
                    data["bookings"] = rb
                    data["bookings_by_rule"] = True
            data["files"] = files
            data["v"] = VERSION
            status = "ok" if data.get("is_report", True) is not False else "skip"
            write("""UPDATE reports SET status = %s, data = %s, model = %s, source_chars = %s, error = NULL,
                     updated_at = now() WHERE key = %s""", (status, json.dumps(data, ensure_ascii=False), model, len(source), key))
            done += 1
            c = data["check"]
            print(f"  ✓ {name} {period}: {data.get('headline', '')[:110]} ({c['checked'] - c['unverified']}/{c['checked']} tall funnet i kilden)")
            for b in (data.get("bookings") or [])[:4]:
                print(f"      booket {b.get('segment')} {b.get('period')}: {b.get('share_pct')} % til {b.get('rate')} {b.get('unit', '')}"
                      f"{'' if b.get('rate_ok', True) else '  (?)'}")
            for b in (data.get("breakeven") or [])[:3]:
                print(f"      dødpunkt {b.get('segment')}: {b.get('rate')} {b.get('unit', '')}{'' if b.get('rate_ok', True) else '  (?)'}")
            for v in (data.get("vessels") or [])[:5]:
                days = f", {v['days']} dager" if v.get("days") else ""
                print(f"      skip {v.get('segment')}: {v.get('count')}{'' if v.get('count_ok', True) else ' (?)'}{days}")
            dv = data.get("dividend") or {}
            if dv.get("per_share") is not None:
                print(f"      utbytte {dv.get('per_share')} {dv.get('unit', '')}{'' if dv.get('per_share_ok', True) else '  (?)'}")
            print(f"      kilde: {len(source)} tegn fra {len(parts)} deler, {len(keys)} tegn nøkkellinjer{'' if status == 'ok' else ' (ikke en rapport, skjules)'}")
        except RateLimited as e:
            print(f"  ! {e}. Fortsetter neste kjøring.")
            write("UPDATE reports SET tries = greatest(tries - 1, 0) WHERE key = %s", (key,))
            break
        except Exception as e:  # noqa: BLE001
            print(f"  ! {name} {period}: {e}")
            # Har rapporten et eldre, godkjent uttrekk, beholdes det (og merkes med ny versjon så den ikke leses i ring)
            write("""UPDATE reports SET error = %s,
                     status = CASE WHEN tries < 3 THEN 'pending' WHEN data ? 'v' THEN 'ok' ELSE 'error' END,
                     data = CASE WHEN tries >= 3 AND data ? 'v' THEN jsonb_set(data, '{v}', to_jsonb(%s::int)) ELSE data END
                     WHERE key = %s""", (str(e)[:300], VERSION, key))
        if todo and time.time() - t0 < budget_s:
            time.sleep(5 if ai.has("big") else 30)
    print(f"  KI-bruk: {ai.summary()}")
    return done
