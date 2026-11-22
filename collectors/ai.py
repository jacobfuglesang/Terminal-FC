"""Felles KI-lag: sender en oppgave til den leverandøren som passer best og har kvote igjen.

Leverandører (alle har OpenAI-kompatibelt API; hver brukes bare hvis nøkkelen finnes):
- Groq     GROQ_API_KEY     raskest. Gratisnivået tar maks 8 000 tokens per forespørsel og har dagsgrense per modell.
- Mistral  MISTRAL_API_KEY  gratisnivå med høyt tak (500 000 tokens/min, 1 forespørsel/s). Tåler hele rapporter.
- Gemini   GEMINI_API_KEY   gratisnivå med få forespørsler per dag, men stor kontekst.

Jobbtyper:
- "quality": morgenrapport og endelig rapportsammendrag (beste modell først)
- "big":     hele kvartalsrapporter i én forespørsel (trenger stor kontekst)
- "small":   korte nyhetssammendrag og notater (små og raske modeller)

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

# Rekkefølgen leverandørene prøves i per jobbtype
ROUTE = {
    "quality": ["groq", "mistral", "gemini"],
    "big": ["mistral", "gemini"],
    "small": ["groq", "mistral", "gemini"],
}

_models: dict[str, list[str]] = {}
_exhausted: set[tuple[str, str]] = set()
_last_call: dict[str, float] = {}
used: dict[str, int] = {}  # antall vellykkede kall per leverandør i denne kjøringen (vises i loggen)


def key(provider: str) -> str:
    return (os.environ.get(PROVIDERS[provider]["env"]) or "").strip()


def available() -> list[str]:
    return [p for p in PROVIDERS if key(p)]


def has(purpose: str) -> bool:
    return any(_pick(p, purpose) for p in ROUTE[purpose] if key(p))


def require() -> None:
    if not available():
        raise MissingKey("Venter på en KI-nøkkel (GROQ_API_KEY, MISTRAL_API_KEY eller GEMINI_API_KEY)")


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
         temperature: float = 0.2) -> tuple[str, str]:
    """Returnerer (svar, "leverandør/modell"). Kaster RateLimited når alle aktuelle modeller er tomme for kvote."""
    require()
    tried = limited = 0
    for provider in ROUTE[purpose]:
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
