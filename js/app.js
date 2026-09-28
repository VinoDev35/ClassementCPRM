const API_KEY = "AIzaSyCWqZKaM94RWvuNDuZPH7kHx2SpB2UIADQ" ;
const DOSSIER_MTT = "1bYjFfCN0SrYSdGWD0fzRVeB6RWrD97NW"
const DOSSIER_SNG = "1oeBA4nWW6hRbgeCx3XrbYusxhiyHYjQi";
const DOSSIER_SNGT = "1YRus9v9eK5x2n04JkVBN0NAHqgYePspd";
const DOSSIER_CASH = "1DUkwezVBjqLI8_6e-KTXXWyKjGY4WvSY";


async function chercherFichiersDrive(dossier, type) {

    const url =
        `https://www.googleapis.com/drive/v3/files` +
        `?q='${dossier}' in parents and trashed = false` +
        `&fields=files(id,name,mimeType,capabilities,webContentLink,resourceKey)` +
        `&key=${API_KEY}`;

    const reponse = await fetch(url);

    const donnees = await reponse.json();

    const joueurs = [];

    for (const fichier of donnees.files) {

        fichier.type = type;

        console.log(fichier);

        const resultat = await chargerCSVDrive(fichier);

        joueurs.push(...resultat);
    }

    return joueurs;
}


async function chargerResultatsDrive() {

    const adherents = await chargerAdherents();

    const joueursMTT = await chercherFichiersDrive(
        DOSSIER_MTT,
        "MTT"
    );

    const joueursSNG = await chercherFichiersDrive(
        DOSSIER_SNG,
        "SNG"
    );

    const joueursSNGT = await chercherFichiersDrive(
        DOSSIER_SNGT,
        "SNGT"
    );

    const joueursCASH = await chercherFichiersDrive(
        DOSSIER_CASH,
        "CASH"
    );

    const tousLesJoueurs = [
        ...joueursMTT,
        ...joueursSNG,
        ...joueursSNGT,
        ...joueursCASH
    ];

    console.log(tousLesJoueurs);


    const classement = [];

    for (const nom of adherents) {

        const resultatsJoueur = tousLesJoueurs.filter(
            joueur => joueur.name === nom
        );

        const totalPoints = resultatsJoueur.reduce(
            (total, joueur) => total + joueur.points,
            0
        );

        const totalHitman = tousLesJoueurs.filter(
            joueur => joueur.hitman === nom
        ).length;

        classement.push({
            name: nom,
            points: totalPoints,
            hitman: totalHitman
        });
    }

    classement.sort((a, b) => b.points - a.points);

    console.log(classement);

    afficherClassement(classement);
}

async function chargerCSVDrive(fichier) {

    const url = fichier.webContentLink;

    const reponse = await fetch(url);

    const texteCSV = await reponse.text();

    const lignes = texteCSV.trim().split("\r\n");

    const joueurs = lignes
        .slice(1)
        .map(ligne => convertirLigne(ligne, fichier));

    return joueurs;
}


const resultats = document.querySelector("#resultats");

async function chargerAdherents() {
    const reponse = await fetch("csv/adherents.csv");
    const texteCSV = await reponse.text();

    const lignes = texteCSV.trim().split("\r\n");

    const adherents = lignes
        .slice(1);

    return adherents;
}



function convertirLigne(ligne, fichier) {
    let [rank, name, points, hitman] = ligne.split(",");

    if (Number(rank) === 1) {
        hitman = name;
    }

    return {
        type: fichier.type,
        fichier: fichier.name,
        rank: Number(rank),
        name: name,
        points: Number(points),
        hitman: hitman
    };
}



function afficherClassement(classement) {
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Rang</th>
                    <th>Joueur</th>
                    <th>Points</th>
                    <th>Hitman</th>
                </tr>
            </thead>
            <tbody>
    `;

    classement.forEach((joueur, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${joueur.name}</td>
                <td>${joueur.points}</td>
                <td>${joueur.hitman}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    resultats.innerHTML = html;
}



chargerResultatsDrive();
