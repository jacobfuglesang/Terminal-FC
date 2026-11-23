"""Felles KI-lag: sender en oppgave til den leverandøren som passer best og har kvote igjen.

Leverandører (alle har OpenAI-kompatibelt API; hver brukes bare hvis nøkkelen finnes):
- Groq     GROQ_API_KEY     raskest. Gratisnivået tar maks 8 000 tokens per forespørsel og har dagsgrense per modell.
- Mistral  MISTRAL_API_KEY  gratisnivå med høyt tak (500 000 tokens/min, 1 forespørsel/s). Tåler hele rapporter.
- Gemini   GEMINI_API_KEY   gratisnivå med få forespørsler per dag, men stor kontekst.
- Lokal    (ingen nøkkel)   åpen modell (Qwen3 4B, Apache 2.0) som kjører på GitHub-maskinen via Ollama.
                            Treg og svakere, men uten kvote. Brukes som reserve når de andre er tomme,
                            og til kunnskapsbanken. Brukes aldri til tall i kvartals- og meglerrapporter.

Jobbtyper:
- "quality": morgenrapport og endelig rapportsammendrag (beste modell først)
- "big":     hele kvartalsrapporter i én forespørsel (trenger stor kontekst)
- "small":   korte nyhetssammendrag og notater (små og raske modeller)
- "local":   bare den lokale modellen (kunnskapsbanken, så skykvotene spares)

Hver leverandør er et eget selskap med egne vilkår. Vi bruker én konto per leverandør og holder oss innenfor grensene.
"""
from __future__ import annotations

import os
import re
import time

import requests


class MissingKey(Exception):
    pass


class RateLimited(Exception):
    pass


PROVIDERS = {
    "groq": {
        "env": "GROQ_API_KEY", "base": "https://api.groq.com/openai/v1", "max_chars": 18_000, "gap": 0.0,
        "prefer": {
            "quality": ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
            "big": [],
            "small": ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"],
        },
    },
    "mistral": {
        "env": "MISTRAL_API_KEY", "base": "https://api.mistral.ai/v1", "max_chars": 300_000, "gap": 1.2,
        "prefer": {
            "quality": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
            "big": ["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest"],
            "small": ["mistral-small-latest", "ministral-8b-latest", "mistral-medium-latest"],
        },
    },
    "gemini": {
        "env": "GEMINI_API_KEY", "base": "https://generativelanguage.googleapis.com/v1beta/openai", "max_chars": 400_000, "gap": 4.0,
        # Google bytter modellnavn ofte, så vi velger ut fra mønstre i modellisten
        "prefer": {"quality": [r"gemini-[\d.]+-flash$", r"gemini-[\d.]+-pro$"], "big": [r"gemini-[\d.]+-flash-lite$", r"gemini-[\d.]+-flash$"],
                   "small": [r"gemini-[\d.]+-flash-lite$"]},
        "pattern": True,
    },
}

# Den lokale modellen (Ollama). Startes i bakgrunnen av arbeidsflyten; er den ikke klar, hoppes den over.
LOCAL_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
LOCAL_MODEL = os.environ.get("LOCAL_MODEL", "qwen3:4b-instruct")
LOCAL_MAX_CHARS = 30_000
_local = {"ok": False, "checked": 0.0}

# Rekkefølgen leverandørene prøves i per jobbtype
ROUTE = {
    "quality": ["groq", "mistral", "gemini", "lokal"],
    "big": ["mistral", "gemini"],
    "small": ["groq", "mistral", "gemini", "lokal"],
    "local": ["lokal"],
}


def local_ready(wait_s: float = 0) -> bool:
    """Er Ollama-tjeneren oppe med modellen lastet ned? Sjekkes høyst hvert 20. sekund."""
    deadline = time.time() + wait_s
    while True:
        if _local["ok"]:
            return True
        if time.time() - _local["checked"] >= 20 or wait_s:
            _local["checked"] = time.time()
            try:
                r = requests.get(f"{LOCAL_URL}/api/tags", timeout=2)
                names = [m.get("name", "") for m in r.json().get("models", [])] if r.ok else []
                _local["ok"] = any(n == LOCAL_MODEL or n.startswith(LOCAL_MODEL + ":") for n in names)
            except Exception:  # noqa: BLE001
                _local["ok"] = False
        if _local["ok"] or time.time() >= deadline:
            return _local["ok"]
        time.sleep(10)


def _local_chat(prompt: str, max_out: int, json_mode: bool, temperature: float) -> str:
    payload = {"model": LOCAL_MODEL, "stream": False, "think": False, "keep_alive": "30m",
               "messages": [{"role": "user", "content": prompt}],
               "options": {"temperature": temperature, "num_predict": max_out, "num_ctx": 12288}}
    if json_mode:
        payload["format"] = "json"
    r = requests.post(f"{LOCAL_URL}/api/chat", json=payload, timeout=1200)
    if r.status_code == 400 and "think" in r.text:  # eldre Ollama uten think-valget
        payload.pop("think")
        r = requests.post(f"{LOCAL_URL}/api/chat", json=payload, timeout=1200)
    r.raise_for_status()
    return (r.json().get("message") or {}).get("content") or ""

_models: dict[str, list[str]] = {}
_exhausted: set[tuple[str, str]] = set()
_last_call: dict[str, float] = {}
used: dict[str, int] = {}  # antall vellykkede kall per leverandør i denne kjøringen (vises i loggen)


def key(provider: str) -> str:
    if provider == "lokal":
        return "lokal" if local_ready() else ""
    return (os.environ.get(PROVIDERS[provider]["env"]) or "").strip()


def available() -> list[str]:
    return [p for p in [*PROVIDERS, "lokal"] if key(p)]


def has(purpose: str) -> bool:
    return any(_pick(p, purpose) for p in ROUTE[purpose] if key(p))


def require() -> None:
    if not available():
        raise MissingKey("Venter på en KI-nøkkel (GROQ_API_KEY, MISTRAL_API_KEY eller GEMINI_API_KEY) eller den lokale modellen")


def _list_models(provider: str) -> list[str]:
    if provider not in _models:
        cfg = PROVIDERS[provider]
        try:
            r = requests.get(f"{cfg['base']}/models", headers={"Authorization": f"Bearer {key(provider)}"}, timeout=20)
            data = r.json().get("data", []) if r.ok else []
            _models[provider] = [str(m.get("id", "")).removeprefix("models/") for m in data]
        except Exception as e:  # noqa: BLE001
            print(f"  ! Fikk ikke modellisten fra {provider}: {e}")
            _models[provider] = []
    return _models[provider]


def _pick(provider: str, purpose: str) -> list[str]:
    if provider == "lokal":
        return [LOCAL_MODEL] if local_ready() else []
    cfg = PROVIDERS[provider]
    wish = cfg["prefer"].get(purpose, [])
    have = _list_models(provider)
    if cfg.get("pattern"):
        out = []
        for pat in wish:
            hits = sorted((m for m in have if re.search(pat, m) and "preview" not in m and "exp" not in m), reverse=True)
            out += hits[:1]
        return out
    if not have:  # ukjent liste: prøv ønskene direkte
        return wish
    return [m for m in wish if m in have]


def chat(prompt: str, purpose: str = "quality", max_out: int = 1500, json_mode: bool = False,
         temperature: float = 0.2, local_ok: bool = True) -> tuple[str, str]:
    """Returnerer (svar, "leverandør/modell"). Kaster RateLimited når alle aktuelle modeller er tomme for kvote.

    local_ok=False: den lokale modellen brukes ikke (for jobber der tallene må være helt riktige).
    """
    require()
    tried = limited = 0
    for provider in ROUTE[purpose]:
        if provider == "lokal":
            if not local_ok or len(prompt) > LOCAL_MAX_CHARS or not local_ready():
                continue
            tried += 1
            try:
                text = re.sub(r"<think>.*?</think>", "", _local_chat(prompt, max_out, json_mode, temperature), flags=re.S).strip()
            except Exception as e:  # noqa: BLE001
                print(f"    ! lokal {LOCAL_MODEL}: {e}")
                continue
            if text:
                used["lokal"] = used.get("lokal", 0) + 1
                return text, f"lokal/{LOCAL_MODEL}"
            continue
        if not key(provider):
            continue
        cfg = PROVIDERS[provider]
        if len(prompt) > cfg["max_chars"]:
            continue
        for model in _pick(provider, purpose):
            if (provider, model) in _exhausted:
                tried += 1
                limited += 1
                continue
            tried += 1
            payload = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": temperature,
                       "max_tokens" if provider != "groq" else "max_completion_tokens": max_out}
            if provider == "groq" and model.startswith("openai/gpt-oss"):
                payload["reasoning_effort"] = "low"
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            for attempt in range(3):
                wait = cfg["gap"] - (time.time() - _last_call.get(provider, 0))
                if wait > 0:
                    time.sleep(wait)
                _last_call[provider] = time.time()
                try:
                    r = requests.post(f"{cfg['base']}/chat/completions", json=payload, timeout=180,
                                      headers={"Authorization": f"Bearer {key(provider)}", "Content-Type": "application/json"})
                except requests.RequestException as e:
                    print(f"    ! {provider} {model}: {e}")
                    break
                if r.status_code == 429:
                    ra = float(r.headers.get("retry-after") or (5 if provider == "mistral" else 30))
                    if ra > 90 or attempt == 2:
                        _exhausted.add((provider, model))
                        limited += 1
                        print(f"    · {provider} {model} er tom for kvote, prøver neste")
                        break
                    time.sleep(ra + 1)
                    continue
                if r.status_code == 413:  # for stor for gratisnivået: prøv en leverandør med større kontekst
                    print(f"    · {provider} {model}: forespørselen er for stor, prøver neste")
                    break
                if r.status_code == 400 and attempt == 0 and ("response_format" in payload or "reasoning_effort" in payload):
                    payload.pop("response_format", None)
                    payload.pop("reasoning_effort", None)
                    continue
                if r.status_code != 200:
                    print(f"    ! {provider} {model}: HTTP {r.status_code} {r.text[:160]}")
                    break
                msg = (r.json().get("choices") or [{}])[0].get("message", {})
                text = msg.get("content") or ""
                if isinstance(text, list):  # noen leverandører svarer i biter
                    text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
                if text:
                    used[provider] = used.get(provider, 0) + 1
                    return text, f"{provider}/{model}"
                break
    if tried and limited == tried:
        raise RateLimited("Alle KI-modellene er tomme for kvote for nå")
    raise RuntimeError(f"Ingen KI-leverandør svarte (jobbtype {purpose})")


def summary() -> str:
    return ", ".join(f"{p}: {n} kall" for p, n in used.items()) or "ingen kall"
