# Mentor IA — contexte pour Claude Code

Plateforme d'apprentissage (formation développeur / ingénieur IA) avec un tuteur IA **local et gratuit** via Ollama. Tout tourne sur l'ordinateur de l'élève. L'utilisateur parle français : réponds en français.

## Principe de conception (à respecter)
Le modèle local est petit (qwen3.5:4b chez l'utilisateur) et peu fiable. Donc :
- tout ce qui doit être juste est fait **par le code** : correction par tests, indices écrits à l'avance, explications d'erreurs (`app/erreurs.py`), planning du jour, révisions espacées ;
- le modèle ne fait que **reformuler** une piste fournie, avec un prompt court et des règles strictes ;
- ses réponses sont filtrées (fuite de solution → réponse guidée) et l'appli marche **sans IA** (tuteur à règles).
- Pas de reconnaissance d'émotions (interdite par l'AI Act dans l'enseignement). La détection de fatigue par webcam est prévue plus tard : optionnelle, avec consentement, analyse uniquement en local, fatigue seulement.

## Lancer
- Windows : `lancer_windows.bat` (ou `py -3 lancer.py`) → http://127.0.0.1:8765
- Aucune dépendance pip : bibliothèque standard uniquement. Garder ça.
- Modèle : `config.json` → `"modele"` ; si absent, `app/tuteur.py` choisit automatiquement un modèle installé (préférence Qwen). Option `"think": false` envoyée à Ollama, avec repli si refusée.

## Structure
- `app/serveur.py` : serveur HTTP + API + programme du jour
- `app/correcteur.py` + `app/runner.py` : exécution du code élève dans un sous-processus (timeout 5 s)
- `app/tuteur.py` : client Ollama, garde-fous, repli sans IA
- `app/progression.py` : SQLite local `data/progression.db`
- `content/*.json` : modules de cours (un fichier = un module)
- `web/` : interface HTML/CSS/JS sans dépendance (hors ligne)
- `outils/verifier_contenu.py` : à lancer après toute modif de contenu (chaque solution doit passer ses tests, le code de départ non)
- `outils/tester_tuteur.py` : banc d'essai du tuteur contre le vrai modèle (9 situations d'élève × 3 essais), à relancer après toute modif de prompt ou de modèle ; détail dans `data/test_tuteur_*.json`

## Prochaines étapes envisagées
1. ~~Tester le tuteur avec le vrai modèle~~ (fait le 18/11/2026 : diagnostics d'erreurs de syntaxe précis, choix d'indice corrigé, filtre anti-fuite renforcé). Point faible restant : quand tout est réussi, le modèle invente parfois des remarques.
2. Écrire les modules suivants du parcours IA : NumPy, pandas, visualisation, scikit-learn, réseaux de neurones, LLM/RAG.
3. Plus tard : détection de fatigue optionnelle (webcam, locale), demande de certification (RNCP : nécessite des promotions réelles et le suivi de leur insertion professionnelle).
