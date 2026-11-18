"""Tuteur IA local (Ollama), conçu pour un PETIT modèle gratuit.

Principe : le modèle ne décide de rien d'important.
- Ce qui doit être juste (correction, indices, explications d'erreurs) est
  calculé par le code ou écrit à l'avance.
- Le modèle reçoit ces éléments tout prêts et n'a qu'à les reformuler
  pour répondre à la question de l'élève, en quelques phrases.
- Sa réponse est filtrée : si elle recopie la solution, on la remplace.
- Si Ollama n'est pas installé ou ne répond pas, un tuteur « à règles »
  prend le relais : l'application reste utilisable sans IA.
"""
import json
import re
import time
import urllib.error
import urllib.request

from . import correcteur

SYSTEME = """Tu es un tuteur de programmation Python bienveillant pour un débutant francophone.
Règles strictes :
1. Réponds en français, en tutoyant, en 4 phrases maximum.
2. Ne donne JAMAIS la solution complète de l'exercice ni le code entier.
3. Appuie-toi sur la PISTE fournie : c'est la bonne direction, reformule-la sans aller plus loin.
4. Si une ERREUR est fournie, explique uniquement celle-là, avec les mots de l'EXPLICATION. N'invente aucune autre cause.
5. Si l'élève demande la solution, dis gentiment que tu vas l'aider à la trouver lui-même, puis donne la piste.
6. Si tous les tests passent, félicite l'élève et ne cherche pas d'erreur.
7. Termine par une petite question ou une action concrète à essayer.
8. N'invente rien sur l'exercice : utilise uniquement les informations fournies."""


class Tuteur:
    def __init__(self, url="http://127.0.0.1:11434", modele="auto", timeout=120):
        self.url = url.rstrip("/")
        self.modele = modele
        self.timeout = timeout
        self._dispo = None
        self._dispo_ts = 0
        self._think_ok = None  # l'option "think": false est-elle acceptée par Ollama / le modèle ?

    # ------------------------------------------------------------ Ollama
    def disponible(self):
        """Vérifie (avec cache de 30 s) qu'Ollama tourne et que le modèle est installé."""
        if time.time() - self._dispo_ts < 30 and self._dispo is not None:
            return self._dispo
        try:
            with urllib.request.urlopen(self.url + "/api/tags", timeout=1.5) as r:
                modeles = [m.get("name", "") for m in json.load(r).get("models", [])]
            self._dispo = self._choisir_modele(modeles)
        except (urllib.error.URLError, OSError, ValueError):
            self._dispo = False
        self._dispo_ts = time.time()
        return self._dispo

    def _choisir_modele(self, modeles):
        """Utilise le modèle de config.json s'il est installé, sinon le plus adapté parmi ceux présents."""
        if not modeles:
            return False
        voulu = self.modele
        if voulu != "auto":
            if voulu in modeles or voulu + ":latest" in modeles:
                return True
            base = voulu.split(":")[0]
            proches = [m for m in modeles if m.split(":")[0] == base]
            if proches:
                self.modele = proches[0]
                return True
        # Choix automatique : on écarte les modèles d'embedding, on préfère Qwen
        texte = [m for m in modeles if "embed" not in m.lower()]
        if not texte:
            return False
        qwen = [m for m in texte if m.lower().startswith("qwen")]
        self.modele = sorted(qwen or texte, reverse=True)[0]
        return True

    def _generer(self, messages, max_tokens=220):
        base = {
            "model": self.modele,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": max_tokens, "num_ctx": 4096},
        }
        # Les modèles « qui réfléchissent » (Qwen 3.x…) sont beaucoup plus rapides sans réflexion.
        # Si la version d'Ollama ou le modèle refuse l'option, on réessaie sans.
        # On retient le refus pour ne pas payer une requête de plus à chaque question.
        if self._think_ok is not False:
            try:
                texte = self._appel({**base, "think": False})
                self._think_ok = True
            except urllib.error.HTTPError:
                self._think_ok = False
                texte = self._appel(base)
        else:
            texte = self._appel(base)
        # Si le modèle réfléchit quand même à voix haute, on retire ce passage.
        texte = re.sub(r"<think>.*?</think>", "", texte, flags=re.S)
        texte = re.sub(r"^.*?</think>", "", texte, flags=re.S).strip()
        return texte

    def _appel(self, corps):
        req = urllib.request.Request(self.url + "/api/chat", data=json.dumps(corps).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)["message"]["content"]

    # ------------------------------------------------------------ garde-fous
    @staticmethod
    def _compact(texte):
        return re.sub(r"\s+", "", texte)

    @classmethod
    def _fuite_solution(cls, reponse, solution, deja_vu=""):
        """Vrai si la réponse dévoile un morceau de la solution que l'élève n'a pas encore vu.

        deja_vu : code de départ + code de l'élève + indices déjà affichés + piste du moment.
        On compare sans les espaces, et sans le « return » de début de ligne.
        Deux contrôles : une ligne de la solution recopiée, ou un extrait de code
        (entre `…`) qui fait partie de la solution.
        """
        rep, vu, sol = cls._compact(reponse), cls._compact(deja_vu), cls._compact(solution)
        for l in solution.splitlines():
            l = l.strip()
            if l.startswith("def ") or l.startswith("#"):
                continue
            coeur = cls._compact(re.sub(r"^return\s+", "", l))
            if len(coeur) >= 8 and coeur in rep and coeur not in vu:
                return True
        for extrait in re.findall(r"`([^`\n]+)`", reponse):
            e = cls._compact(extrait)
            if len(e) >= 12 and e in sol and e not in vu:
                return True
        return False

    @classmethod
    def _code_en_trop(cls, reponse, deja_vu, tests):
        """Vrai si la réponse contient un bloc de code qui en dit trop, même réécrit autrement.

        Les petits modèles (surtout les « coder ») recopient la solution avec d'autres noms
        de variables : la comparaison ligne à ligne ne le voit pas. Donc :
        1. un bloc qui contient une fonction est exécuté contre les tests de l'exercice :
           s'il les réussit, c'est la solution ;
        2. un bloc qui apporte 2 lignes de code nouvelles ou plus est refusé : un tuteur
           donne une piste, pas le code (corriger UNE ligne de l'élève reste permis).
        """
        vu = cls._compact(deja_vu)
        for bloc in re.findall(r"```[a-zA-Z]*\n?(.*?)```", reponse, flags=re.S):
            if "def " in bloc and tests and correcteur.verifier(bloc, tests, timeout=3)["reussi"]:
                return True
            nouvelles = [l for l in bloc.splitlines()
                         if l.strip() and not l.strip().startswith("#") and cls._compact(l) not in vu]
            if len(nouvelles) >= 2:
                return True
        return False

    # ------------------------------------------------------------ contexte
    @staticmethod
    def piste(lecon, etat, resultat):
        """Choisit l'indice adapté : le prochain non vu, ou le dernier s'ils ont tous été vus.

        On ne saute PAS d'indice quand certains tests passent : le code de départ
        en réussit souvent un par hasard (ex. liste vide), et l'indice 2 donné trop tôt
        se trompait de sujet ou rapprochait trop de la solution."""
        indices = lecon["exercice"]["indices"]
        return indices[min(etat["indices_vus"], len(indices) - 1)]

    @staticmethod
    def _resume_resultat(resultat):
        if not resultat:
            return "L'élève n'a pas encore lancé les tests."
        if resultat.get("erreur"):
            e = resultat["erreur"]
            ligne = f" (ligne {e['ligne']})" if e.get("ligne") else ""
            return f"ERREUR : {e['type']}{ligne} : {e['message']}\nEXPLICATION : {resultat['explication']['quoi']} {resultat['explication']['comment']}"
        echecs = [t["desc"] for t in resultat["tests"] if not t["ok"]]
        if not echecs:
            return "Tous les tests passent : l'exercice est réussi."
        return "Tests qui échouent : " + " ; ".join(echecs[:3])

    # ------------------------------------------------------------ réponses
    # Questions du type « c'est bon ? » : quand tout est réussi, le code y répond seul.
    VERIFICATION = re.compile(
        r"^\s*(est-ce que\s+)?(c'?est|ça|ca|c)?\s*(bon|juste|correct|ok|fini|réussi|reussi|bien|valide|good|marche|fonctionne)\b"
        r"|^\s*j'?ai (bon|réussi|reussi|fini)\b|^\s*je suis bloqu", re.I)
    # Sur un exercice réussi, le petit modèle invente parfois un défaut : on le détecte.
    DEFAUT_INVENTE = re.compile(r"oubli|erreur|manqu|attention|corrig|problème|probleme|\.len\(", re.I)

    def repondre(self, lecon, etat, code, resultat, question, historique):
        piste = self.piste(lecon, etat, resultat)
        reussi = bool(resultat and resultat.get("reussi"))

        if reussi and (len(question.strip()) < 15 or self.VERIFICATION.search(question)):
            return {"texte": self._sans_ia(resultat, piste), "source": "regles"}
        if not self.disponible():
            return {"texte": self._sans_ia(resultat, piste), "source": "regles"}

        if reussi:
            # Exercice réussi + vraie question (« pourquoi elif ? ») : pas de piste, réponse courte.
            # Le cours de la leçon sert de référence : sans lui, le petit modèle invente des explications.
            contexte = (
                f"COURS DE RÉFÉRENCE (vrai, ne le contredis pas) :\n{lecon['explication'][:1500]}\n\n"
                f"EXERCICE : {lecon['exercice']['consigne']}\n\n"
                f"CODE DE L'ÉLÈVE :\n```python\n{code[-1500:]}\n```\n\n"
                "Tous les tests passent : l'exercice est réussi, le code est correct. "
                "Réponds à partir du COURS DE RÉFÉRENCE et du code de l'élève. "
                "Réponds seulement à la question, en 3 phrases maximum. Ne cherche pas de défaut et ne propose pas d'autre exercice."
            )
        else:
            contexte = (
                f"EXERCICE : {lecon['exercice']['consigne']}\n\n"
                f"CODE DE L'ÉLÈVE :\n```python\n{code[-1500:]}\n```\n\n"
                f"{self._resume_resultat(resultat)}\n\n"
                f"PISTE (à reformuler, sans donner plus) : {piste}"
            )

        messages = [{"role": "system", "content": SYSTEME}]
        for h in historique[-4:]:
            messages.append({"role": "user" if h["role"] == "eleve" else "assistant", "content": h["texte"]})
        messages.append({"role": "user", "content": f"{contexte}\n\nQUESTION DE L'ÉLÈVE : {question}"})
        try:
            texte = self._generer(messages)
        except Exception:
            return {"texte": self._sans_ia(resultat, piste), "source": "regles"}
        ex = lecon["exercice"]
        deja_vu = "\n".join([ex["code_depart"], code, piste, *ex["indices"][:etat["indices_vus"]]])
        if reussi and self.DEFAUT_INVENTE.search(texte or ""):
            return {"texte": self._sans_ia(resultat, piste), "source": "regles"}
        if (not texte or self._fuite_solution(texte, ex["solution"], deja_vu)
                or self._code_en_trop(texte, deja_vu, ex["tests"])):
            return {"texte": self._sans_ia(resultat, piste), "source": "regles"}
        return {"texte": texte[:1200], "source": "ia"}

    def expliquer_autrement(self, lecon):
        if not self.disponible():
            return None
        messages = [
            {"role": "system", "content": "Tu es un professeur patient. Réponds en français, en tutoyant, en 6 phrases maximum."},
            {"role": "user", "content": (
                f"Explique la notion « {lecon['titre']} » à un grand débutant avec une comparaison de la vie "
                f"quotidienne, puis un exemple de code Python de 3 lignes maximum.\n\n"
                f"Voici le cours de référence (ne le contredis pas) :\n{lecon['explication'][:2000]}"
            )},
        ]
        try:
            return self._generer(messages, max_tokens=350)
        except Exception:
            return None

    def message_du_jour(self, faits):
        """Faits calculés par le code -> 2 phrases d'encouragement. Repli : modèle de phrase fixe."""
        repli = self._message_regles(faits)
        if not self.disponible():
            return repli
        messages = [
            {"role": "system", "content": "Tu es un coach d'apprentissage chaleureux. Réponds en français, en tutoyant, en 2 phrases maximum, sans liste."},
            {"role": "user", "content": "Écris le message d'accueil du jour à partir de ces faits (n'en invente aucun) :\n" + "\n".join(f"- {f}" for f in faits["phrases"])},
        ]
        try:
            texte = self._generer(messages, max_tokens=120)
            return texte or repli
        except Exception:
            return repli

    # ------------------------------------------------------------ sans IA
    @staticmethod
    def _sans_ia(resultat, piste):
        morceaux = []
        if resultat and resultat.get("erreur"):
            e = resultat["erreur"]
            ligne = f" à la ligne {e['ligne']}" if e.get("ligne") else ""
            morceaux.append(f"Python signale une erreur {e['type']}{ligne}. {resultat['explication']['quoi']}")
            morceaux.append(resultat["explication"]["comment"])
        elif resultat:
            echecs = [t["desc"] for t in resultat["tests"] if not t["ok"]]
            if echecs:
                morceaux.append(f"Ton code tourne, mais ce test ne passe pas encore : « {echecs[0]} ».")
            else:
                morceaux.append("Oui, tous les tests passent : bravo, l'exercice est réussi !")
                morceaux.append("Tu peux passer à la leçon suivante. Avant, relis ton code et explique-toi à voix haute "
                                "ce que fait chaque ligne : c'est la meilleure façon de retenir.")
                return " ".join(morceaux)
        morceaux.append(f"Piste : {piste}")
        morceaux.append("Essaie, relance les tests, et dis-moi ce que tu obtiens.")
        return " ".join(morceaux)

    @staticmethod
    def _message_regles(faits):
        p = faits.get("prenom") or ""
        salut = f"Bonjour {p} !" if p else "Bonjour !"
        if faits.get("absence") and faits["absence"] >= 3:
            return f"{salut} Content de te revoir après {faits['absence']} jours. On reprend en douceur avec les révisions, puis on avance."
        if faits.get("serie", 0) >= 2:
            return f"{salut} Tu es sur une série de {faits['serie']} jours d'affilée, continue comme ça."
        return f"{salut} Voici ton programme du jour : un pas à la fois."
