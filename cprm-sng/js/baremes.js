export const CATEGORIES = [
  { id: "sng", label: "SnG" },
  { id: "sngTurbo", label: "SnG turbo" },
  { id: "cash", label: "Cash" }
];

// Exemple de départ pour 6 joueurs ; à adapter au barème officiel du CPRM.
const rankValues = [1000, 700, 500, 300, 200, 100, 0, 0, 0, 0];
const sixPlayerConfig = {
  killPoints: 0,
  ranks: rankValues.map(value => ({ type: "fixed", value }))
};
export const DEFAULT_SCORING = {
  sng: { byPlayerCount: { "6": structuredClone(sixPlayerConfig) } },
  sngTurbo: { byPlayerCount: { "6": structuredClone(sixPlayerConfig) } },
  cash: {}
};
