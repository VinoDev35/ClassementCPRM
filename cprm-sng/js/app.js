import { CATEGORIES, DEFAULT_SCORING } from "./baremes.js";
import { downloadTableCSV, calculatePoints } from "./export.js";

const STORAGE_KEY = "cprm-sng-session-v2";
const $ = selector => document.querySelector(selector);
let adherents = [];
const today = () => new Date().toISOString().slice(0, 10);
function uid() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }
function emptyPlayer() { return { id: uid(), name: "", rank: "", hitman: "", caves: 1, cashPoints: "" }; }
function defaultRankRules() { return Array.from({ length: 10 }, (_, i) => ({ type: "fixed", value: [1000,700,500,300,200,100,0,0,0,0][i] })); }
function defaultPlayerCountScoring() { return { killPoints: 0, ranks: defaultRankRules() }; }
function freshState() {
  const scoring = structuredClone(DEFAULT_SCORING);
  for (const id of ["sng", "sngTurbo"]) scoring[id] = { byPlayerCount: { "6": defaultPlayerCountScoring() } };
  return { exportDate: today(), formats: [{ id: uid(), name: "SnG 1", category: "sng", playerCount: 6, tableCount: 1, selected: [] }], tables: [], scoring };
}
function normalizeScoring(incoming, category) {
  if (category === "cash") return { ...(incoming || {}) };
  if (incoming?.byPlayerCount) {
    const byPlayerCount = {};
    for (const [count, config] of Object.entries(incoming.byPlayerCount)) {
      byPlayerCount[count] = {
        killPoints: Number(config.killPoints) || 0,
        ranks: Array.from({ length: 10 }, (_, i) => config.ranks?.[i] ? { type: config.ranks[i].type === "perPlayer" ? "perPlayer" : "fixed", value: Number(config.ranks[i].value) || 0 } : defaultRankRules()[i])
      };
    }
    if (!Object.keys(byPlayerCount).length) byPlayerCount["6"] = defaultPlayerCountScoring();
    return { byPlayerCount };
  }
  // Migration des anciens barèmes globaux vers le nombre de joueurs indiqué.
  const oldRanks = Array.isArray(incoming?.ranks) ? incoming.ranks : null;
  return { byPlayerCount: { "6": {
    killPoints: Number(incoming?.killPoints) || 0,
    ranks: oldRanks ? Array.from({length:10},(_,i)=>oldRanks[i] ? {type:oldRanks[i].type==="perPlayer"?"perPlayer":"fixed",value:Number(oldRanks[i].value)||0} : defaultRankRules()[i]) : defaultRankRules()
  } } };
}
function normalizeState(value) {
  const base = freshState();
  const scoring = {};
  for (const c of CATEGORIES) scoring[c.id] = normalizeScoring(value.scoring?.[c.id], c.id);
  return {
    exportDate: value.exportDate || today(),
    formats: Array.isArray(value.formats) && value.formats.length ? value.formats : base.formats,
    tables: Array.isArray(value.tables) ? value.tables.map(table => ({ ...table, players: Array.from({ length: 10 }, (_, i) => ({ ...emptyPlayer(), ...(table.players?.[i] || {}) })) })) : [],
    scoring,
    scoringEditorCount: value.scoringEditorCount || { sng: "6", sngTurbo: "6" }
  };
}
let state;
function loadState() { try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return normalizeState(JSON.parse(raw)); } catch (e) { console.warn(e); } return freshState(); }
state = loadState();
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); const el = $("#save-status"); if (el) el.textContent = `Sauvegardé à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; } catch { toast("Sauvegarde locale impossible. Télécharge une sauvegarde de secours."); } }
function toast(message) { const node = $("#toast"); node.textContent = message; node.style.display = "block"; clearTimeout(toast.timer); toast.timer = setTimeout(() => node.style.display = "none", 3600); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function categoryOptions(selected) { return CATEGORIES.map(c => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.label}</option>`).join(""); }
function memberOptions(selected = "", names = adherents, placeholder = "— Choisir un adhérent —") { return `<option value="">${placeholder}</option>${names.map(n => `<option value="${esc(n)}" ${n === selected ? "selected" : ""}>${esc(n)}</option>`).join("")}`; }
function setView(view) { document.querySelectorAll(".view").forEach(s => s.classList.toggle("hidden", s.id !== `view-${view}`)); document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === view)); if (view === "tables") renderTables(); if (view === "summary") renderSummary(); }
function renderFormats() {
  $("#format-count").value = state.formats.length;
  $("#formats-config").innerHTML = `<div class="format-grid">${state.formats.map((f, ix) => {
    const count = Math.max(1, Math.min(100, Number(f.playerCount) || 1));
    f.selected = Array.from({ length: count }, (_, i) => f.selected?.[i] || "");
    return `<article class="format-card" data-format-id="${f.id}"><h3>Format ${ix + 1}</h3><div class="field-grid"><label class="field-label">Nom du jeu<input data-format-field="name" value="${esc(f.name)}" maxlength="60"></label><label class="field-label">Catégorie<select data-format-field="category">${categoryOptions(f.category)}</select></label><label class="field-label">Joueurs à répartir<input data-format-field="playerCount" type="number" min="1" max="100" value="${count}"></label><label class="field-label">Nombre de tables<input data-format-field="tableCount" type="number" min="1" max="20" value="${Math.max(1, Number(f.tableCount) || 1)}"></label></div><div class="player-picks">${f.selected.map((n, i) => `<label><select aria-label="Adhérent ${i + 1}" data-player-index="${i}">${memberOptions(n)}</select></label>`).join("")}</div></article>`;
  }).join("")}</div>`;
}
function getScoringConfig(category, count, create = false) {
  const c = state.scoring[category];
  if (!c.byPlayerCount) c.byPlayerCount = {};
  if (!c.byPlayerCount[count] && create) c.byPlayerCount[count] = defaultPlayerCountScoring();
  return c.byPlayerCount[count];
}
function renderScoring() {
  $("#scoring-config").innerHTML = ["sng","sngTurbo"].map(id => {
    const label = CATEGORIES.find(c=>c.id===id).label;
    const config = state.scoring[id];
    const chosen = String(state.scoringEditorCount?.[id] || Object.keys(config.byPlayerCount)[0] || "6");
    const counts = [...new Set([...Object.keys(config.byPlayerCount), ...Array.from({length:9},(_,i)=>String(i+2))])].sort((a,b)=>Number(a)-Number(b));
    const current = config.byPlayerCount[chosen];
    return `<div class="scoring-category" data-scoring-category="${id}"><h4>${label}</h4><div class="scoring-count-controls"><label class="field-label">Nombre de joueurs<select data-editor-count="${id}">${counts.map(n=>`<option value="${n}" ${n===chosen?"selected":""}>${n} joueurs${config.byPlayerCount[n]?"":" (à configurer)"}</option>`).join("")}</select></label><button class="button secondary small" type="button" data-action="add-scoring-count" data-category="${id}" data-count="${chosen}">${current?"Barème configuré":"Créer ce barème"}</button></div>${current ? `<label class="field-label">Points par kill<input type="number" min="0" step="1" data-kill-points value="${Number(current.killPoints)||0}"></label><div class="rank-rules">${current.ranks.map((rule,i)=>`<div class="rank-rule"><span>Place ${i+1}</span><select data-rank-type="${i}" aria-label="Type de points place ${i+1}"><option value="fixed" ${rule.type==="fixed"?"selected":""}>Points fixes</option><option value="perPlayer" ${rule.type==="perPlayer"?"selected":""}>Points × joueurs</option></select><input aria-label="Valeur place ${i+1}" type="number" min="0" step="1" data-rank-value="${i}" value="${Number(rule.value)||0}"></div>`).join("")}</div><button class="button secondary small" type="button" data-action="remove-scoring-count" data-category="${id}" data-count="${chosen}">Supprimer ce barème</button>`:`<p class="hint">Aucun barème n'est encore défini pour ${chosen} joueurs. Clique sur « Créer ce barème » pour le configurer.</p>`}</div>`;
  }).join("") + `<div class="scoring-category"><h4>Cash</h4><p class="hint">Points saisis manuellement pour chaque joueur. Une deuxième cave entraîne un malus de 100 points.</p></div>`;
}
function shuffle(items) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makePlayers(names = []) { const p = Array.from({ length: 10 }, emptyPlayer); names.forEach((name, i) => { if (p[i]) p[i].name = name; }); return p; }
function generateTables() {
  const created = [];
  for (const f of state.formats) {
    const count = Number(f.playerCount), tableCount = Number(f.tableCount), selected = (f.selected || []).slice(0, count).filter(Boolean);
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(tableCount) || tableCount < 1) return toast(`Vérifie les nombres pour ${f.name}.`);
    if (selected.length !== count) return toast(`Sélectionne ${count} joueurs pour ${f.name} (actuellement ${selected.length}).`);
    if (new Set(selected).size !== selected.length) return toast(`Un adhérent est sélectionné plusieurs fois dans ${f.name}.`);
    if (selected.length > tableCount * 10) return toast(`${f.name} dépasse la capacité maximale des tables.`);
    const groups = Array.from({ length: tableCount }, () => []); shuffle(selected).forEach((n, i) => groups[i % tableCount].push(n));
    groups.forEach((names, i) => created.push({ id: uid(), name: `${f.name} - Table ${i + 1}`, formatName: f.name, category: f.category, manual: false, players: makePlayers(names) }));
  }
  state.tables = created; saveState(); renderTables(); setView("tables"); toast("Tables générées.");
}
function visiblePlayers(table) { const occupied = table.players.filter(p => p.name); const firstEmpty = table.players.find(p => !p.name); return firstEmpty ? [...occupied, firstEmpty] : occupied; }
function renderTables() {
  const root = $("#tables-list");
  if (!state.tables.length) { root.innerHTML = '<div class="panel"><p>Aucune table. Configure les formats puis génère les SnG, ou ajoute une table manuelle.</p></div>'; return; }
  root.innerHTML = `<div class="tables-grid">${state.tables.map(table => {
    table.players ||= makePlayers(); const present = table.players.filter(p => p.name); const options = [...new Set([...adherents, ...present.map(p => p.name)])].sort((a,b) => a.localeCompare(b,"fr")); const cash = table.category === "cash"; const displayed = visiblePlayers(table);
    const sumCash = present.reduce((sum,p) => sum + (Number(p.cashPoints) || 0), 0); const expected = present.length * 100;
    return `<article class="table-card" data-table-id="${table.id}"><div class="table-title"><h3>${esc(table.name)} <span class="table-meta">· ${present.length}/10</span></h3><div class="table-actions"><button class="button secondary small" data-action="add-player">+ Joueur</button><button class="button danger small" data-action="remove-table">Supprimer</button></div></div>
    <div class="table-settings"><label>Nom<input data-table-field="name" value="${esc(table.name)}" maxlength="80"></label><label>Catégorie<select data-table-field="category">${categoryOptions(table.category)}</select></label></div>
    ${cash ? `<div class="cash-check ${sumCash === expected ? "valid" : "invalid"}">Points : <strong>${sumCash}</strong> / ${expected}</div>` : ""}
    <div class="player-list">${displayed.map((p, ix) => {
      const occupied = Boolean(p.name); const maxRank = Math.max(1, present.length); const earned = cash ? ((Number(p.cashPoints)||0) - (Number(p.caves) === 2 ? 100 : 0)) : calculatePoints(table,p,state.scoring);
      return `<div class="player-row ${occupied ? "occupied" : "empty-seat"}" data-player-id="${p.id}"><span class="seat">${occupied ? ix + 1 : `+${present.length + 1}`}</span><label class="player-name"><select aria-label="Joueur" data-player-field="name">${memberOptions(p.name, options)}</select></label>${cash ? `<label><select aria-label="Caves" data-player-field="caves"><option value="1" ${Number(p.caves)!==2?"selected":""}>1 cave</option><option value="2" ${Number(p.caves)===2?"selected":""}>2 caves (−100)</option></select></label><label><input aria-label="Points saisis" data-player-field="cashPoints" type="number" step="0.25" value="${esc(p.cashPoints)}" ${occupied?"":"disabled"}></label><div class="points-output"><strong>${occupied ? earned : "—"}</strong></div>` : `<label><select aria-label="Place finale" data-player-field="rank" ${occupied?"":"disabled"}><option value="">Place…</option>${Array.from({length:maxRank},(_,i)=>i+1).map(n=>`<option value="${n}" ${String(n)===String(p.rank)?"selected":""}>${n}</option>`).join("")}</select></label><label><select aria-label="Hitman" data-player-field="hitman" ${occupied?"":"disabled"}>${memberOptions(p.hitman, present.map(other => other.name).filter(n => n !== p.name || Number(p.rank) === 1), "Hitman…")}</select></label><div class="points-output"><strong>${occupied ? earned : "—"}</strong></div>`}</div>`;
    }).join("")}</div></article>`;
  }).join("")}</div>`;
}
function addManualTable() { state.tables.push({ id: uid(), name: `Table manuelle ${state.tables.filter(t=>t.manual).length+1}`, formatName: "Table manuelle", category: "sng", manual: true, players: makePlayers() }); saveState(); renderTables(); toast("Table manuelle ajoutée."); }
function validate() {
  const errors = [];
  state.tables.forEach(table => {
    const players = table.players.filter(p => p.name);
    if (!players.length) { errors.push(`${table.name} : aucun joueur renseigné.`); return; }
    if (new Set(players.map(p=>p.name)).size !== players.length) errors.push(`${table.name} : un joueur apparaît plusieurs fois.`);
    if (table.category === "cash") {
      if (players.some(p => p.cashPoints === "" || !Number.isFinite(Number(p.cashPoints)))) errors.push(`${table.name} : des points cash manquent.`);
      const sum = players.reduce((s,p)=>s+(Number(p.cashPoints)||0),0);
      if (sum !== players.length*100) errors.push(`${table.name} : le total saisi est ${sum}, attendu ${players.length*100} points.`);
      if (players.some(p => ![1,2].includes(Number(p.caves)))) errors.push(`${table.name} : indique 1 ou 2 caves pour chaque joueur.`);
      return;
    }
    if (!getScoringConfig(table.category, players.length)) errors.push(`${table.name} : aucun barème défini pour ${players.length} joueurs.`);
    if (players.some(p=>!p.rank)) errors.push(`${table.name} : une ou plusieurs places finales manquent.`);
    const ranks=players.map(p=>p.rank).filter(Boolean); if (new Set(ranks).size !== ranks.length) errors.push(`${table.name} : une place finale est attribuée plusieurs fois.`);
    if (players.some(p=>!p.hitman)) errors.push(`${table.name} : un ou plusieurs Hitman manquent.`);
    if (players.some(p=>p.rank && Number(p.rank)>players.length)) errors.push(`${table.name} : une place dépasse le nombre de joueurs.`);
    if (players.some(p=>p.hitman && !players.some(other=>other.name===p.hitman))) errors.push(`${table.name} : un Hitman ne fait pas partie des joueurs de la table.`);
    if (players.some(p=>Number(p.rank)===1 && p.hitman!==p.name)) errors.push(`${table.name} : le vainqueur doit être son propre Hitman.`);
  });
  if (!state.tables.length) errors.push("Aucune table n'a été créée."); return errors;
}
function renderSummary() {
  const errors=validate(), box=$("#validation-message"); box.classList.toggle("errors",errors.length>0);
  box.innerHTML=errors.length?`<strong>Vérification : ${errors.length} point(s) à corriger</strong><ul>${errors.map(e=>`<li>${esc(e)}</li>`).join("")}</ul><p>Retourne dans « Tables et résultats », corrige les lignes concernées puis actualise le contrôle.</p>`:`<strong>Vérification réussie</strong><p>Les résultats sont complets et les totaux cash sont corrects. Tu peux exporter les CSV.</p>`;
  $("#export-csv").disabled=errors.length>0;
  $("#export-date").value=state.exportDate || today();
  $("#summary-content").innerHTML=state.tables.map(t=>{ const players=t.players.filter(p=>p.name); return `<div class="summary-table"><h3>${esc(t.name)} <span class="badge">${players.length} joueur(s)</span></h3><div class="table-scroll"><table><thead><tr><th>Place</th><th>Joueur</th><th>Points</th><th>Hitman</th></tr></thead><tbody>${[...players].sort((a,b)=>Number(a.rank||999)-Number(b.rank||999)).map(p=>`<tr><td>${t.category==="cash"?"—":esc(p.rank||"—")}</td><td>${esc(p.name)}</td><td>${calculatePoints(t,p,state.scoring)}</td><td>${t.category==="cash"?"":esc(p.hitman||"—")}</td></tr>`).join("")}</tbody></table></div></div>`; }).join("") || "<p>Aucun résultat à afficher.</p>";
}
function downloadBackup() { const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),state},null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`CPRM_sauvegarde_${today()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportAll() { const errors=validate(); if(errors.length) return toast("Corrige les erreurs avant l'export."); const date=$("#export-date").value; if(!date) return toast("Choisis la date de la soirée avant l'export."); state.exportDate=date; saveState(); const counts = {}; state.tables.forEach((t,i)=>{ const key = `${t.formatName || t.name}|${t.category}`; counts[key] = (counts[key] || 0) + 1; const tableNumber = counts[key]; setTimeout(()=>downloadTableCSV(t,date.slice(2),tableNumber,state.scoring),i*300); }); toast(`${state.tables.length} export(s) CSV lancé(s). Autorise les téléchargements multiples si nécessaire.`); }

$("#build-formats").addEventListener("click",()=>{ const count=Math.max(1,Math.min(12,Number($("#format-count").value)||1)), old=state.formats; state.formats=Array.from({length:count},(_,i)=>old[i]||{id:uid(),name:`SnG ${i+1}`,category:"sng",playerCount:6,tableCount:1,selected:[]}); state.formats.forEach((f,i)=>{if(!f.name)f.name=`SnG ${i+1}`;}); saveState(); renderFormats(); });
$("#formats-config").addEventListener("change",e=>{ const card=e.target.closest("[data-format-id]"); if(!card)return; const f=state.formats.find(x=>x.id===card.dataset.formatId); if(!f)return; if(e.target.dataset.formatField){const field=e.target.dataset.formatField; f[field]=["playerCount","tableCount"].includes(field)?Math.max(1,Number(e.target.value)||1):e.target.value; if(field==="playerCount")f.selected=Array.from({length:Math.min(100,f[field])},(_,i)=>f.selected?.[i]||""); saveState(); renderFormats();} else if(e.target.dataset.playerIndex!==undefined){f.selected[Number(e.target.dataset.playerIndex)]=e.target.value;saveState();} });
function saveCurrentScoringInputs() {
  document.querySelectorAll("[data-scoring-category]").forEach(node => {
    const id = node.dataset.scoringCategory, count = String(state.scoringEditorCount?.[id] || "6");
    const config = getScoringConfig(id, count, false);
    if (!config) return;
    config.killPoints = Math.max(0, Number(node.querySelector("[data-kill-points]")?.value) || 0);
    config.ranks = [...node.querySelectorAll("[data-rank-value]")].map((input, i) => ({
      type: node.querySelector(`[data-rank-type="${i}"]`).value,
      value: Math.max(0, Number(input.value) || 0)
    }));
  });
}
$("#scoring-config").addEventListener("change",e=>{const id=e.target.dataset.editorCount;if(id){saveCurrentScoringInputs();state.scoringEditorCount ||= {};state.scoringEditorCount[id]=e.target.value;saveState();renderScoring();}});
$("#scoring-config").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;saveCurrentScoringInputs();const id=b.dataset.category,count=b.dataset.count;if(b.dataset.action==="add-scoring-count"){getScoringConfig(id,count,true);state.scoringEditorCount ||= {};state.scoringEditorCount[id]=count;saveState();renderScoring();}if(b.dataset.action==="remove-scoring-count"){if(!confirm(`Supprimer le barème ${count} joueurs pour ${CATEGORIES.find(c=>c.id===id).label} ?`))return;delete state.scoring[id].byPlayerCount[count];state.scoringEditorCount[id]=Object.keys(state.scoring[id].byPlayerCount)[0]||"6";saveState();renderScoring();}});
$("#save-scoring").addEventListener("click",()=>{saveCurrentScoringInputs();saveState();renderTables();renderSummary();toast("Barèmes enregistrés.");});
$("#generate-tables").addEventListener("click",()=>{if(state.tables.length&&!confirm("Remplacer les tables existantes et leurs résultats ?"))return;generateTables();});
$("#tables-list").addEventListener("change",e=>{const tn=e.target.closest("[data-table-id]");if(!tn)return;const t=state.tables.find(x=>x.id===tn.dataset.tableId);if(!t)return;if(e.target.dataset.tableField){t[e.target.dataset.tableField]=e.target.value;saveState();renderTables();return;}const pn=e.target.closest("[data-player-id]");if(!pn)return;const p=t.players.find(x=>x.id===pn.dataset.playerId);if(!p)return;const field=e.target.dataset.playerField;if(field==="name"){p.name=e.target.value;if(!p.name){p.rank="";p.hitman="";p.cashPoints="";}else if(Number(p.rank)===1)p.hitman=p.name;}else {p[field]=e.target.value;if(field==="rank"&&Number(p.rank)===1&&p.name)p.hitman=p.name;else if(field==="rank"&&p.hitman===p.name)p.hitman="";}saveState();renderTables();});
$("#tables-list").addEventListener("input",e=>{if(e.target.dataset.playerField!=="cashPoints")return;const tn=e.target.closest("[data-table-id]"),pn=e.target.closest("[data-player-id]");const t=state.tables.find(x=>x.id===tn?.dataset.tableId),p=t?.players.find(x=>x.id===pn?.dataset.playerId);if(!t||!p)return;p.cashPoints=e.target.value;saveState();const cursor=e.target.selectionStart;renderTables();const replacement=tn.querySelector(`[data-player-id="${p.id}"] input[data-player-field="cashPoints"]`);if(replacement){replacement.focus();replacement.setSelectionRange(cursor,cursor);}});
$("#tables-list").addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;const tn=b.closest("[data-table-id]"),t=state.tables.find(x=>x.id===tn?.dataset.tableId);if(!t)return;if(b.dataset.action==="remove-table"){if(!confirm(`Supprimer « ${t.name} » et ses résultats ?`))return;state.tables=state.tables.filter(x=>x.id!==t.id);saveState();renderTables();}if(b.dataset.action==="add-player"){const empty=t.players.find(p=>!p.name);if(!empty)return toast("Cette table contient déjà 10 joueurs.");tn.querySelector(`[data-player-id="${empty.id}"] select[data-player-field="name"]`)?.focus();toast("Choisis un joueur dans le menu de la place suivante.");}});
$("#add-table").addEventListener("click",addManualTable); $("#refresh-summary").addEventListener("click",()=>{saveState();renderSummary();}); $("#export-csv").addEventListener("click",exportAll); $("#export-date").addEventListener("change",e=>{state.exportDate=e.target.value;saveState();}); $("#download-backup").addEventListener("click",downloadBackup);
$("#restore-backup").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!confirm("Remplacer la soirée actuelle par cette sauvegarde ?"))return;state=normalizeState(parsed.state||parsed);saveState();renderAll();toast("Sauvegarde restaurée.");}catch{toast("Fichier de sauvegarde invalide.");}e.target.value="";});
$("#new-session").addEventListener("click",()=>{if(!confirm("Effacer la soirée et tous les résultats sauvegardés ?"))return;state=freshState();saveState();renderAll();setView("setup");toast("Nouvelle soirée prête.");});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view))); window.addEventListener("beforeunload",saveState);
function renderAll(){renderFormats();renderScoring();renderTables();renderSummary();}
function parseAdherentsCSV(text){
  return text.replace(/^\uFEFF/,"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
    // La liste utilise une seule colonne Name ; accepte aussi les noms entre guillemets.
    let name=line.split(",")[0].trim();
    if(name.startsWith('"')&&name.endsWith('"')) name=name.slice(1,-1).replace(/""/g,'"');
    return name;
  }).filter(name=>name && !/^name$/i.test(name));
}
async function init(){try{const r=await fetch("../csv/adherents.csv");if(!r.ok)throw Error();const data=parseAdherentsCSV(await r.text());adherents=[...new Set(data)].sort((a,b)=>a.localeCompare(b,"fr"));}catch{adherents=[];toast("Impossible de charger data/adherents.csv. Lance le projet avec Live Server.");}renderAll();saveState();}
init();
