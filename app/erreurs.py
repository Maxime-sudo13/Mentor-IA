"""Explications des erreurs Python les plus fréquentes, écrites à l'avance.

Elles sont toujours justes, contrairement à un petit modèle d'IA :
le tuteur s'appuie dessus avant de reformuler.
"""
import re

EXPLICATIONS = {
    "SyntaxError": (
        "Python n'arrive pas à lire ta ligne : la grammaire du code n'est pas respectée.",
        "Vérifie les deux-points à la fin des lignes if / for / while / def, les parenthèses et les guillemets (chaque ouvrant doit avoir son fermant).",
    ),
    "IndentationError": (
        "Le décalage (les espaces en début de ligne) n'est pas cohérent.",
        "Après une ligne qui finit par « : », le bloc doit être décalé de 4 espaces. Toutes les lignes d'un même bloc doivent avoir exactement le même décalage.",
    ),
    "TabError": (
        "Tu mélanges des tabulations et des espaces pour décaler ton code.",
        "Utilise uniquement des espaces (4 par niveau).",
    ),
    "NameError": (
        "Tu utilises un nom que Python ne connaît pas.",
        "Vérifie l'orthographe exacte (majuscules comprises) et que la variable est bien créée AVANT la ligne qui l'utilise. Un texte oublié sans guillemets donne aussi cette erreur.",
    ),
    "TypeError": (
        "Tu fais une opération entre des types qui ne vont pas ensemble (par exemple texte + nombre), ou tu appelles une fonction avec un mauvais nombre d'arguments.",
        "Regarde le type de chaque valeur sur la ligne indiquée. Convertis si besoin avec int(), float() ou str().",
    ),
    "ValueError": (
        "Le type est bon mais la valeur ne convient pas, par exemple int(\"abc\").",
        "Vérifie la valeur que tu convertis : int() n'accepte que du texte contenant un nombre entier.",
    ),
    "ZeroDivisionError": (
        "Tu divises par zéro.",
        "Ajoute un test avant la division, par exemple : if len(valeurs) == 0.",
    ),
    "IndexError": (
        "Tu demandes une position qui n'existe pas dans la liste.",
        "Une liste de 3 éléments a les indices 0, 1 et 2 — pas 3. Vérifie aussi le cas de la liste vide.",
    ),
    "KeyError": (
        "Tu lis une clé qui n'existe pas dans le dictionnaire.",
        "Vérifie l'orthographe de la clé, ou utilise d.get(cle, valeur_par_defaut).",
    ),
    "AttributeError": (
        "Tu appelles une méthode qui n'existe pas pour ce type de valeur.",
        "Par exemple, append() existe pour les listes mais pas pour les textes. Souvent, la variable n'est pas du type que tu crois (parfois elle vaut None).",
    ),
    "UnboundLocalError": (
        "Dans ta fonction, tu utilises une variable avant de lui avoir donné une valeur.",
        "Initialise la variable au début de la fonction (par exemple total = 0) avant la boucle.",
    ),
    "RecursionError": (
        "Ta fonction s'appelle elle-même sans fin.",
        "Vérifie qu'il existe un cas où la fonction s'arrête sans se rappeler.",
    ),
    "Timeout": (
        "Ton programme ne s'est pas arrêté à temps : c'est presque toujours une boucle infinie.",
        "Dans une boucle while, vérifie que quelque chose change à chaque tour pour que la condition finisse par devenir fausse.",
    ),
    "RuntimeError": (
        "Une erreur s'est produite pendant l'exécution.",
        "Lis le message : il indique souvent directement le problème.",
    ),
}


MOTS_BLOC = ("if", "elif", "else", "for", "while", "def", "class", "try", "except", "finally", "with")


def _masquer_textes(ligne):
    """Remplace le contenu des textes entre guillemets par des X et retire le commentaire,
    pour que les règles ne se déclenchent pas sur ce qui est écrit DANS un texte."""
    res, quote = [], None
    for c in ligne:
        if quote:
            if c == quote:
                quote = None
                res.append(c)
            else:
                res.append("X")
        elif c in "\"'":
            quote = c
            res.append(c)
        elif c == "#":
            break
        else:
            res.append(c)
    return "".join(res), quote is not None


def _diagnostic_ligne(brute):
    """Cherche une faute de débutant précise sur UNE ligne. Renvoie (quoi, comment) ou None."""
    ligne, texte_ouvert = _masquer_textes(brute)
    s = ligne.strip()
    mot = re.match(r"[A-Za-z_]+", s)
    mot = mot.group(0) if mot else ""
    if texte_ouvert:
        return ("Un texte commence par un guillemet mais n'est jamais fermé.",
                "Ajoute le guillemet fermant, du même type que l'ouvrant : \"…\" ou '…'.")
    for faux, bon, nom in (("=>", ">=", "supérieur ou égal"), ("=<", "<=", "inférieur ou égal"),
                           ("≥", ">=", "supérieur ou égal"), ("≤", "<=", "inférieur ou égal"), ("≠", "!=", "différent de")):
        if faux in s:
            return (f"Tu as écrit « {faux} » : Python ne connaît pas ce symbole.",
                    f"« {nom} » s'écrit « {bon} » en Python (le signe = toujours en second).")
    if re.match(r"else\s+if\b", s):
        return ("« else if » n'existe pas en Python.", "Écris « elif » à la place.")
    if mot in ("if", "elif", "while") and re.search(r"(?<![=!<>:])=(?!=)", s.rstrip(":")):
        return ("Dans une condition, tu as utilisé « = », qui sert à ranger une valeur dans une variable.",
                "Pour comparer deux valeurs, écris « == ».")
    if mot == "print" and not re.match(r"print\s*\(", s):
        return ("print a besoin de parenthèses en Python 3.", "Écris par exemple : print(\"Bonjour\").")
    ouvertes = sum(s.count(c) for c in "([{") - sum(s.count(c) for c in ")]}")
    if ouvertes > 0:
        return ("Une parenthèse (ou un crochet) est ouverte mais jamais fermée sur cette ligne.",
                "Compte les ( et les ) : il en faut autant de chaque. Même chose pour [ ] et { }.")
    if ouvertes < 0:
        return ("Il y a une parenthèse (ou un crochet) fermante en trop sur cette ligne.",
                "Compte les ( et les ) : il en faut autant de chaque.")
    if mot in MOTS_BLOC and ":" not in s:
        return (f"La ligne qui commence par « {mot} » doit se terminer par deux-points « : ».",
                "Ajoute « : » à la toute fin de la ligne, puis décale de 4 espaces les lignes du bloc en dessous.")
    return None


def _diagnostic_message(message):
    """Les versions récentes de Python donnent parfois déjà la cause exacte."""
    m = message.lower()
    if "expected ':'" in m:
        return ("Il manque les deux-points « : » à la fin de la ligne.",
                "Les lignes if / elif / else / for / while / def se terminent toujours par « : ».")
    if "unterminated string" in m or "eol while scanning" in m:
        return ("Un texte commence par un guillemet mais n'est jamais fermé.",
                "Ajoute le guillemet fermant, du même type que l'ouvrant.")
    if "was never closed" in m or "unexpected eof" in m:
        return ("Une parenthèse (ou un crochet) est ouverte mais jamais fermée.",
                "Compte les ( et les ) : il en faut autant de chaque.")
    if "maybe you meant '=='" in m:
        return ("Tu as utilisé « = » là où il faut comparer.", "Pour comparer deux valeurs, écris « == ».")
    if "missing parentheses in call to 'print'" in m:
        return ("print a besoin de parenthèses en Python 3.", "Écris par exemple : print(\"Bonjour\").")
    return None


def expliquer(type_erreur, code="", ligne=None, message=""):
    """Explication de l'erreur. Si le code et la ligne sont fournis, on cherche d'abord
    la faute précise (symbole, deux-points, guillemet…) : c'est bien plus utile qu'un
    message général, et ça évite que le petit modèle d'IA devine (souvent mal)."""
    quoi, comment = EXPLICATIONS.get(
        type_erreur,
        ("Python a rencontré une erreur.", "Lis le message et regarde la ligne indiquée."),
    )
    precis = None
    if type_erreur == "SyntaxError":
        lignes = code.splitlines()
        if ligne and 1 <= ligne <= len(lignes):
            precis = _diagnostic_ligne(lignes[ligne - 1])
            if precis is None and ligne >= 2:  # parenthèse ouverte la ligne d'avant
                avant = _diagnostic_ligne(lignes[ligne - 2])
                if avant and "parenthèse" in avant[0]:
                    precis = (avant[0].replace("sur cette ligne", f"à la ligne {ligne - 1}"), avant[1])
        precis = precis or _diagnostic_message(message)
    elif type_erreur == "NameError":
        nom = re.search(r"name '([^']+)' is not defined", message)
        if nom:
            n = nom.group(1)
            quoi = f"Python ne connaît pas le nom « {n} »."
            if n[:1].isupper() and n not in ("True", "False", "None"):
                comment = f"Si « {n} » est un texte, mets-le entre guillemets : \"{n}\". Sinon, " + comment[0].lower() + comment[1:]
    if precis:
        quoi, comment = precis
    return {"quoi": quoi, "comment": comment, "precis": bool(precis)}
