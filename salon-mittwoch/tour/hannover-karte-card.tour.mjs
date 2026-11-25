// Hannover bei Nacht (Karte): Start am Neuen Rathaus, näher heranzoomen, Rathaus öffnen — Abendlicht geht an, dann nächstes Haus. ~16 s
export const meta = {};

export default async function tour(t) {
  await t.scroll('#map', 0.8, {offset: 70});
  await t.hold(1.0);                                                    // Karte startet am Rathaus
  await t.tap('#zin', {move: 0.6, after: 0.9});                         // näher
  await t.tap('#zin', {move: 0.2, after: 1.2});
  await t.tap('.km-pin[data-n*="Rathaus"]', {move: 0.7, after: 4.5});   // Detail: Zeichnung, Abendlicht geht an
  await t.tap('#detail-next', {move: 0.6, after: 2.2});                 // nächstes Haus
  await t.tap('#detail-close', {move: 0.5, after: 1.2});
}
