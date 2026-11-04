const DATE_DEBUT = "2026-09-01";
const DATE_FIN = "2027-06-30";

const PERIODES = [
    {
        id: "P1",
        nom: "Période 1 — Rentrée à Toussaint",
        debut: "2026-09-01",
        fin: "2026-10-16"
    },
    {
        id: "P2",
        nom: "Période 2 — Toussaint à Noël",
        debut: "2026-11-02",
        fin: "2026-12-18"
    },
    {
        id: "P3",
        nom: "Période 3 — Noël à hiver",
        debut: "2027-01-04",
        fin: "2027-02-19"
    },
    {
        id: "P4",
        nom: "Période 4 — Hiver à printemps",
        debut: "2027-03-08",
        fin: "2027-04-16"
    },
    {
        id: "P5",
        nom: "Période 5 — Printemps à fin de saison",
        debut: "2027-05-03",
        fin: "2027-06-30"
    }
];

let fichiersCharges = [];
let resultatsParFichier = new Map();
let tousLesResultats = [];
let adherents = [];

let categorieClassementActive = "GENERAL";
let formatTournoiActif = "MTT";

const $ = selector => document.querySelector(selector);


// ========================================
// OUTILS
// ========================================

function echapperHTML(valeur) {
    return String(valeur ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caractere]);
}

function formaterDate(date) {
    if (!date) return "";

    const [annee, mois, jour] = date.split("-");
    return `${jour}/${mois}/${annee}`;
}

function nettoyerNomTournoi(nom) {
    return String(nom ?? "")
        .replace(/\.(csv|txt)$/i, "")
        .replace(/^\d{2,4}[-_]\d{2}[-_]\d{2}[_-]?/, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function nomFormat(type) {
    const formats = {
        MTT: "MTT",
        SNG: "SnG",
        SNGT: "SnG Turbo",
        CASH: "Cash",
        EVENT: "Événement"
    };

    return formats[type] || type || "";
}

function nomFichier(fichier) {
    return nettoyerNomTournoi(fichier.name);
}

function comparerNoms(a, b) {
    return a.localeCompare(b, "fr", {
        sensitivity: "base"
    });
}


// ========================================
// LECTURE DES CSV
// ========================================

function convertirLigne(ligne, fichier) {
    const colonnes = ligne.split(",");
    const [rank, name, points, hitman] = colonnes;

    if (!name || !name.trim()) {
        return null;
    }

    const nom = name.trim();
    const rang = Number(rank);

    return {
        type: fichier.type,
        fichier: fichier.name,
        fichierId: fichier.id,
        date: fichier.date,
        rank: rang,
        name: nom,
        points: Number(points) || 0,
        hitman: rang === 1
            ? nom
            : (hitman || "").trim()
    };
}

async function chargerAdherents() {
    const reponse = await fetch("csv/adherents.csv");

    if (!reponse.ok) {
        throw new Error("Impossible de charger csv/adherents.csv");
    }

    const texte = await reponse.text();

    return texte
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map(ligne => ligne.trim())
        .filter(Boolean)
        .map(ligne => ligne.split(",")[0].trim())
        .filter(Boolean);
}

async function chargerCSV(fichier) {
    const reponse = await fetch(fichier.path);

    if (!reponse.ok) {
        throw new Error(
            `Impossible de charger ${fichier.path} : HTTP ${reponse.status}`
        );
    }

    const texte = await reponse.text();
    const lignes = texte.trim().split(/\r?\n/);

    return lignes
        .slice(1)
        .filter(ligne => ligne.trim())
        .map(ligne => convertirLigne(ligne, fichier))
        .filter(Boolean);
}


// ========================================
// CLASSEMENTS
// ========================================

function participeAuClassement(fichier) {
    return fichier.classement !== false &&
        fichier.type !== "EVENT";
}

function resultatEstOfficiel(resultat) {
    const fichier = fichiersCharges.find(
        f => String(f.id) === String(resultat.fichierId)
    );

    return fichier &&
        participeAuClassement(fichier) &&
        resultat.date >= DATE_DEBUT &&
        resultat.date <= DATE_FIN;
}

function resultatDansDates(resultat, debut, fin) {
    return (!debut || resultat.date >= debut) &&
        (!fin || resultat.date <= fin);
}

function filtrerResultatsOfficiels(
    debut = DATE_DEBUT,
    fin = DATE_FIN
) {
    return tousLesResultats.filter(resultat =>
        resultatEstOfficiel(resultat) &&
        resultatDansDates(resultat, debut, fin)
    );
}

function calculerClassement(resultats, noms = adherents) {
    const classement = noms.map(nom => {
        const resultatsJoueur = resultats.filter(
            resultat => resultat.name === nom
        );

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

        for (const resultat of resultatsJoueur) {
            const categorie = categories[resultat.type];

            if (!categorie) continue;

            categorie.participations++;
            categorie.points += resultat.points;

            if (resultat.type === "MTT") {
                if (resultat.rank <= 6) {
                    categorie.itm++;
                }

                if (resultat.rank === 1) {
                    categorie.victoires++;
                }
            } else if (
                resultat.type === "SNG" ||
                resultat.type === "SNGT"
            ) {
                if (resultat.points >= 100) {
                    categorie.itm++;
                }

                if (resultat.rank === 1) {
                    categorie.victoires++;
                }
            }
        }

        return {
            name: nom,

            points: resultatsJoueur.reduce(
                (total, resultat) => total + resultat.points,
                0
            ),

            hitman: resultats.filter(
                resultat => resultat.hitman === nom
            ).length,

            categories
        };
    });

    return classement.sort((a, b) =>
        b.points - a.points ||
        comparerNoms(a.name, b.name)
    );
}


// ========================================
// LIENS VERS LES JOUEURS
// ========================================

function lienJoueur(nom) {
    return `
        <button
            type="button"
            class="player-link"
            data-player="${echapperHTML(nom)}"
        >
            ${echapperHTML(nom)}
        </button>
    `;
}


// ========================================
// TABLEAUX DE CLASSEMENT
// ========================================

function creerTableauClassement(classement, mode = "GENERAL") {
    if (!classement.length) {
        return `
            <p class="empty-state">
                Aucun joueur dans ce classement.
            </p>
        `;
    }

    if (
        mode === "MTT" ||
        mode === "SNG" ||
        mode === "CASH"
    ) {
        const types = mode === "SNG"
            ? ["SNG", "SNGT"]
            : [mode];

        const lignes = classement.map(joueur => {
            const stats = types.map(type => joueur.categories[type]);

            const participations = stats.reduce(
                (total, categorie) =>
                    total + categorie.participations,
                0
            );

            const points = stats.reduce(
                (total, categorie) =>
                    total + categorie.points,
                0
            );

            const itm = stats.reduce(
                (total, categorie) =>
                    total + categorie.itm,
                0
            );

            const victoires = stats.reduce(
                (total, categorie) =>
                    total + categorie.victoires,
                0
            );

            return {
                joueur,
                participations,
                points,
                itm,
                victoires
            };
        })
        .filter(item => item.participations > 0)
        .sort((a, b) =>
            b.points - a.points ||
            comparerNoms(a.joueur.name, b.joueur.name)
        );

        if (!lignes.length) {
            return `
                <p class="empty-state">
                    Aucun résultat pour cette catégorie.
                </p>
            `;
        }

        return `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Rang</th>
                            <th>Joueur</th>
                            <th>Points</th>
                            <th>Participations</th>
                            <th>ITM</th>
                            <th>Victoires</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${lignes.map((item, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${lienJoueur(item.joueur.name)}</td>
                                <td>${item.points}</td>
                                <td>${item.participations}</td>
                                <td>${item.itm}</td>
                                <td>${item.victoires}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    const lignes = classement.map((joueur, index) => {
        const {
            MTT,
            SNG,
            SNGT,
            CASH
        } = joueur.categories;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${lienJoueur(joueur.name)}</td>
                <td>${joueur.points}</td>
                <td>${joueur.hitman}</td>

                <td class="stats-cell">
                    ${MTT.participations} participations<br>
                    ${MTT.itm} ITM<br>
                    ${MTT.victoires} victoire(s)<br>
                    ${MTT.points} points
                </td>

                <td class="stats-cell">
                    ${SNG.participations} participations<br>
                    ${SNG.itm} ITM<br>
                    ${SNG.victoires} victoire(s)<br>
                    ${SNG.points} points
                </td>

                <td class="stats-cell">
                    ${SNGT.participations} participations<br>
                    ${SNGT.itm} ITM<br>
                    ${SNGT.victoires} victoire(s)<br>
                    ${SNGT.points} points
                </td>

                <td class="stats-cell">
                    ${CASH.participations} participations<br>
                    ${CASH.points} points
                </td>
            </tr>
        `;
    }).join("");

    return `
        <div class="table-wrap">
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
                    ${lignes}
                </tbody>
            </table>
        </div>
    `;
}

function afficherClassementGeneral() {
    const resultats = filtrerResultatsOfficiels();
    const classement = calculerClassement(resultats);

    $("#classementGeneral").innerHTML = `
        <h3>
            ${{
                GENERAL: "Classement général",
                MTT: "Classement MTT",
                SNG: "Classement SnG",
                CASH: "Classement Cash"
            }[categorieClassementActive]}
        </h3>

        ${creerTableauClassement(
            classement,
            categorieClassementActive
        )}
    `;
}

function activerCategorieClassement(categorie) {
    categorieClassementActive = categorie;

    document.querySelectorAll("[data-category]").forEach(bouton => {
        bouton.classList.toggle(
            "active",
            bouton.dataset.category === categorie
        );
    });

    afficherClassementGeneral();
}


// ========================================
// CLASSEMENTS PAR PÉRIODE
// ========================================

function initialiserPeriodes() {
    $("#selectionPeriode").innerHTML = PERIODES.map(periode => `
        <option value="${periode.id}">
            ${echapperHTML(periode.nom)}
            (${formaterDate(periode.debut)} au ${formaterDate(periode.fin)})
        </option>
    `).join("");
}

function afficherClassementPeriode() {
    const periode = PERIODES.find(
        p => p.id === $("#selectionPeriode").value
    ) || PERIODES[0];

    const resultats = filtrerResultatsOfficiels(
        periode.debut,
        periode.fin
    );

    const classement = calculerClassement(resultats);

    $("#classementPeriode").innerHTML = `
        <h3>${echapperHTML(periode.nom)}</h3>

        <p>
            ${formaterDate(periode.debut)}
            au ${formaterDate(periode.fin)}
        </p>

        ${creerTableauClassement(classement, "GENERAL")}
    `;
}


// ========================================
// RÉSULTATS DES TOURNOIS
// ========================================

function activerFormatTournoi(format) {
    formatTournoiActif = format;

    document.querySelectorAll("[data-format]").forEach(bouton => {
        bouton.classList.toggle(
            "active",
            bouton.dataset.format === format
        );
    });

    $("#detailTournoi").innerHTML = "";
    afficherListeTournois();
}

function afficherListeTournois() {
    const debut = $("#dateDebutFiltre").value;
    const fin = $("#dateFinFiltre").value;

    const fichiers = [...fichiersCharges]
        .filter(fichier => fichier.type === formatTournoiActif)
        .filter(fichier =>
            (!debut || fichier.date >= debut) &&
            (!fin || fichier.date <= fin)
        )
        .sort((a, b) =>
            (b.date || "").localeCompare(a.date || "") ||
            comparerNoms(a.name, b.name)
        );

    if (!fichiers.length) {
        $("#listeTournois").innerHTML = `
            <p class="empty-state">
                Aucun résultat pour ce format et cette période.
            </p>
        `;

        $("#detailTournoi").innerHTML = "";
        return;
    }

    const groupes = new Map();

    for (const fichier of fichiers) {
        const date = fichier.date || "Date inconnue";

        if (!groupes.has(date)) {
            groupes.set(date, []);
        }

        groupes.get(date).push(fichier);
    }

    $("#listeTournois").innerHTML = [...groupes.entries()]
        .map(([date, tournois]) => `
            <section class="date-groupe">
                <div class="date-entete">
                    <h3>${formaterDate(date) || date}</h3>
                    <span>
                        ${tournois.length}
                        ${tournois.length > 1 ? "tournois" : "tournoi"}
                    </span>
                </div>

                ${tournois.map(fichier => `
                    <div class="tournoi-ligne">
                        <span class="tournoi-nom">
                            ${echapperHTML(nomFichier(fichier))}
                        </span>

                        <button
                            type="button"
                            class="secondary-button"
                            data-tournament="${echapperHTML(fichier.id)}"
                        >
                            Voir les résultats
                        </button>
                    </div>
                `).join("")}
            </section>
        `)
        .join("");
}


// ========================================
// DÉTAIL D'UN TOURNOI
// ========================================

function afficherResultatsTournoi(fichierId) {
    const fichier = fichiersCharges.find(
        f => String(f.id) === String(fichierId)
    );

    if (!fichier) {
        $("#detailTournoi").innerHTML = `
            <p class="empty-state">Tournoi introuvable.</p>
        `;
        return;
    }

    const joueurs = [
        ...(resultatsParFichier.get(fichier.id) || [])
    ].sort((a, b) => a.rank - b.rank);

    const horsClassement = !participeAuClassement(fichier);

    $("#detailTournoi").innerHTML = `
        <h3>${echapperHTML(nomFichier(fichier))}</h3>

        <p>
            Date : ${formaterDate(fichier.date)}
            — Format : ${echapperHTML(nomFormat(fichier.type))}
        </p>

        ${horsClassement ? `
            <p class="notice">
                Événement hors classement officiel.
            </p>
        ` : ""}

        ${joueurs.length ? `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Place</th>
                            <th>Joueur</th>
                            <th>Points</th>
                            <th>Kills / Hitman</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${joueurs.map(joueur => `
                            <tr>
                                <td>${joueur.rank}</td>
                                <td>${lienJoueur(joueur.name)}</td>
                                <td>${joueur.points}</td>
                                <td>${echapperHTML(joueur.hitman)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        ` : `
            <p class="empty-state">
                Aucun résultat pour ce tournoi.
            </p>
        `}
    `;

    $("#detailTournoi").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ========================================
// HISTORIQUE PAR JOUEUR
// ========================================

function afficherHistoriqueJoueur(nom) {
    if (!nom) {
        $("#historiqueJoueur").innerHTML = `
            <p class="empty-state">
                Sélectionne un joueur pour consulter ses résultats.
            </p>
        `;
        return;
    }

    // Seuls les adhérents peuvent avoir un historique affiché.
    if (!adherents.includes(nom)) {
        $("#historiqueJoueur").innerHTML = `
            <p class="empty-state">
                Ce joueur ne figure pas dans la liste des adhérents.
            </p>
        `;
        return;
    }

    const historique = tousLesResultats
        .filter(resultat => resultat.name === nom)
        .sort((a, b) =>
            b.date.localeCompare(a.date) ||
            a.rank - b.rank
        );

    if (!historique.length) {
        $("#historiqueJoueur").innerHTML = `
            <h3>${echapperHTML(nom)}</h3>

            <p class="empty-state">
                Aucun résultat trouvé pour cet adhérent.
            </p>
        `;
        return;
    }

    $("#historiqueJoueur").innerHTML = `
        <h3>Historique de ${echapperHTML(nom)}</h3>

        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Nom du tournoi</th>
                        <th>Format</th>
                        <th>Place</th>
                        <th>Points</th>
                        <th>Nombre de kills</th>
                    </tr>
                </thead>

                <tbody>
                    ${historique.map(resultat => {
                        const kills = resultat.hitman === nom ? 1 : 0;

                        const fichier = fichiersCharges.find(
                            f => String(f.id) === String(resultat.fichierId)
                        );

                        return `
                            <tr>
                                <td>${formaterDate(resultat.date)}</td>
                                <td>
                                    ${echapperHTML(
                                        fichier ? nomFichier(fichier) : resultat.fichier
                                    )}
                                </td>
                                <td>${echapperHTML(nomFormat(resultat.type))}</td>
                                <td>${resultat.rank}</td>
                                <td>${resultat.points}</td>
                                <td>${kills}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function remplirSelectionJoueurs() {
    const noms = [...adherents].sort(comparerNoms);

    $("#selectionJoueur").innerHTML = `
        <option value="">Sélectionner un joueur</option>

        ${noms.map(nom => `
            <option value="${echapperHTML(nom)}">
                ${echapperHTML(nom)}
            </option>
        `).join("")}
    `;
}

function afficherJoueursFiltres() {
    const recherche = $("#rechercheJoueur")
        .value
        .trim()
        .toLocaleLowerCase("fr");

    const select = $("#selectionJoueur");
    const selectionActuelle = select.value;

    const noms = adherents
        .filter(nom =>
            nom.toLocaleLowerCase("fr").includes(recherche)
        )
        .sort(comparerNoms);

    select.innerHTML = `
        <option value="">Sélectionner un joueur</option>

        ${noms.map(nom => `
            <option value="${echapperHTML(nom)}">
                ${echapperHTML(nom)}
            </option>
        `).join("")}
    `;

    if (noms.includes(selectionActuelle)) {
        select.value = selectionActuelle;
    } else {
        select.value = "";
        afficherHistoriqueJoueur("");
    }
}

function ouvrirHistorique(nom) {
    if (!adherents.includes(nom)) {
        return;
    }

    activerVue("joueurs");

    $("#rechercheJoueur").value = "";
    afficherJoueursFiltres();

    $("#selectionJoueur").value = nom;
    afficherHistoriqueJoueur(nom);

    $("#view-joueurs").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ========================================
// NAVIGATION
// ========================================

function activerVue(nomVue) {
    document.querySelectorAll(".tab").forEach(tab => {
        const actif = tab.dataset.view === nomVue;

        tab.classList.toggle("active", actif);
        tab.setAttribute("aria-selected", String(actif));
    });

    document.querySelectorAll(".view").forEach(view => {
        view.classList.toggle(
            "active",
            view.id === `view-${nomVue}`
        );
    });
}


// ========================================
// ÉVÉNEMENTS
// ========================================

function connecterEvenements() {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            activerVue(tab.dataset.view);
        });
    });

    document.querySelectorAll("[data-category]").forEach(bouton => {
        bouton.addEventListener("click", () => {
            activerCategorieClassement(bouton.dataset.category);
        });
    });

    document.querySelectorAll("[data-format]").forEach(bouton => {
        bouton.addEventListener("click", () => {
            activerFormatTournoi(bouton.dataset.format);
        });
    });

    $("#dateDebutFiltre").addEventListener(
        "change",
        afficherListeTournois
    );

    $("#dateFinFiltre").addEventListener(
        "change",
        afficherListeTournois
    );

    $("#effacerFiltres").addEventListener("click", () => {
        $("#dateDebutFiltre").value = "";
        $("#dateFinFiltre").value = "";

        afficherListeTournois();
    });

    $("#rechercheJoueur").addEventListener(
        "input",
        afficherJoueursFiltres
    );

    $("#selectionJoueur").addEventListener(
        "change",
        () => afficherHistoriqueJoueur($("#selectionJoueur").value)
    );

    $("#selectionPeriode").addEventListener(
        "change",
        afficherClassementPeriode
    );

    document.addEventListener("click", event => {
        const joueur = event.target.closest("[data-player]");

        if (joueur) {
            ouvrirHistorique(joueur.dataset.player);
            return;
        }

        const tournoi = event.target.closest("[data-tournament]");

        if (tournoi) {
            afficherResultatsTournoi(tournoi.dataset.tournament);
        }
    });
}


// ========================================
// CHARGEMENT INITIAL
// ========================================

async function chargerResultats() {
    try {
        $("#message").innerHTML = `
            <p class="notice">Chargement des résultats…</p>
        `;

        adherents = await chargerAdherents();

        const reponse = await fetch("data/fichiers.json");

        if (!reponse.ok) {
            throw new Error(
                "Impossible de charger data/fichiers.json"
            );
        }

        fichiersCharges = await reponse.json();

        resultatsParFichier = new Map();
        tousLesResultats = [];

        for (const fichier of fichiersCharges) {
            const resultats = await chargerCSV(fichier);

            resultatsParFichier.set(fichier.id, resultats);
            tousLesResultats.push(...resultats);
        }

        $("#message").innerHTML = "";

        afficherClassementGeneral();

        initialiserPeriodes();
        afficherClassementPeriode();

        remplirSelectionJoueurs();
        afficherHistoriqueJoueur("");

        afficherListeTournois();

        connecterEvenements();

    } catch (erreur) {
        console.error("Erreur de chargement :", erreur);

        $("#message").innerHTML = `
            <p class="notice error">
                Impossible de charger les résultats.
                Vérifie les fichiers CSV et data/fichiers.json,
                puis consulte la console pour plus de détails.
            </p>
        `;
    }
}

chargerResultats();