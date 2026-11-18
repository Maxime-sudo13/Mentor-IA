"""Suivi de l'élève : tout est stocké en local dans data/progression.db (SQLite)."""
import datetime as dt
import sqlite3
import threading

# Révisions espacées (système de Leitner) : boîte -> jours avant la prochaine révision
INTERVALLES = {1: 1, 2: 2, 3: 4, 4: 8, 5: 16}

SCHEMA = """
CREATE TABLE IF NOT EXISTS profil (cle TEXT PRIMARY KEY, valeur TEXT);
CREATE TABLE IF NOT EXISTS lecons (
    lecon_id TEXT PRIMARY KEY,
    reussie_le TEXT,
    indices_vus INTEGER DEFAULT 0,
    solution_vue INTEGER DEFAULT 0,
    brouillon TEXT
);
CREATE TABLE IF NOT EXISTS tentatives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lecon_id TEXT, ts TEXT, reussi INTEGER, nb_ok INTEGER, nb_tests INTEGER, erreur_type TEXT
);
CREATE TABLE IF NOT EXISTS revisions (lecon_id TEXT PRIMARY KEY, boite INTEGER, prochaine TEXT);
CREATE TABLE IF NOT EXISTS quiz (id INTEGER PRIMARY KEY AUTOINCREMENT, lecon_id TEXT, ts TEXT, correct INTEGER);
CREATE TABLE IF NOT EXISTS activite (jour TEXT PRIMARY KEY, minutes INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, lecon_id TEXT, ts TEXT, role TEXT, texte TEXT);
"""


def aujourdhui():
    return dt.date.today()


def maintenant():
    return dt.datetime.now().isoformat(timespec="seconds")


class Progression:
    def __init__(self, chemin):
        self.db = sqlite3.connect(chemin, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.verrou = threading.Lock()
        with self.verrou:
            self.db.executescript(SCHEMA)
            self.db.commit()

    # ---------------------------------------------------------- utilitaires
    def _q(self, sql, params=(), un=False):
        with self.verrou:
            cur = self.db.execute(sql, params)
            rows = cur.fetchall()
            self.db.commit()
        if un:
            return dict(rows[0]) if rows else None
        return [dict(r) for r in rows]

    def _lecon(self, lecon_id):
        self._q("INSERT OR IGNORE INTO lecons (lecon_id) VALUES (?)", (lecon_id,))
        return self._q("SELECT * FROM lecons WHERE lecon_id = ?", (lecon_id,), un=True)

    # ---------------------------------------------------------- profil
    def profil(self):
        p = {r["cle"]: r["valeur"] for r in self._q("SELECT * FROM profil")}
        p.setdefault("prenom", "")
        p["objectif_minutes"] = int(p.get("objectif_minutes", 45))
        return p

    def maj_profil(self, **valeurs):
        for k, v in valeurs.items():
            self._q("INSERT OR REPLACE INTO profil VALUES (?, ?)", (k, str(v)))

    # ---------------------------------------------------------- leçons
    def etat_lecon(self, lecon_id):
        l = self._lecon(lecon_id)
        stats = self._q(
            "SELECT COUNT(*) AS n, SUM(reussi) AS ok FROM tentatives WHERE lecon_id = ?", (lecon_id,), un=True
        )
        echecs_recents = self.echecs_depuis_dernier_succes(lecon_id)
        return {
            "reussie": l["reussie_le"] is not None,
            "reussie_le": l["reussie_le"],
            "indices_vus": l["indices_vus"],
            "solution_vue": bool(l["solution_vue"]),
            "brouillon": l["brouillon"],
            "tentatives": stats["n"] or 0,
            "echecs_recents": echecs_recents,
        }

    def echecs_depuis_dernier_succes(self, lecon_id):
        rows = self._q("SELECT reussi FROM tentatives WHERE lecon_id = ? ORDER BY id DESC LIMIT 50", (lecon_id,))
        n = 0
        for r in rows:
            if r["reussi"]:
                break
            n += 1
        return n

    def sauver_brouillon(self, lecon_id, code):
        self._lecon(lecon_id)
        self._q("UPDATE lecons SET brouillon = ? WHERE lecon_id = ?", (code, lecon_id))

    def enregistrer_tentative(self, lecon_id, res):
        self._lecon(lecon_id)
        err = res["erreur"]["type"] if res.get("erreur") else None
        self._q(
            "INSERT INTO tentatives (lecon_id, ts, reussi, nb_ok, nb_tests, erreur_type) VALUES (?, ?, ?, ?, ?, ?)",
            (lecon_id, maintenant(), int(res["reussi"]), res["nb_ok"], res["nb_tests"], err),
        )
        premiere_reussite = False
        if res["reussi"]:
            l = self._lecon(lecon_id)
            if l["reussie_le"] is None:
                premiere_reussite = True
                self._q("UPDATE lecons SET reussie_le = ? WHERE lecon_id = ?", (maintenant(), lecon_id))
                # Première révision demain (ou aujourd'hui+1 même si la solution a été vue)
                self._q(
                    "INSERT OR REPLACE INTO revisions VALUES (?, 1, ?)",
                    (lecon_id, (aujourdhui() + dt.timedelta(days=1)).isoformat()),
                )
        return premiere_reussite

    def voir_indice(self, lecon_id, nb_indices):
        l = self._lecon(lecon_id)
        n = min(l["indices_vus"] + 1, nb_indices)
        self._q("UPDATE lecons SET indices_vus = ? WHERE lecon_id = ?", (n, lecon_id))
        return n

    def voir_solution(self, lecon_id):
        self._lecon(lecon_id)
        self._q("UPDATE lecons SET solution_vue = 1 WHERE lecon_id = ?", (lecon_id,))

    # ---------------------------------------------------------- révisions
    def revisions_dues(self):
        return [
            r["lecon_id"]
            for r in self._q(
                "SELECT lecon_id FROM revisions WHERE prochaine <= ? ORDER BY prochaine", (aujourdhui().isoformat(),)
            )
        ]

    def enregistrer_revision(self, lecon_id, tout_juste):
        r = self._q("SELECT * FROM revisions WHERE lecon_id = ?", (lecon_id,), un=True)
        boite = (r["boite"] if r else 1)
        boite = min(boite + 1, 5) if tout_juste else 1
        prochaine = aujourdhui() + dt.timedelta(days=INTERVALLES[boite])
        self._q("INSERT OR REPLACE INTO revisions VALUES (?, ?, ?)", (lecon_id, boite, prochaine.isoformat()))
        self._q("INSERT INTO quiz (lecon_id, ts, correct) VALUES (?, ?, ?)", (lecon_id, maintenant(), int(tout_juste)))
        return {"boite": boite, "prochaine": prochaine.isoformat()}

    def maitrise(self):
        return {r["lecon_id"]: r["boite"] for r in self._q("SELECT lecon_id, boite FROM revisions")}

    # ---------------------------------------------------------- activité
    def minute_active(self):
        j = aujourdhui().isoformat()
        self._q("INSERT OR IGNORE INTO activite (jour, minutes) VALUES (?, 0)", (j,))
        self._q("UPDATE activite SET minutes = minutes + 1 WHERE jour = ?", (j,))

    def minutes_du_jour(self):
        r = self._q("SELECT minutes FROM activite WHERE jour = ?", (aujourdhui().isoformat(),), un=True)
        return r["minutes"] if r else 0

    def serie(self):
        """Nombre de jours consécutifs d'activité (aujourd'hui ou hier inclus)."""
        jours = {r["jour"] for r in self._q("SELECT jour FROM activite WHERE minutes > 0")}
        j = aujourdhui()
        if j.isoformat() not in jours:
            j -= dt.timedelta(days=1)
        n = 0
        while j.isoformat() in jours:
            n += 1
            j -= dt.timedelta(days=1)
        return n

    def jours_absence(self):
        r = self._q("SELECT MAX(jour) AS j FROM activite WHERE minutes > 0 AND jour < ?", (aujourdhui().isoformat(),), un=True)
        if not r or not r["j"]:
            return None
        return (aujourdhui() - dt.date.fromisoformat(r["j"])).days

    def historique(self, jours=14):
        debut = aujourdhui() - dt.timedelta(days=jours - 1)
        par_jour = {r["jour"]: r["minutes"] for r in self._q("SELECT * FROM activite WHERE jour >= ?", (debut.isoformat(),))}
        tent = self._q(
            "SELECT substr(ts, 1, 10) AS jour, COUNT(*) AS n, SUM(reussi) AS ok FROM tentatives WHERE ts >= ? GROUP BY jour",
            (debut.isoformat(),),
        )
        tent = {r["jour"]: r for r in tent}
        out = []
        for i in range(jours):
            j = (debut + dt.timedelta(days=i)).isoformat()
            t = tent.get(j, {})
            out.append({"jour": j, "minutes": par_jour.get(j, 0), "tentatives": t.get("n", 0), "reussites": t.get("ok") or 0})
        return out

    def difficultes(self, limite=3):
        """Leçons avec beaucoup d'échecs sur les 7 derniers jours, et erreurs les plus fréquentes."""
        debut = (aujourdhui() - dt.timedelta(days=7)).isoformat()
        lecons = self._q(
            "SELECT lecon_id, COUNT(*) AS echecs FROM tentatives WHERE reussi = 0 AND ts >= ? "
            "GROUP BY lecon_id HAVING echecs >= 4 ORDER BY echecs DESC LIMIT ?",
            (debut, limite),
        )
        erreurs = self._q(
            "SELECT erreur_type, COUNT(*) AS n FROM tentatives WHERE erreur_type IS NOT NULL AND ts >= ? "
            "GROUP BY erreur_type ORDER BY n DESC LIMIT 3",
            (debut,),
        )
        return {"lecons": lecons, "erreurs": erreurs}

    # ---------------------------------------------------------- chat
    def ajouter_chat(self, lecon_id, role, texte):
        self._q("INSERT INTO chat (lecon_id, ts, role, texte) VALUES (?, ?, ?, ?)", (lecon_id, maintenant(), role, texte))

    def chat_recent(self, lecon_id, n=6):
        rows = self._q("SELECT role, texte FROM chat WHERE lecon_id = ? ORDER BY id DESC LIMIT ?", (lecon_id, n))
        return list(reversed(rows))
