"""Point d'entrée : python lancer.py"""
import sys

if sys.version_info < (3, 9):
    sys.exit("Mentor IA a besoin de Python 3.9 ou plus récent.")

from app.serveur import lancer

if __name__ == "__main__":
    lancer(ouvrir="--sans-navigateur" not in sys.argv)
