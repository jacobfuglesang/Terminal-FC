#!/usr/bin/env bash
# Starter den lokale KI-modellen (Ollama) på GitHub-maskinen. Ingen konto eller nøkkel trengs.
# Modellen (Qwen3 4B, Apache 2.0) lagres i GitHub-cachen mellom kjøringene, så den lastes ikke ned hver gang.
set -uo pipefail
MODEL="${LOCAL_MODEL:-qwen3:4b-instruct}"
export OLLAMA_MODELS="$HOME/.ollama/models"
mkdir -p "$OLLAMA_MODELS"
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh >/tmp/ollama-install.log 2>&1 || { echo "Ollama kunne ikke installeres"; tail -5 /tmp/ollama-install.log; exit 0; }
  # Installasjonen starter en egen tjeneste med en annen modellmappe. Vi kjører vår egen i stedet.
  sudo systemctl stop ollama >/dev/null 2>&1 || true
  sudo systemctl disable ollama >/dev/null 2>&1 || true
fi
OLLAMA_HOST=127.0.0.1:11434 OLLAMA_KEEP_ALIVE=60m OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 \
  nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
for _ in $(seq 1 30); do curl -fs http://127.0.0.1:11434/api/tags >/dev/null && break; sleep 1; done
ollama pull "$MODEL" >/tmp/ollama-pull.log 2>&1 || { echo "Fikk ikke lastet ned $MODEL"; tail -3 /tmp/ollama-pull.log; exit 0; }
# Varm opp, så første ekte svar går raskere
curl -fs http://127.0.0.1:11434/api/generate -d "{\"model\":\"$MODEL\",\"prompt\":\"OK\",\"stream\":false,\"options\":{\"num_predict\":1}}" >/dev/null || true
echo "Lokal modell klar: $MODEL ($(du -sh "$OLLAMA_MODELS" | cut -f1))"
