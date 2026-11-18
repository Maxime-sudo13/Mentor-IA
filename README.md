# Mentor IA — prototype

Plateforme d'apprentissage du Python avec un tuteur IA **100 % local et gratuit** : tout tourne sur l'ordinateur de l'élève, sans abonnement, sans API payante, sans envoi de données.

## Installation (élève)

1. Installer **Python 3.9+** : https://www.python.org/downloads/ (sous Windows, cocher « Add Python to PATH »).
2. *(Optionnel mais conseillé)* installer **Ollama** : https://ollama.com/download
3. Double-cliquer sur `installer_windows.bat` (ou lancer `./installer_mac_linux.sh`). Le script télécharge le modèle d'IA (~2 Go, une seule fois).
4. Lancer `lancer_windows.bat` (ou `./lancer_mac_linux.sh`). Le navigateur s'ouvre sur http://127.0.0.1:8765

Aucune bibliothèque Python à installer : tout est écrit avec la bibliothèque standard.
**Matériel conseillé pour l'IA :** 8 Go de RAM minimum, 16 Go pour être à l'aise. Sans Ollama, l'application fonctionne quand même : le tuteur répond alors avec les explications et indices écrits à l'avance.

## Le parcours

| Module | Leçons | Contenu |
|---|---|---|
| 🐍 Bases de Python | 10 | variables, types, conditions, boucles, listes, fonctions, dictionnaires, texte, mini-projet |
| 🧰 Python intermédiaire | 8 | tuples, matrices, compréhensions, tri et lambda, exceptions, bibliothèque standard, classes, mini-projet |
| 🧠 L'IA à la main | 9 | vecteurs, distance, normalisation, k plus proches voisins, mesure d'erreur, régression linéaire, neurone, descente de gradient, entraîner un modèle |
| 📊 Travailler avec des données | 8 | fichiers, CSV, JSON, nettoyage, regroupement, écart-type et score z, séparation entraînement / test, mini-projet rapport |
| 🤖 L'IA à la main 2 | 9 | similarité cosinus, sac de mots, mini modèle de langage (bigrammes), perceptron, régression logistique, k-means, arbre de décision (Gini), réseau à 2 couches (XOR), détecteur de sentiments |

Soit **44 leçons**. Tous les exercices tournent avec Python seul (aucune bibliothèque à installer) : on comprend ce que font NumPy et PyTorch avant de s'en servir.

## Ce que fait la plateforme

L'interface s'inspire des applis d'apprentissage ludiques (type Duolingo) : **une seule chose à l'écran à la fois**.

- **Chemin de leçons** : chaque leçon est un rond sur un chemin ; la suivante se débloque quand la précédente est réussie.
- **Leçon en petites étapes** : intro → notions courtes (une par écran) → quiz avec retour immédiat (vert / rouge) → défi de code. Une question ratée revient plus loin dans la leçon.
- **XP, objectif du jour, série** : 25 à 29 XP par leçon réussie, 5 XP par notion révisée ; objectif réglable (10 / 20 / 30 / 50 XP par jour) ; la série compte les jours consécutifs de travail.
- **Révisions** : quiz + « remets le code dans l'ordre » (les lignes de la solution d'une leçon déjà réussie, mélangées).
- **Écrans de fin** : XP gagnés, précision, temps, puis célébration de la série et de l'objectif du jour.
- **Mobile** : barre de navigation en bas (Apprendre / Réviser / Progrès). Sons générés par le navigateur, désactivables.

Sous le capot :

| Fonction | Comment c'est fait |
|---|---|
| Correction des exercices | De **vrais tests** exécutés sur le code de l'élève (jamais l'IA) |
| Explication des erreurs | Explications rédigées à l'avance pour chaque type d'erreur Python |
| Indices | 3 niveaux par exercice, du plus vague au plus précis |
| Solution | Débloquée seulement après 5 échecs d'affilée |
| Tuteur | Petit modèle local qui **reformule** l'indice adapté à la situation |
| Programme du jour | Calculé par le code : révisions dues, leçon suivante, difficultés de la semaine |
| Révisions espacées | Système de Leitner : 1, 2, 4, 8 puis 16 jours |
| Suivi quotidien | Minutes actives, série de jours, historique sur 14 jours, erreurs fréquentes |
| Détection de blocage / fatigue | Signaux de comportement, **sans caméra** : temps sans tester, échecs successifs, durée de session, retour après absence |

## Pourquoi cette architecture (« le modèle gratuit sera bête »)

Un petit modèle de 3 milliards de paramètres se trompe souvent et peut donner la solution. Donc :

1. **Tout ce qui doit être juste est fait par le code** : correction, choix de l'indice, explication d'erreur, planning.
2. Le modèle reçoit un contexte déjà mâché (consigne, code, erreur, explication, *piste à reformuler*) et des règles strictes (4 phrases, pas de solution).
3. Sa réponse est **filtrée** : si elle recopie la solution, elle est remplacée par la réponse guidée.
4. Si le modèle plante ou n'est pas installé, le **tuteur à règles** prend le relais.

Résultat : la qualité pédagogique repose sur le **contenu** (leçons, tests, indices), que tu contrôles entièrement.

## Organisation des fichiers

```
lancer.py                 point d'entrée
config.json               modèle d'IA, port, délais
app/serveur.py            serveur local + API + logique du programme du jour
app/correcteur.py         lance les tests dans un processus séparé (limite 5 s)
app/runner.py             exécute le code de l'élève puis les tests
app/tuteur.py             client Ollama, garde-fous, repli sans IA
app/progression.py        base SQLite locale (data/progression.db)
app/erreurs.py            explications des erreurs Python
content/python_bases.json le module (10 leçons)
web/                      interface (HTML/CSS/JS sans dépendance, fonctionne hors ligne)
outils/verifier_contenu.py vérifie que chaque solution passe ses tests
outils/tester_tuteur.py    teste le tuteur IA sur des situations d'élève réalistes
```

## Ajouter du contenu

Chaque leçon du fichier JSON contient : `explication` (Markdown simple), `exercice` (`consigne`, `code_depart`, `tests`, `indices`, `solution`) et `quiz` (questions de révision).

Un test est du code Python qui doit passer sans erreur, par exemple `"assert moyenne([10, 12]) == 11"`. La variable `sortie` contient ce que le programme de l'élève a affiché.

Pour créer un nouveau module, ajoute un fichier `.json` dans `content/` : il apparaîtra automatiquement. Après chaque modification, lance :

```
python outils/verifier_contenu.py
```

## Changer de modèle

Modifie `"modele"` dans `config.json` (n'importe quel modèle disponible dans Ollama), puis `ollama pull <nom-du-modèle>`. Un modèle plus gros sera plus pertinent mais plus lent et plus gourmand en mémoire.

Pour comparer les modèles (ou vérifier un changement de prompt), lance :

```
python outils/tester_tuteur.py
python outils/tester_tuteur.py --modele qwen2.5:7b
```

Résultat des essais (novembre 2026) : **`qwen3.5:4b` est le meilleur tuteur** parmi ceux testés. Un plus gros modèle n'est pas forcément meilleur, et les modèles spécialisés en code (« coder ») sont même moins bons ici : entraînés à écrire du code, ils ont tendance à donner la solution au lieu de guider. Les garde-fous de l'application bloquent ces réponses, mais l'élève reçoit alors la réponse guidée écrite à l'avance plutôt qu'une aide personnalisée.

## Limites connues du prototype

- Le code de l'élève est exécuté sur sa propre machine, sans bac à sable : normal pour une application locale, mais à revoir si un jour les exercices tournent sur un serveur.
- L'éditeur de code est volontairement simple (indentation automatique, Tab, Ctrl+Entrée), sans coloration syntaxique.
- Un seul module pour l'instant ; le parcours complet « développeur IA » reste à écrire (NumPy, pandas, scikit-learn, réseaux de neurones, LLM…).
- La détection de fatigue par webcam n'est pas incluse (prévue plus tard, en option, avec analyse uniquement sur l'ordinateur).
