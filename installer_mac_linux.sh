#!/usr/bin/env bash
# Installation de Mentor IA (macOS / Linux)
cd "$(dirname "$0")"
echo "============================================"
echo "   Installation de Mentor IA"
echo "============================================"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[!] Python 3 n'est pas installé : https://www.python.org/downloads/"
  exit 1
fi
echo "[OK] $(python3 --version) trouvé."

if ! command -v ollama >/dev/null 2>&1; then
  echo
  echo "[i] Ollama (l'IA locale gratuite) n'est pas installé."
  echo "    Mentor IA fonctionne sans, mais le tuteur sera limité aux réponses guidées."
  if [ "$(uname)" = "Darwin" ]; then
    echo "    Télécharge-le sur https://ollama.com/download puis relance ce script."
    exit 0
  fi
  read -r -p "    Installer Ollama maintenant avec le script officiel ? [o/N] " rep
  if [ "$rep" = "o" ] || [ "$rep" = "O" ]; then
    curl -fsSL https://ollama.com/install.sh | sh || exit 1
  else
    exit 0
  fi
fi
echo "[OK] Ollama trouvé."

MODELE=$(python3 -c "import json;print(json.load(open('config.json',encoding='utf-8'))['modele'])")
echo
echo "Téléchargement du modèle $MODELE (environ 2 Go, une seule fois)..."
ollama pull "$MODELE"
echo
echo "Installation terminée. Lance Mentor IA avec : ./lancer_mac_linux.sh"
