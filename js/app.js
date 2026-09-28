const DATE_DEBUT = "2026-09-01";
const DATE_FIN = "2027-06-30";


async function chargerAdherents() {

    const reponse = await fetch("csv/adherents.csv");
    const texte = await reponse.text();

    const lignes = texte.trim().split("\r\n");

    return lignes
        .slice(1)
        .map(ligne => ligne.trim())
        .filter(ligne => ligne !== "");
}


function convertirLigne(ligne, fichier) {

    let [rank, name, points, hitman] = ligne.split(",");

    if (Number(rank) === 1) {
        hitman = name;
    }

    return {
        type: fichier.type,
        fichier: fichier.name,
        date: fichier.date,
        rank: Number(rank),
        name: name,
        points: Number(points),
        hitman: hitman
    };
}


async function chargerCSV(fichier) {

    const reponse = await fetch(fichier.path);
    const texteCSV = await reponse.text();

    const lignes = texteCSV.trim().split("\r\n");

    const joueurs = lignes
        .slice(1)
        .map(ligne => convertirLigne(ligne, fichier));

    console.log("Joueurs du fichier :", fichier.name, joueurs);
    
    return joueurs;
}


async function chargerResultats() {

    // 1. On récupère la liste des adhérents
    const adherents = await chargerAdherents();

    // 2. On récupère la liste des fichiers CSV
    const reponse = await fetch("data/fichiers.json");
    const fichiers = await reponse.json();

    // 3. Tableau qui contient tous les résultats
    const tousLesJoueurs = [];

    // 4. On charge chaque CSV
    for (const fichier of fichiers) {

        const resultats = await chargerCSV(fichier);

        tousLesJoueurs.push(...resultats);
    }

    const resultatsPeriode = tousLesJoueurs.filter(
        joueur => joueur.date >= DATE_DEBUT &&
                  joueur.date <= DATE_FIN
    );


    console.log("Tous les résultats :", tousLesJoueurs);


    // 5. Construction du classement
    const classement = [];

    for (const nom of adherents) {

        const resultatsJoueur = resultatsPeriode.filter(
            joueur => joueur.name === nom
        );

        // =========================
        // TOTAL GENERAL
        // =========================

        const totalPoints = resultatsJoueur.reduce(
            (total, joueur) => total + joueur.points,
            0
        );

        const totalHitman = resultatsPeriode.filter(
            joueur => joueur.hitman === nom
        ).length;


        // =========================
        // STATISTIQUES PAR CATEGORIE
        // =========================

        const categories = {
            MTT: {
                participations: 0,
                itm: 0,
                victoires: 0,
                points: 0
            },

            SNG: {
                participations: 0,
                itm: 0,
                victoires: 0,
                points: 0
            },

            SNGT: {
                participations: 0,
                itm: 0,
                victoires: 0,
                points: 0
            },

            CASH: {
                participations: 0,
                itm: 0,
                victoires: 0,
                points: 0
            }
        };


        // On parcourt les résultats du joueur
        for (const joueur of resultatsJoueur) {

            const categorie = categories[joueur.type];

            // Participation
            categorie.participations++;

            // Points
            categorie.points += joueur.points;


            // MTT
            if (joueur.type === "MTT") {

                if (joueur.rank <= 6) {
                    categorie.itm++;
                }

                if (joueur.rank === 1) {
                    categorie.victoires++;
                }
            }


            // SNG
            if (joueur.type === "SNG") {

                if (joueur.points >= 100) {
                    categorie.itm++;
                }

                if (joueur.rank === 1) {
                    categorie.victoires++;
                }
            }


            // SNG Turbo
            if (joueur.type === "SNGT") {

                if (joueur.points >= 100) {
                    categorie.itm++;
                }

                if (joueur.rank === 1) {
                    categorie.victoires++;
                }
            }


            // CASH
            // Pas d'ITM ni de victoire
        }


        // =========================
        // AJOUT AU CLASSEMENT
        // =========================

        classement.push({
            name: nom,
            points: totalPoints,
            hitman: totalHitman,
            categories: categories
        });
    }


    // 6. Classement général par points
    classement.sort(
        (a, b) => b.points - a.points
    );

    console.log("Classement :", classement);


    // 7. Affichage
    afficherClassement(classement);
}



function afficherClassement(classement) {

    const resultats = document.querySelector("#resultats");

    let html = `
        <table>
            <thead>
                <tr>
                    <th>Rang</th>
                    <th>Joueur</th>

                    <th>Total points</th>
                    <th>Kills</th>

                    <th>MTT</th>
                    <th>SnG</th>
                    <th>SnG Turbo</th>
                    <th>Cash</th>
                </tr>
            </thead>

            <tbody>
    `;


    classement.forEach((joueur, index) => {

        const mtt = joueur.categories.MTT;
        const sng = joueur.categories.SNG;
        const sngt = joueur.categories.SNGT;
        const cash = joueur.categories.CASH;


        html += `
            <tr>

                <td>${index + 1}</td>

                <td>${joueur.name}</td>

                <td>${joueur.points}</td>

                <td>${joueur.hitman}</td>


                <td>
                    ${mtt.participations} participations<br>
                    ${mtt.itm} ITM<br>
                    ${mtt.victoires} victoire(s)<br>
                    ${mtt.points} points
                </td>


                <td>
                    ${sng.participations} participations<br>
                    ${sng.itm} ITM<br>
                    ${sng.victoires} victoire(s)<br>
                    ${sng.points} points
                </td>


                <td>
                    ${sngt.participations} participations<br>
                    ${sngt.itm} ITM<br>
                    ${sngt.victoires} victoire(s)<br>
                    ${sngt.points} points
                </td>


                <td>
                    ${cash.participations} participations<br>
                    ${cash.points} points
                </td>

            </tr>
        `;

    });


    html += `
            </tbody>
        </table>
    `;


    resultats.innerHTML = html;
}




// Lancement du programme
chargerResultats();
