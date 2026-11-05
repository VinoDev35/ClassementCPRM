function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function safeFilename(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "JEU";
}
export function downloadTableCSV(table, date, number, scoring) {
  const players = table.players.filter(player => player.name);
  const rows = [["Rank", "Name", "Points", "Hitman"]];
  for (const player of players) {
    rows.push([player.rank || "", player.name, calculatePoints(table, player, scoring), table.category === "cash" ? "" : (player.hitman || "")]);
  }
  const csv = "\uFEFF" + rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${date}_${safeFilename(table.formatName || table.name || table.category)}_${String(number).padStart(2, "0")}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function rankPoints(table, player, scoring) {
  if (table.category === "cash" || !player.rank) return 0;
  const count = table.players.filter(p => p.name).length;
  const category = scoring[table.category];
  const config = category?.byPlayerCount?.[String(count)];
  const rule = config?.ranks?.[Number(player.rank) - 1];
  if (!rule) return 0;
  return Math.round(Number(rule.value || 0) * (rule.type === "perPlayer" ? count : 1));
}
export function killCount(table, player) {
  return table.players.filter(other => other.name && other.id !== player.id && other.hitman === player.name).length;
}
export function calculatePoints(table, player, scoring) {
  if (table.category === "cash") return (Number(player.cashPoints) || 0) - (Number(player.caves) === 2 ? 100 : 0);
  const count = table.players.filter(p => p.name).length;
  const killPoints = Number(scoring[table.category]?.byPlayerCount?.[String(count)]?.killPoints) || 0;
  return rankPoints(table, player, scoring) + killCount(table, player) * killPoints;
}
