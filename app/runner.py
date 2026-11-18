"""Exécute le code de l'élève puis les tests, dans un processus séparé.

Lancé par correcteur.py avec : python -I runner.py  (données JSON sur stdin)
Renvoie un JSON sur stdout : {"sortie", "erreur", "tests": [{"desc", "ok", "detail"}]}
"""
import builtins
import contextlib
import io
import json
import sys
import traceback


def _input_interdit(*_a, **_k):
    raise RuntimeError("input() n'est pas utilisé dans les exercices : mets directement les valeurs dans le code.")


def _erreur_lisible(exc, nom_fichier="<ton code>"):
    """Type, message et numéro de ligne dans le code de l'élève."""
    ligne = None
    if isinstance(exc, SyntaxError):
        ligne = exc.lineno
    else:
        for frame in traceback.extract_tb(exc.__traceback__):
            if frame.filename == nom_fichier:
                ligne = frame.lineno
    return {"type": type(exc).__name__, "message": str(exc), "ligne": ligne}


def main():
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    code = data["code"]
    tests = data.get("tests", [])

    builtins.input = _input_interdit
    espace = {"__name__": "__main__"}
    tampon = io.StringIO()
    resultat = {"sortie": "", "erreur": None, "tests": []}

    try:
        compile_ = compile(code, "<ton code>", "exec")
        with contextlib.redirect_stdout(tampon):
            exec(compile_, espace)
    except BaseException as exc:  # SystemExit inclus : on veut tout attraper
        resultat["erreur"] = _erreur_lisible(exc)

    resultat["sortie"] = tampon.getvalue()[:5000]

    for t in tests:
        if resultat["erreur"]:
            resultat["tests"].append({"desc": t["desc"], "ok": False, "detail": "Non testé : ton code contient une erreur."})
            continue
        env = dict(espace)
        env["sortie"] = resultat["sortie"]
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                exec(compile(t["code"], "<test>", "exec"), env)
            resultat["tests"].append({"desc": t["desc"], "ok": True, "detail": ""})
        except AssertionError:
            resultat["tests"].append({"desc": t["desc"], "ok": False, "detail": "Résultat différent de celui attendu."})
        except BaseException as exc:
            err = _erreur_lisible(exc)
            resultat["tests"].append({"desc": t["desc"], "ok": False, "detail": f"{err['type']} : {err['message']}"})
            # Erreur levée dans une fonction de l'élève pendant un test : on la remonte
            if err["ligne"] is not None and resultat.get("erreur_test") is None:
                err["pendant_test"] = t["desc"]
                resultat["erreur_test"] = err

    sys.stdout = sys.__stdout__
    # ASCII pur : évite tout souci d'encodage de la console Windows
    print(json.dumps(resultat))


if __name__ == "__main__":
    main()
