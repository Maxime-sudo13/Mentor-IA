"""Lance runner.py dans un processus séparé, avec une limite de temps."""
import json
import os
import subprocess
import sys

from . import erreurs

RUNNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "runner.py")


def verifier(code, tests, timeout=5):
    entree = json.dumps({"code": code, "tests": tests})
    try:
        proc = subprocess.run(
            [sys.executable, "-I", RUNNER],
            input=entree,
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        res = {
            "sortie": "",
            "erreur": {"type": "Timeout", "message": f"Arrêté après {timeout} secondes.", "ligne": None},
            "tests": [{"desc": t["desc"], "ok": False, "detail": "Non testé : le programme ne s'est pas arrêté."} for t in tests],
        }
    else:
        try:
            res = json.loads(proc.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError):
            res = {
                "sortie": proc.stdout[-2000:],
                "erreur": {"type": "RuntimeError", "message": (proc.stderr or "Erreur inconnue")[-500:], "ligne": None},
                "tests": [{"desc": t["desc"], "ok": False, "detail": "Non testé."} for t in tests],
            }

    res["reussi"] = bool(tests) and res.get("erreur") is None and all(t["ok"] for t in res["tests"])
    if not res.get("erreur") and res.get("erreur_test"):
        res["erreur"] = res["erreur_test"]
    res.pop("erreur_test", None)
    if res.get("erreur"):
        e = res["erreur"]
        res["explication"] = erreurs.expliquer(e["type"], code, e.get("ligne"), e.get("message", ""))
    res["nb_ok"] = sum(1 for t in res["tests"] if t["ok"])
    res["nb_tests"] = len(res["tests"])
    return res
