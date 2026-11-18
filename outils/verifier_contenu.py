"""Vérifie chaque exercice : la solution passe tous les tests, le code de départ non.
Usage : python outils/verifier_contenu.py"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import correcteur

racine = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content")
ok = True
modules = sorted((json.load(open(os.path.join(racine, n), encoding="utf-8")) for n in os.listdir(racine) if n.endswith(".json")),
                 key=lambda m: m.get("ordre", 99))
ids = [l["id"] for m in modules for l in m["lecons"]]
doublons = {i for i in ids if ids.count(i) > 1}
if doublons:
    print("ÉCHEC identifiants de leçon en double :", ", ".join(sorted(doublons)))
    ok = False
for module in modules:
    for l in module["lecons"]:
        ex = l["exercice"]
        sol = correcteur.verifier(ex["solution"], ex["tests"])
        dep = correcteur.verifier(ex["code_depart"], ex["tests"])
        bon = sol["reussi"] and not dep["reussi"] and len(ex["indices"]) >= 1
        for q in l["quiz"]:
            bon = bon and 0 <= q["bonne"] < len(q["choix"])
        ok &= bon
        print(("OK   " if bon else "ÉCHEC"), l["id"], f"solution {sol['nb_ok']}/{sol['nb_tests']}", f"départ {dep['nb_ok']}/{dep['nb_tests']}",
              "" if sol["reussi"] else sol)
sys.exit(0 if ok else 1)
