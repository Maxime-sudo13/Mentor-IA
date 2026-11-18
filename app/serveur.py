"""Serveur local : sert l'interface web et l'API. Uniquement accessible depuis l'ordinateur de l'élève."""
import datetime as dt
import json
import mimetypes
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from . import correcteur
from .progression import Progression
from .tuteur import Tuteur

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(RACINE, "web")
CONFIG = json.load(open(os.path.join(RACINE, "config.json"), encoding="utf-8"))

os.makedirs(os.path.join(RACINE, "data"), exist_ok=True)
PROG = Progression(os.path.join(RACINE, "data", "progression.db"))
TUTEUR = Tuteur(CONFIG["ollama_url"], CONFIG["modele"], CONFIG.get("timeout_ia", 120))


def charger_modules():
    modules = []
    dossier = os.path.join(RACINE, "content")
    for nom in sorted(os.listdir(dossier)):
        if nom.endswith(".json"):
            modules.append(json.load(open(os.path.join(dossier, nom), encoding="utf-8")))
    return modules


MODULES = charger_modules()
LECONS = [l for m in MODULES for l in m["lecons"]]
PAR_ID = {l["id"]: l for l in LECONS}

SEUIL_SOLUTION = 5  # échecs consécutifs avant de pouvoir afficher la solution


# ------------------------------------------------------------------ logique
def lecon_debloquee(index):
    return index == 0 or PROG.etat_lecon(LECONS[index - 1]["id"])["reussie"]


def vue_parcours():
    maitrise = PROG.maitrise()
    out = []
    for m in MODULES:
        lecons = []
        for l in m["lecons"]:
            i = LECONS.index(l)
            e = PROG.etat_lecon(l["id"])
            lecons.append({
                "id": l["id"], "titre": l["titre"], "duree_min": l["duree_min"],
                "reussie": e["reussie"], "debloquee": lecon_debloquee(i),
                "maitrise": maitrise.get(l["id"], 0),
            })
        out.append({"id": m["id"], "titre": m["titre"], "description": m["description"], "lecons": lecons})
    return out


def plan_du_jour():
    profil = PROG.profil()
    revisions = PROG.revisions_dues()
    suivante = next((l for i, l in enumerate(LECONS) if not PROG.etat_lecon(l["id"])["reussie"]), None)
    minutes = PROG.minutes_du_jour()
    serie = PROG.serie()
    absence = PROG.jours_absence()
    diff = PROG.difficultes()
    nb_reussies = sum(1 for l in LECONS if PROG.etat_lecon(l["id"])["reussie"])

    taches = []
    if revisions:
        taches.append({"type": "revision", "titre": f"Révisions ({len(revisions)} notion{'s' if len(revisions) > 1 else ''})",
                       "detail": "Quelques questions rapides pour ancrer ce que tu as appris.", "duree_min": 3 * len(revisions)})
    for d in diff["lecons"]:
        if d["lecon_id"] in PAR_ID and d["lecon_id"] != (suivante or {}).get("id"):
            taches.append({"type": "consolider", "lecon_id": d["lecon_id"], "titre": f"Consolider : {PAR_ID[d['lecon_id']]['titre']}",
                           "detail": f"{d['echecs']} essais ratés cette semaine : relis la leçon à tête reposée.", "duree_min": 10})
    if suivante:
        e = PROG.etat_lecon(suivante["id"])
        taches.append({"type": "lecon", "lecon_id": suivante["id"],
                       "titre": ("Continuer : " if e["tentatives"] else "Nouvelle leçon : ") + suivante["titre"],
                       "detail": " · ".join(suivante["objectifs"]), "duree_min": suivante["duree_min"]})

    # Faits vérifiés par le code, transmis tels quels à l'IA pour le message d'accueil
    phrases = []
    if profil["prenom"]:
        phrases.append(f"L'élève s'appelle {profil['prenom']}.")
    if absence and absence >= 2:
        phrases.append(f"L'élève revient après {absence} jours sans travailler.")
    if serie >= 2:
        phrases.append(f"L'élève a travaillé {serie} jours de suite.")
    phrases.append(f"Leçons réussies : {nb_reussies} sur {len(LECONS)}.")
    if revisions:
        phrases.append(f"{len(revisions)} révision(s) à faire aujourd'hui.")
    if suivante:
        phrases.append(f"Prochaine leçon : {suivante['titre']}.")
    if diff["lecons"]:
        phrases.append(f"Difficulté récente sur : {PAR_ID[diff['lecons'][0]['lecon_id']]['titre']}.")
    faits = {"prenom": profil["prenom"], "serie": serie, "absence": absence, "phrases": phrases}

    # Le message est généré une fois par jour, puis gardé en mémoire
    cle = dt.date.today().isoformat()
    if profil.get("message_jour_date") != cle:
        msg = TUTEUR.message_du_jour(faits)
        PROG.maj_profil(message_jour_date=cle, message_jour=msg)
    else:
        msg = profil.get("message_jour", "")

    return {
        "message": msg,
        "taches": taches,
        "minutes": minutes,
        "objectif_minutes": profil["objectif_minutes"],
        "serie": serie,
        "nb_reussies": nb_reussies,
        "nb_lecons": len(LECONS),
        "erreurs_frequentes": diff["erreurs"],
    }


def vue_lecon(lecon_id):
    l = PAR_ID[lecon_id]
    e = PROG.etat_lecon(lecon_id)
    ex = l["exercice"]
    peut_solution = e["reussie"] or e["solution_vue"] or e["echecs_recents"] >= SEUIL_SOLUTION
    return {
        "id": l["id"], "titre": l["titre"], "objectifs": l["objectifs"], "duree_min": l["duree_min"],
        "explication": l["explication"],
        "exercice": {
            "consigne": ex["consigne"], "code_depart": ex["code_depart"],
            "tests": [t["desc"] for t in ex["tests"]],
            "nb_indices": len(ex["indices"]),
            "indices": ex["indices"][: e["indices_vus"]],
            "solution": ex["solution"] if (e["solution_vue"] or e["reussie"]) else None,
            "solution_disponible": peut_solution,
            "echecs_avant_solution": max(0, SEUIL_SOLUTION - e["echecs_recents"]),
        },
        "etat": e,
        "index": LECONS.index(l),
        "suivante": LECONS[LECONS.index(l) + 1]["id"] if LECONS.index(l) + 1 < len(LECONS) else None,
        "chat": PROG.chat_recent(lecon_id, 10),
    }


def coaching(lecon_id, res):
    """Signal de comportement après une tentative (calculé, pas deviné)."""
    e = PROG.etat_lecon(lecon_id)
    n = e["echecs_recents"]
    if res["reussi"]:
        return None
    if n >= SEUIL_SOLUTION:
        return {"niveau": "fort", "texte": "Tu as fait plusieurs essais sans succès. Fais une pause de 5 minutes, puis demande au tuteur ou regarde la solution commentée : ce n'est pas tricher, c'est apprendre."}
    if n >= 3 and e["indices_vus"] < len(PAR_ID[lecon_id]["exercice"]["indices"]):
        return {"niveau": "moyen", "texte": "Trois essais sans succès : un indice va sûrement te débloquer."}
    return None


# ------------------------------------------------------------------ HTTP
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, data, code=200):
        corps = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _corps(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def do_GET(self):
        chemin = urlparse(self.path).path
        if chemin == "/api/accueil":
            return self._json({"profil": PROG.profil(), "plan": plan_du_jour(), "parcours": vue_parcours(),
                               "ia": TUTEUR.disponible(), "modele": TUTEUR.modele})
        if chemin.startswith("/api/lecon/"):
            lid = chemin.rsplit("/", 1)[-1]
            if lid not in PAR_ID:
                return self._json({"erreur": "Leçon inconnue"}, 404)
            if not lecon_debloquee(LECONS.index(PAR_ID[lid])):
                return self._json({"erreur": "Termine d'abord la leçon précédente."}, 403)
            return self._json(vue_lecon(lid))
        if chemin == "/api/revisions":
            questions = []
            for lid in PROG.revisions_dues():
                for i, q in enumerate(PAR_ID[lid]["quiz"]):
                    questions.append({"lecon_id": lid, "lecon": PAR_ID[lid]["titre"], **q})
            return self._json({"questions": questions})
        if chemin == "/api/journal":
            return self._json({"historique": PROG.historique(14), "difficultes": PROG.difficultes()})
        return self._statique(chemin)

    def _statique(self, chemin):
        if chemin == "/":
            chemin = "/index.html"
        fichier = os.path.normpath(os.path.join(WEB, chemin.lstrip("/")))
        if not fichier.startswith(WEB) or not os.path.isfile(fichier):
            self.send_error(404)
            return
        with open(fichier, "rb") as f:
            corps = f.read()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(fichier)[0] or "text/plain") + "; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(corps)

    def do_POST(self):
        chemin = urlparse(self.path).path
        d = self._corps()
        lid = d.get("lecon_id")
        if lid is not None and lid not in PAR_ID:
            return self._json({"erreur": "Leçon inconnue"}, 404)

        if chemin == "/api/verifier":
            l = PAR_ID[lid]
            res = correcteur.verifier(d.get("code", ""), l["exercice"]["tests"], CONFIG.get("timeout_execution", 5))
            PROG.sauver_brouillon(lid, d.get("code", ""))
            res["premiere_reussite"] = PROG.enregistrer_tentative(lid, res)
            res["coaching"] = coaching(lid, res)
            res["etat"] = PROG.etat_lecon(lid)
            return self._json(res)

        if chemin == "/api/brouillon":
            PROG.sauver_brouillon(lid, d.get("code", ""))
            return self._json({"ok": True})

        if chemin == "/api/indice":
            ind = PAR_ID[lid]["exercice"]["indices"]
            n = PROG.voir_indice(lid, len(ind))
            return self._json({"indices": ind[:n], "restants": len(ind) - n})

        if chemin == "/api/solution":
            e = PROG.etat_lecon(lid)
            if not (e["reussie"] or e["solution_vue"] or e["echecs_recents"] >= SEUIL_SOLUTION):
                return self._json({"erreur": "Encore quelques essais avant la solution."}, 403)
            PROG.voir_solution(lid)
            return self._json({"solution": PAR_ID[lid]["exercice"]["solution"]})

        if chemin == "/api/tuteur":
            l = PAR_ID[lid]
            question = (d.get("question") or "").strip()[:800] or "Je suis bloqué, tu peux m'aider ?"
            code = d.get("code", "")
            resultat = None
            if code.strip():
                resultat = correcteur.verifier(code, l["exercice"]["tests"], CONFIG.get("timeout_execution", 5))
            historique = PROG.chat_recent(lid, 4)
            rep = TUTEUR.repondre(l, PROG.etat_lecon(lid), code, resultat, question, historique)
            PROG.ajouter_chat(lid, "eleve", question)
            PROG.ajouter_chat(lid, "tuteur", rep["texte"])
            return self._json(rep)

        if chemin == "/api/autrement":
            texte = TUTEUR.expliquer_autrement(PAR_ID[lid])
            if texte is None:
                return self._json({"texte": None, "info": "L'IA locale n'est pas active : relis l'exemple de code et les points « À retenir »."})
            return self._json({"texte": texte})

        if chemin == "/api/revision":
            return self._json(PROG.enregistrer_revision(lid, bool(d.get("tout_juste"))))

        if chemin == "/api/activite":
            PROG.minute_active()
            return self._json({"minutes": PROG.minutes_du_jour()})

        if chemin == "/api/profil":
            champs = {}
            if "prenom" in d:
                champs["prenom"] = str(d["prenom"])[:40]
            if "objectif_minutes" in d:
                champs["objectif_minutes"] = max(10, min(240, int(d["objectif_minutes"])))
            PROG.maj_profil(**champs, message_jour_date="")
            return self._json({"profil": PROG.profil()})

        return self._json({"erreur": "Route inconnue"}, 404)


def lancer(ouvrir=True):
    port = CONFIG.get("port", 8765)
    serveur = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}"
    print(f"Mentor IA est lancé : {url}")
    print("IA locale :", "active (" + TUTEUR.modele + ")" if TUTEUR.disponible() else "non détectée — mode sans IA")
    print("Pour arrêter : Ctrl + C")
    if ouvrir:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nÀ demain !")
