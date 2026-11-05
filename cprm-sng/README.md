# CPRM — Gestion des SnG

Mini-application locale en HTML, CSS et JavaScript natif.

## Lancement
Ouvrir le dossier dans VS Code et lancer `index.html` avec Live Server. Le chargement de `data/adherents.csv` nécessite un serveur local.

## Liste des adhérents
Modifier `data/adherents.csv`, dans un CSV à une seule colonne nommée `Name`. Tu peux le modifier avec Excel ou LibreOffice, puis l’enregistrer en CSV (UTF-8).

## Fonctions
- Configuration verticale des formats et menus d'adhérents sans libellés Joueur 1, Joueur 2, etc.
- Génération aléatoire et ajout de tables manuelles.
- Affichage progressif du prochain siège disponible, jusqu'à 10 joueurs.
- Hitman choisi uniquement parmi les joueurs présents à la table.
- Barèmes indépendants SnG et SnG turbo pour chaque nombre de joueurs configuré. Chaque barème comprend les points par kill et les points de chaque place (fixes ou multipliés par le nombre de joueurs).
- Cash : saisie manuelle des points par incréments de 0,25, choix de 1 ou 2 caves et malus de 100 points pour deux caves. Vérification du total saisi égal à nombre de joueurs × 100.
- Sauvegarde automatique dans le localStorage et sauvegarde JSON manuelle.
- Vérification avant export et génération d'un CSV par table avec les colonnes `Rank,Name,Points,Hitman`.
- Nom de fichier `YY-MM-DD_JEU_NUM.csv`. En cash, Hitman reste vide.

## À noter
Les valeurs de barème initiales pour 6 joueurs sont des exemples à remplacer par les règles officielles du CPRM. Pour chaque taille de table différente (ex. 7 joueurs), crée et configure le barème correspondant avant d'exporter.
