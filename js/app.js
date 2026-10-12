
const DATE_DEBUT = "2026-09-01";
const DATE_FIN = "2027-06-30";

let fichiersCharges = [];
let resultatsParFichier = new Map();


// =========================
// ADHERENTS
// =========================

async function chargerAdherents() {
    const reponse = await fetch("csv/adherents.csv");

    if (!reponse.ok) {
        throw new Error("Impossible de charger adherents.csv");
    }

    const texte = await reponse.text();

    return texte
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map(ligne => ligne.trim())
        .filter(ligne => ligne !== "");
}


// =========================
// LECTURE DES CSV
// =========================

function convertirLigne(ligne, fichier) {
    const [rank, name, points, hitman] = ligne.split(",");

    if (!name || !name.trim()) {
        return null;
    }

    const nom = name.trim();

    return {
        type: fichier.type,
        fichier: fichier.name,
        date: fichier.date,
        rank: Number(rank),
        name: nom,
        points: Number(points),
        hitman: Number(rank) === 1 ? nom : (hitman || "").trim()
    };
}


async function chargerCSV(fichier) {
    const reponse = await fetch(fichier.path);

    if (!reponse.ok) {
        throw new Error(
            `Impossible de charger ${fichier.path} : HTTP ${reponse.status}`
        );
    }

    const texteCSV = await reponse.text();
    const lignes = texteCSV.trim().split(/\r?\n/);

    return lignes
        .slice(1)
        .filter(ligne => ligne.trim() !== "")
        .map(ligne => convertirLigne(ligne, fichier))
        .filter(joueur => joueur !== null);
}


// =========================
// CLASSEMENT
// =========================

function participeAuClassement(fichier) {
    // Compatibilité avec l'ancien fichiers.json :
    // les anciennes entrées sans propriété "classement"
    // restent prises en compte, sauf les événements.
    return fichier.classement !== false &&
           fichier.type !== "EVENT";
}


async function chargerResultats() {
    try {
        const adherents = await chargerAdherents();

        const reponse = await fetch("data/fichiers.json");

        if (!reponse.ok) {
            throw new Error("Impossible de charger data/fichiers.json");
        }

        fichiersCharges = await reponse.json();
        resultatsParFichier = new Map();

        const tousLesJoueurs = [];

        // Charger chaque tournoi une seule fois.
        for (const fichier of fichiersCharges) {
            const resultats = await chargerCSV(fichier);

            resultatsParFichier.set(fichier.id, resultats);
            tousLesJoueurs.push(...resultats);
        }

        // Seuls les fichiers officiels alimentent le classement.
        const resultatsOfficiels = tousLesJoueurs.filter(
            joueur => {
                const fichier = fichiersCharges.find(
                    element => element.name === joueur.fichier &&
                               element.date === joueur.date
                );

                return fichier && participeAuClassement(fichier);
            }
        );

        // Filtrer la période du classement.
        const resultatsPeriode = resultatsOfficiels.filter(
            joueur => joueur.date >= DATE_DEBUT &&
                      joueur.date <= DATE_FIN
        );

        const classement = [];

        for (const nom of adherents) {
            const resultatsJoueur = resultatsPeriode.filter(
                joueur => joueur.name === nom
            );

            const totalPoints = resultatsJoueur.reduce(
                (total, joueur) => total + joueur.points,
                0
            );

            const totalHitman = resultatsPeriode.filter(
                joueur => joueur.hitman === nom
            ).length;

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

            for (const joueur of resultatsJoueur) {
                const categorie = categories[joueur.type];

                // Une catégorie inconnue ne doit pas faire planter
                // le classement.
                if (!categorie) {
                    continue;
                }

                categorie.participations++;
                categorie.points += joueur.points;

                if (joueur.type === "MTT") {
                    if (joueur.rank <= 6) categorie.itm++;
                    if (joueur.rank === 1) categorie.victoires++;
                }

                if (joueur.type === "SNG" ||
                    joueur.type === "SNGT") {
                    if (joueur.points >= 100) categorie.itm++;
                    if (joueur.rank === 1) categorie.victoires++;
                }
            }

            classement.push({
                name: nom,
                points: totalPoints,
                hitman: totalHitman,
                categories
            });
        }

        classement.sort((a, b) => b.points - a.points);

        afficherClassement(classement);
        afficherCatalogue();

    } catch (erreur) {
        console.error("Erreur de chargement :", erreur);

        document.querySelector("#resultats").innerHTML = `
            <p>Impossible de charger les résultats.
            Consulte la console pour plus de détails.</p>
        `;
    }
}


// =========================
// AFFICHAGE DU CLASSEMENT
// =========================

function echapperHTML(valeur) {
    return String(valeur ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caractere]);
}


function afficherClassement(classement) {
    const resultats = document.querySelector("#resultats");

    let html = `
        <section>
            <h2>Classement général</h2>
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
                <td>${echapperHTML(joueur.name)}</td>
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
        </section>
    `;

    resultats.innerHTML = html;
}


// =========================
// CATALOGUE DES TOURNOIS
// =========================

function afficherCatalogue() {
    const resultats = document.querySelector("#resultats");

    // Trier du tournoi le plus récent au plus ancien.
    const fichiers = [...fichiersCharges].sort(
        (a, b) => b.date.localeCompare(a.date) ||
                  a.name.localeCompare(b.name)
    );

    let html = `
        <section class="catalogue-tournois">
            <h2>Résultats des tournois</h2>
            <p>
                Consulte les résultats d'un tournoi,
                y compris les événements hors classement.
            </p>

            <label for="selectionTournoi">Choisir un tournoi :</label>

            <select id="selectionTournoi">
    `;

    fichiers.forEach((fichier, index) => {
        const categorie = fichier.type === "EVENT"
            ? "Événement hors classement"
            : fichier.type;

        html += `
            <option value="${index}">
                ${echapperHTML(fichier.date)} — 
                ${echapperHTML(fichier.name)} 
                (${echapperHTML(categorie)})
            </option>
        `;
    });

    html += `
            </select>

            <button id="afficherTournoi" type="button">
                Afficher les résultats
            </button>

            <div id="resultatsTournoi"></div>
        </section>
    `;

    resultats.insertAdjacentHTML("beforeend", html);

    document.querySelector("#afficherTournoi").addEventListener(
        "click",
        () => {
            const index = Number(
                document.querySelector("#selectionTournoi").value
            );

            afficherResultatsTournoi(fichiers[index]);
        }
    );

    // Afficher directement le tournoi le plus récent.
    if (fichiers.length > 0) {
        afficherResultatsTournoi(fichiers[0]);
    }
}


function afficherResultatsTournoi(fichier) {
    const conteneur = document.querySelector("#resultatsTournoi");

    if (!fichier) {
        conteneur.innerHTML = "<p>Aucun tournoi sélectionné.</p>";
        return;
    }

    const joueurs = resultatsParFichier.get(fichier.id) || [];

    const horsClassement = !participeAuClassement(fichier);

    let html = `
        <h3>${echapperHTML(fichier.name)}</h3>
        <p>Date : ${echapperHTML(fichier.date)}</p>
        <p>Catégorie : ${echapperHTML(fichier.type)}</p>
    `;

    if (horsClassement) {
        html += `
            <p><strong>Événement hors classement général</strong></p>
        `;
    }

    if (joueurs.length === 0) {
        html += "<p>Aucun résultat disponible pour ce tournoi.</p>";
        conteneur.innerHTML = html;
        return;
    }

    html += `
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

    const joueursTries = [...joueurs].sort(
        (a, b) => a.rank - b.rank
    );

    for (const joueur of joueursTries) {
        html += `
            <tr>
                <td>${joueur.rank}</td>
                <td>${echapperHTML(joueur.name)}</td>
                <td>${joueur.points}</td>
                <td>${echapperHTML(joueur.hitman)}</td>
            </tr>
        `;
    }

    html += `
            </tbody>
        </table>
    `;

    conteneur.innerHTML = html;
}


// =========================
// LANCEMENT
// =========================

chargerResultats();
