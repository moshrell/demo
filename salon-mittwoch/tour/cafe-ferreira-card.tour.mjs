// Tomás Ferreira: Name aus Azulejo-Kacheln, Karte mit Kompass (Stärke × Milch), Bestellen, DE/PT. ~16 s
export const meta = {};
export default async function tour(t) {
  await t.hold(3.0);                                              // Kacheln setzen den Namen
  await t.scroll('#karte', 1.0, {offset: 60});
  await t.tap('.opt[data-axis="s"][data-v="3"]', {move: 0.6, after: 1.0});
  await t.tap('.opt[data-axis="m"][data-v="1.5"]', {move: 0.4, after: 1.6});   // Kompass zeigt den Treffer
  await t.scroll('#bestellen', 1.0, {offset: 60});
  await t.tap('.card', {idx: 0, move: 0.5, after: 0.5});
  await t.tap('.card', {idx: 1, move: 0.4, after: 0.8});
  await t.tap('[data-lang="pt"]', {move: 0.5, after: 1.6});
}
