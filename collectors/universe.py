"""Rederiene terminalen følger, og markedsseriene som driver dem.

Holdes i takt med web/lib/universe.ts.
"""

# newsweb = utstederkode på Oslo Børs Newsweb. news/ssr = regex for nyheter og Finanstilsynets utstedernavn.
COMPANIES = [
    {"symbol": "FRO.OL", "name": "Frontline", "newsweb": "FRO", "segment": "Råoljetank", "news": r"\bfrontline\b", "ssr": r"frontline",
     # «frontline» brukes mye om krigsfronter, så navnet må stå sammen med shippingord
     "ctx": r"\b(?:tankers?|vlccs?|suezmax\w*|aframax\w*|lr2s?|ships?|shipping|vessels?|fleet|plc|ltd|dividends?|quarter\w*|earnings|"
            r"results|barstad|fredriksen|fro|nyse|rederi\w*|skip\w*|frakt\w*|utbytte|kvartal\w*|oslo b[øo]rs|aksjen)\b"},
    {"symbol": "OET.OL", "name": "Okeanis Eco Tankers", "newsweb": "OET", "segment": "Råoljetank", "news": r"\bokeanis\b", "ssr": r"okeanis"},
    {"symbol": "HAFNI.OL", "name": "Hafnia", "newsweb": "HAFNI", "segment": "Produkttank", "news": r"\bhafnia\b", "ssr": r"hafnia"},
    {"symbol": "ODF.OL", "name": "Odfjell", "newsweb": "ODF", "segment": "Kjemikalietank", "news": r"\bodfjell\b(?!\s+(?:drilling|technology))", "ssr": r"^odfjell se|odfjell ser"},
    {"symbol": "SNI.OL", "name": "Stolt-Nielsen", "newsweb": "SNI", "segment": "Kjemikalietank", "news": r"stolt-nielsen|stolt tankers", "ssr": r"stolt-nielsen"},
    {"symbol": "2020.OL", "name": "2020 Bulkers", "newsweb": "2020", "segment": "Tørrbulk", "news": r"\b2020 bulkers\b", "ssr": r"2020 bulkers"},
    {"symbol": "HSHP.OL", "name": "Himalaya Shipping", "newsweb": "HSHP", "segment": "Tørrbulk", "news": r"himalaya shipping", "ssr": r"himalaya shipping"},
    {"symbol": "JIN.OL", "name": "Jinhui Shipping", "newsweb": "JIN", "segment": "Tørrbulk", "news": r"\bjinhui\b", "ssr": r"jinhui"},
    {"symbol": "KCC.OL", "name": "Klaveness Combination Carriers", "newsweb": "KCC", "segment": "Kombinasjon", "news": r"klaveness combination|\bkcc\b(?=.{0,60}(?:ship|bulk|tank|klaveness|combination))", "ssr": r"klaveness"},
    {"symbol": "MPCC.OL", "name": "MPC Container Ships", "newsweb": "MPCC", "segment": "Container", "news": r"mpc container", "ssr": r"mpc container"},
    {"symbol": "WAWI.OL", "name": "Wallenius Wilhelmsen", "newsweb": "WAWI", "segment": "Bilskip", "news": r"wallenius", "ssr": r"wallenius"},
    {"symbol": "HAUTO.OL", "name": "Höegh Autoliners", "newsweb": "HAUTO", "segment": "Bilskip", "news": r"h[øoö]egh autoliners", "ssr": r"h[øoö]egh autoliners"},
    {"symbol": "BWLPG.OL", "name": "BW LPG", "newsweb": "BWLPG", "segment": "Gass (LPG)", "news": r"\bbw lpg\b", "ssr": r"^bw lpg"},
    {"symbol": "CMBTO.OL", "name": "CMB.TECH", "newsweb": "CMBTO", "segment": "Diversifisert", "news": r"cmb\.?\s?tech|\beuronav\b|golden ocean", "ssr": r"cmb\.?\s?tech"},
    {"symbol": "WWI.OL", "name": "Wilh. Wilhelmsen", "newsweb": "WWI", "segment": "Maritime tjenester", "news": r"wilh\.? wilhelmsen|wilhelmsen holding", "ssr": r"wilh\.? wilhelmsen"},
]

# Markedsserier fra Yahoo Finance (navn, valuta)
MARKET = {
    "BWET": ("Tankfrakt (BWET, VLCC-futures)", "USD"),
    "BDRY": ("Tørrbulkfrakt (BDRY, futures)", "USD"),
    "BZ=F": ("Brent", "USD"),
    "TTF=F": ("Gass TTF", "EUR"),
    "NG=F": ("Gass Henry Hub", "USD"),
    "TIO=F": ("Jernmalm 62 %", "USD"),
    "HG=F": ("Kobber", "USD"),
    "ZS=F": ("Soyabønner", "USX"),
    "NOK=X": ("USD/NOK", "NOK"),
    "EURNOK=X": ("EUR/NOK", "NOK"),
    "OSEBX.OL": ("Oslo Børs hovedindeks", "NOK"),
}

SYMBOLS = {c["symbol"]: c["name"] for c in COMPANIES}
