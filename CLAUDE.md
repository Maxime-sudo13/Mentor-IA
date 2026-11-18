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
- Modèle : `config.json` → `"modele"` ; si absent, `app/tuteur.py` choisit automatiquement un modèle installé (préférence Qwen). Option `"think": false` envoyée à Ollama, avec repli si refusée (le refus est mémorisé).

## Choix du modèle (banc d'essai du 18/11/2026, RTX 2080 Super 8 Go)
`qwen3.5:4b` reste le meilleur tuteur : diagnostics justes, résiste aux « ignore tes règles », ~1,7 s par réponse.
Les modèles **coder** sont de MOINS bons tuteurs : entraînés à écrire du code, ils donnent la solution
(`qwen2.5-coder:3b` : code complet 3/3 sur « ignore tes règles », vouvoie, se trompe sur l'ordre des conditions ;
`qwen2.5-coder:7b` : style bizarre, répond longuement au hors-sujet). `qwen2.5:7b` et `llama3.1:8b` se trompent
sur l'ordre des conditions (« commence par le plus bas ») et cèdent parfois au contournement. Ne pas utiliser
de modèles « abliterated » (garde-fous retirés) pour des élèves.

## Garde-fous du tuteur (`app/tuteur.py`)
- `piste()` : prochain indice non vu, sans saut (un test réussi par hasard faisait sauter l'indice 1).
- `_fuite_solution()` : ligne de la solution ou extrait `…` non encore vu par l'élève → réponse guidée.
- `_code_en_trop()` : bloc de code qui réussit les tests de l'exercice, ou qui apporte ≥ 2 lignes nouvelles → réponse guidée (attrape la solution réécrite avec d'autres noms de variables).
- Exercice réussi : « c'est bon ? » → réponse écrite par le code ; vraie question → modèle avec le cours de la leçon en référence, et réponse écartée si elle invente un défaut.
- `app/erreurs.py` : diagnostic précis des fautes de syntaxe de débutant (`=>`, `:` manquant, `=` au lieu de `==`, guillemet/parenthèse non fermés, `print` sans parenthèses, `else if`) et des `NameError` (texte sans guillemets).

## Structure
- `app/serveur.py` : serveur HTTP + API + programme du jour
- `app/correcteur.py` + `app/runner.py` : exécution du code élève dans un sous-processus (timeout 5 s)
- `app/tuteur.py` : client Ollama, garde-fous, repli sans IA
- `app/progression.py` : SQLite local `data/progression.db`
- `content/*.json` : modules de cours (un fichier = un module)
- `web/` : interface HTML/CSS/JS sans dépendance (hors ligne)
- `outils/verifier_contenu.py` : à lancer après toute modif de contenu (chaque solution doit passer ses tests, le code de départ non)
- `outils/tester_tuteur.py` : banc d'essai du tuteur contre le vrai modèle (12 situations d'élève × 3 essais, `--modele X` pour comparer), à relancer après toute modif de prompt ou de modèle ; détail dans `data/test_tuteur_*.json`. Les contrôles automatiques sont grossiers : relire les réponses.
- Attention : un serveur lancé par l'utilisateur occupe souvent le port 8765 ; ne pas faire de test de bout en bout dessus (ça écrit dans SA `data/progression.db`).

## Prochaines étapes envisagées
1. ~~Tester le tuteur avec le vrai modèle~~ (fait le 18/11/2026, voir ci-dessus). Idée suivante : faire remonter dans le contexte la valeur obtenue quand un test échoue (« mention(18) a renvoyé "Passable" »), ça aiderait beaucoup le modèle.
2. Écrire les modules suivants du parcours IA : NumPy, pandas, visualisation, scikit-learn, réseaux de neurones, LLM/RAG.
3. Plus tard : détection de fatigue optionnelle (webcam, locale), demande de certification (RNCP : nécessite des promotions réelles et le suivi de leur insertion professionnelle).
