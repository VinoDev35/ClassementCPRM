
import os
import json
import re
import urllib.parse
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path


# Configuration
ROOT_FOLDER_ID = "1FMTwRWpuvDUxCMO4cTg34Y2KmHY-kU6k"
API_KEY = os.environ.get("GOOGLE_DRIVE_API_KEY")


DOSSIERS = {
    "MTT": {
        "local": "MTT",
        "type": "MTT",
        "classement": True,
    },
    "SNG": {
        "local": "SnG",
        "type": "SNG",
        "classement": True,
    },
    "SNG Turbo": {
        "local": "SnG Turbo",
        "type": "SNGT",
        "classement": True,
    },
    "CASH": {
        "local": "CASH",
        "type": "CASH",
        "classement": True,
    },
    "events": {
        "local": "events",
        "type": "EVENT",
        "classement": False,
    },
}


RACINE_PROJET = Path(__file__).resolve().parents[1]
DOSSIER_CSV = RACINE_PROJET / "csv"
FICHIER_ADHERENTS = DOSSIER_CSV / "adherents.csv"
FICHIER_INDEX = RACINE_PROJET / "data" / "fichiers.json"

API_BASE = "https://www.googleapis.com/drive/v3/files"


def requete_json(url, parametres):
    """Effectue une requête Google Drive et retourne le JSON."""
    parametres = {**parametres, "key": API_KEY}
    url_complete = url + "?" + urllib.parse.urlencode(parametres)

    request = urllib.request.Request(
        url_complete,
        headers={"User-Agent": "CPRM-Classement-Sync"}
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))

    except urllib.error.HTTPError as erreur:
        # Ne jamais afficher l'URL : elle contient la clé API.
        print("Erreur Google Drive HTTP :", erreur.code)
        print(erreur.read().decode("utf-8"))
        raise


def lister_contenu(dossier_id):
    """Liste tous les éléments directs d'un dossier, avec pagination."""
    elements = []
    page_token = None

    while True:
        params = {
            "q": f"'{dossier_id}' in parents and trashed = false",
            "fields": (
                "nextPageToken,"
                "files(id,name,mimeType,modifiedTime,md5Checksum)"
            ),
            "pageSize": 1000,
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }

        if page_token:
            params["pageToken"] = page_token

        resultat = requete_json(API_BASE, params)
        elements.extend(resultat.get("files", []))
        page_token = resultat.get("nextPageToken")

        if not page_token:
            return elements


def telecharger_fichier(fichier_id):
    """Télécharge le contenu d'un fichier public."""
    url = f"{API_BASE}/{fichier_id}"

    params = urllib.parse.urlencode({
        "alt": "media",
        "key": API_KEY,
        "supportsAllDrives": "true",
    })

    request = urllib.request.Request(
        url + "?" + params,
        headers={"User-Agent": "CPRM-Classement-Sync"}
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read()

    except urllib.error.HTTPError as erreur:
        print("Échec du téléchargement, HTTP :", erreur.code)
        print(erreur.read().decode("utf-8"))
        raise


def extraire_date(nom_fichier):
    """Extrait une date JJ-MM-AAAA ou JJ-MM-AA au format ISO."""
    resultat = re.search(
        r"(?<!\d)(\d{4}|\d{2})-(\d{2})-(\d{2})(?!\d)",
        nom_fichier
    )

    if not resultat:
        raise ValueError(
            f"Date absente du nom de fichier : {nom_fichier}"
        )

    annee, mois, jour = resultat.groups()
    annee = int(annee)

    if len(resultat.group(1)) == 2:
        annee += 2000

    return date(annee, int(mois), int(jour)).isoformat()


def chemin_url(chemin):
    """Encode chaque segment du chemin pour les URL du site."""
    return "/".join(
        urllib.parse.quote(segment, safe="")
        for segment in chemin.split("/")
    )


def synchroniser():
    if not API_KEY:
        raise RuntimeError(
            "Le secret GOOGLE_DRIVE_API_KEY est absent."
        )

    print("Lecture du dossier CPRM - Résultats...")
    racine = lister_contenu(ROOT_FOLDER_ID)

    # Repérer les quatre dossiers attendus.
    dossiers_drive = {
        element["name"].strip().casefold(): element
        for element in racine
        if element["mimeType"] == "application/vnd.google-apps.folder"
    }

    dossiers_trouves = {}

    for nom in DOSSIERS:
        element = dossiers_drive.get(nom.casefold())

        if not element:
            raise RuntimeError(
                f"Dossier obligatoire introuvable dans Drive : {nom}"
            )

        dossiers_trouves[nom] = element

    # Repérer adherents.csv à la racine.
    adherents = [
        element for element in racine
        if element["name"].casefold() == "adherents.csv"
        and element["mimeType"] != "application/vnd.google-apps.folder"
    ]

    if len(adherents) != 1:
        raise RuntimeError(
            "Il faut exactement un fichier adherents.csv à la racine."
        )

    # Tout télécharger et valider AVANT de modifier les fichiers locaux.
    fichiers_a_ecrire = {}
    nouveaux_index = []

    print("Téléchargement des adhérents...")
    fichiers_a_ecrire[FICHIER_ADHERENTS] = telecharger_fichier(
        adherents[0]["id"]
    )

    for nom_dossier, configuration in DOSSIERS.items():
        dossier = dossiers_trouves[nom_dossier]
        print(f"Lecture de {nom_dossier}...")

        elements = lister_contenu(dossier["id"])

        for element in elements:
            nom = element["name"]

            if not nom.lower().endswith(".csv"):
                continue

            if Path(nom).name != nom:
                raise ValueError(
                    f"Nom de fichier inattendu : {nom}"
                )

            # Vérifier que le nom contient une date valide.
            date_fichier = extraire_date(nom)

            chemin_relatif = (
                f"csv/{configuration['local']}/{nom}"
            )
            chemin_local = (
                DOSSIER_CSV / configuration["local"] / nom
            )

            print(f"  Téléchargement : {nom}")

            fichiers_a_ecrire[chemin_local] = telecharger_fichier(
                element["id"]
            )

            nouveaux_index.append({
                "id": f"drive-{element['id']}",
                "name": nom,
                "path": chemin_url(chemin_relatif),
                "type": configuration["type"],
                "date": date_fichier,
                "classement": configuration["classement"],
            })

    # Trier l'index pour conserver un ordre stable.
    nouveaux_index.sort(
        key=lambda fichier: (fichier["date"], fichier["name"])
    )

    # Tous les téléchargements ont réussi : écrire les fichiers.
    for chemin, contenu in fichiers_a_ecrire.items():
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(contenu)

    FICHIER_INDEX.parent.mkdir(parents=True, exist_ok=True)
    FICHIER_INDEX.write_text(
        json.dumps(
            nouveaux_index,
            ensure_ascii=False,
            indent=4
        ) + "\n",
        encoding="utf-8"
    )


    print("Synchronisation terminée.")
    print("CSV de résultats :", len(nouveaux_index))
    print("Index généré :", FICHIER_INDEX)


if __name__ == "__main__":
    synchroniser()
