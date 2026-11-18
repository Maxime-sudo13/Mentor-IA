"""Assemble une démo en ligne (un seul fichier HTML) à partir du dépôt mentor-ia.

Le vrai code Python de l'appli tourne dans le navigateur grâce à Pyodide :
les appels fetch("/api/...") de web/app.js sont redirigés vers app/serveur.py.
Usage : python outils/construire_demo.py . demo/index.html

La page charge Python depuis un dossier « pyodide/ » placé à côté d'elle (Pyodide 0.27.7 :
pyodide.js, pyodide.asm.js, pyodide.asm.wasm, pyodide-lock.json, python_stdlib.zip renommé
python_stdlib.data.wasm, et la roue sqlite3 renommée sqlite3.data.wasm). Les extensions .zip/.whl
sont renommées car l'hébergeur des pages Claude ne les sert pas. Le tuteur IA est désactivé dans
la démo (pas d'Ollama dans un navigateur) : il répond en mode guidé.
"""
import json, os, sys

repo, sortie = sys.argv[1], sys.argv[2]
PYODIDE = sys.argv[3] if len(sys.argv) > 3 else "pyodide/"

fichiers = {}
for dossier in ("app", "content"):
    for nom in sorted(os.listdir(os.path.join(repo, dossier))):
        if nom.endswith((".py", ".json")):
            fichiers[f"{dossier}/{nom}"] = open(os.path.join(repo, dossier, nom), encoding="utf-8").read()
fichiers["config.json"] = open(os.path.join(repo, "config.json"), encoding="utf-8").read()

css = open(os.path.join(repo, "web", "style.css"), encoding="utf-8").read()
appjs = open(os.path.join(repo, "web", "app.js"), encoding="utf-8").read()
index = open(os.path.join(repo, "web", "index.html"), encoding="utf-8").read()

AMORCE = r'''
import base64, io, json, os, runpy, subprocess, sys, time

os.chdir("/mentor")
sys.path.insert(0, "/mentor")
from app import correcteur

class _Proc:
    def __init__(self, stdout): self.stdout, self.stderr, self.returncode = stdout, "", 0

def _faux_run(args, input=None, timeout=5, **kw):
    """Remplace le sous-processus : exécute runner.py ici même, avec une limite de temps."""
    limite = time.time() + timeout
    depasse = [False]
    def trace(frame, event, arg):
        if time.time() > limite:
            depasse[0] = True
            raise TimeoutError("limite")
        return trace
    sauv = (sys.stdin, sys.stdout, sys.__stdout__)
    tampon = io.StringIO()
    sys.stdin = io.TextIOWrapper(io.BytesIO(input.encode("utf-8")), encoding="utf-8")
    sys.stdout = sys.__stdout__ = tampon
    sys.settrace(trace)
    try:
        runpy.run_path(correcteur.RUNNER, run_name="__main__")
    except BaseException:
        pass
    finally:
        sys.settrace(None)
        sys.stdin, sys.stdout, sys.__stdout__ = sauv
    if depasse[0]:
        raise subprocess.TimeoutExpired(args, timeout)
    return _Proc(tampon.getvalue())

correcteur.subprocess.run = _faux_run

from app import serveur
serveur.TUTEUR._dispo = False          # pas d'Ollama dans le navigateur
serveur.TUTEUR._dispo_ts = 1e18
serveur.TUTEUR.disponible = lambda: False

class _Sock:
    def __init__(self, brut): self.r, self.w = io.BytesIO(brut), io.BytesIO()
    def makefile(self, mode, *a, **k): return self.r if "r" in mode else self.w
    def sendall(self, b): self.w.write(b)

def requete(methode, chemin, corps):
    corps = (corps or "").encode("utf-8")
    brut = (f"{methode} {chemin} HTTP/1.1\r\nHost: demo\r\nContent-Type: application/json\r\n"
            f"Content-Length: {len(corps)}\r\n\r\n").encode() + corps
    s = _Sock(brut)
    serveur.Handler(s, ("127.0.0.1", 0), None)
    tete, _, contenu = s.w.getvalue().partition(b"\r\n\r\n")
    statut = int(tete.split(b" ")[1])
    db = None
    if methode == "POST":
        with open("/mentor/data/progression.db", "rb") as f:
            db = base64.b64encode(f.read()).decode()
    return json.dumps({"statut": statut, "corps": contenu.decode("utf-8"), "db": db})
'''

SHIM = r'''
(function () {
  const FICHIERS = __FICHIERS__;
  const CLE = "mentor-ia-demo-db";
  const vraiFetch = window.fetch.bind(window);
  const ecran = document.getElementById("chargement");
  const etape = t => { const p = ecran.querySelector("p"); if (p) p.textContent = t; };
  const echec = msg => {
    if (!ecran.isConnected) return;
    ecran.querySelector(".roue")?.remove();
    etape("Le chargement a échoué : " + msg);
  };
  addEventListener("error", e => echec(e.message || ("ressource introuvable : " + (e.target?.src || e.target?.href || "?"))), true);
  addEventListener("unhandledrejection", e => echec(String(e.reason)));
  setTimeout(() => { if (ecran.isConnected) etape(ecran.querySelector("p").textContent + " (toujours en cours après 60 s : connexion lente ou blocage du navigateur)"); }, 60000);
  const pret = (async () => {
    etape("Chargement de Python (environ 14 Mo la première fois)…");
    if (typeof loadPyodide !== "function") throw new Error("le fichier pyodide.js n'a pas pu être chargé");
    const base = new URL("__PYODIDE__", location.href).href;
    const pyodide = await loadPyodide({ indexURL: base, stdLibURL: base + "python_stdlib.data.wasm" });
    etape("Installation de la base de données…");
    // Le module sqlite3 est fourni à part (archive .whl renommée en .wasm pour l'hébergement)
    const roue = await (await vraiFetch(base + "sqlite3.data.wasm")).arrayBuffer();
    pyodide.unpackArchive(roue, "wheel", { extractDir: "/lib/python3.12/site-packages" });
    const fs = pyodide.FS;
    ["/mentor", "/mentor/app", "/mentor/content", "/mentor/data"].forEach(d => { try { fs.mkdir(d); } catch (e) {} });
    for (const [chemin, texte] of Object.entries(FICHIERS)) fs.writeFile("/mentor/" + chemin, texte);
    try {
      const sauve = localStorage.getItem(CLE);
      if (sauve) fs.writeFile("/mentor/data/progression.db", Uint8Array.from(atob(sauve), c => c.charCodeAt(0)));
    } catch (e) {}
    etape("Démarrage de Mentor IA…");
    pyodide.runPython(__AMORCE__);
    ecran.remove();
    return pyodide.globals.get("requete");
  })();
  pret.catch(e => echec(String(e && e.message || e)));

  window.fetch = async (url, opts = {}) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return vraiFetch(url, opts);
    const requete = await pret;
    await new Promise(r => setTimeout(r, 0));
    const r = JSON.parse(requete(opts.method || "GET", url, opts.body || ""));
    if (r.db) { try { localStorage.setItem(CLE, r.db); } catch (e) {} }
    return new Response(r.corps, { status: r.statut, headers: { "Content-Type": "application/json" } });
  };
  window.reinitialiserDemo = () => { try { localStorage.removeItem(CLE); } catch (e) {} location.reload(); };
})();
'''

BANDEAU = '''<div class="demo-bandeau">Démo : le tuteur IA ne tourne que sur le PC, ici il répond en mode guidé. <button onclick="reinitialiserDemo()">Remettre à zéro</button></div>'''

CSS_DEMO = '''
#chargement { position: fixed; inset: 0; z-index: 100; background: var(--papier); display: grid; place-items: center; text-align: center; padding: 2rem; }
#chargement .logo-marque { width: 56px; height: 56px; font-size: 1.8rem; margin: 0 auto 1rem; border-radius: 16px; }
#chargement p { color: var(--encre-2); }
.roue { width: 28px; height: 28px; border: 3px solid var(--trait); border-top-color: var(--accent); border-radius: 50%; margin: 1rem auto 0; animation: tourne 1s linear infinite; }
@keyframes tourne { to { transform: rotate(360deg); } }
body.mode-lecon .demo-bandeau { display: none; }
.demo-bandeau { background: var(--bleu-doux); color: var(--bleu); font-size: .85rem; padding: .5rem 1.5rem; text-align: center; }
.demo-bandeau button { margin-left: .5rem; border: 1px solid var(--bleu); background: transparent; color: var(--bleu); border-radius: 8px; padding: .1rem .5rem; font-size: .8rem; cursor: pointer; }
'''

CHARGEMENT = '''<div id="chargement"><div><div class="logo-marque">M</div><h2>Mentor IA</h2><p>Chargement de Python dans ton navigateur (quelques secondes la première fois)…</p><div class="roue"></div></div></div>'''

sur = lambda o: json.dumps(o, ensure_ascii=False).replace("</", "<\\/")
shim = (SHIM.replace("__FICHIERS__", sur(fichiers))
            .replace("__PYODIDE__", PYODIDE)
            .replace("__AMORCE__", sur(AMORCE)))

html = index
html = html.replace('<link rel="stylesheet" href="/style.css">', f"<style>\n{css}\n{CSS_DEMO}</style>")
html = html.replace("<title>Mentor IA</title>", "<title>Mentor IA — démo</title>")
html = html.replace("<body>", "<body>\n" + CHARGEMENT, 1)
html = html.replace("</header>", "</header>\n" + BANDEAU, 1)
html = html.replace('<script src="/app.js"></script>',
                    f'<script src="{PYODIDE}pyodide.js"></script>\n<script>\n{shim}\n</script>\n<script>\n{appjs.replace("</script", "<\\/script")}\n</script>')
assert "pyodide.js" in html and "<style>" in html and "demo-bandeau" in html
html = html.replace("Ta progression reste sur cet ordinateur (dossier <code>data/</code>). Rien n'est envoyé sur Internet.",
                    "Dans cette démo, ta progression est gardée dans ce navigateur uniquement.")
open(sortie, "w", encoding="utf-8").write(html)
print(sortie, len(html) // 1024, "Ko")
